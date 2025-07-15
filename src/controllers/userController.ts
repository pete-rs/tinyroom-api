import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { userSelect } from '../utils/prismaSelects';

export const getMe = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Get user with follow counts
    const userWithCounts = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        ...userSelect,
        dateOfBirth: true,
        oneSignalPlayerId: true,
        followersCount: true,
        followingCount: true,
      },
    });

    if (!userWithCounts) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Check if profile is complete
    const profileComplete = userWithCounts.firstName !== '' && 
                          !userWithCounts.username.startsWith('user_') &&
                          userWithCounts.dateOfBirth.getTime() !== new Date(0).getTime();

    res.json({
      data: {
        ...userWithCounts,
        profileComplete,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    console.log('=== UPDATE PROFILE REQUEST ===');
    console.log('User ID:', req.user?.id);
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    let { firstName, dateOfBirth, username, avatarUrl } = req.body;

    if (!req.user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const updateData: any = {};

    // Handle firstName update
    if (firstName !== undefined) {
      firstName = firstName.trim();
      if (firstName.length === 0) {
        throw new AppError(400, 'INVALID_FIRST_NAME', 'First name cannot be empty');
      }
      if (firstName.length > 50) {
        throw new AppError(400, 'INVALID_FIRST_NAME', 'First name must be 50 characters or less');
      }
      updateData.firstName = firstName;
    }

    // Handle dateOfBirth update
    if (dateOfBirth !== undefined) {
      const dob = new Date(dateOfBirth);
      const age = (new Date().getTime() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (age < 13) {
        throw new AppError(400, 'AGE_REQUIREMENT', 'You must be at least 13 years old');
      }
      updateData.dateOfBirth = dob;
    }

    // Handle username update
    if (username !== undefined) {
      username = username.trim();
      
      // Validate username format
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new AppError(400, 'INVALID_USERNAME', 'Username can only contain letters, numbers, and underscores');
      }
      
      // Validate username length
      if (username.length < 3 || username.length > 20) {
        throw new AppError(400, 'INVALID_USERNAME_LENGTH', 'Username must be between 3 and 20 characters');
      }
      
      // Check if username is taken by another user
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });
      
      if (existingUser && existingUser.id !== req.user.id) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username is already taken');
      }
      
      updateData.username = username;
    }

    // Handle avatarUrl update
    if (avatarUrl !== undefined) {
      // Allow null to remove avatar
      updateData.avatarUrl = avatarUrl;
    }

    // Only update if there are changes
    if (Object.keys(updateData).length === 0) {
      console.log('No changes detected, returning current user data');
      const response = {
        data: req.user,
      };
      console.log('=== UPDATE PROFILE RESPONSE (No Changes) ===');
      console.log('Response:', JSON.stringify(response, null, 2));
      return res.json(response);
    }

    console.log('Update data to be applied:', JSON.stringify(updateData, null, 2));
    
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: updateData,
      select: {
        id: true,
        username: true,
        firstName: true,
        email: true,
        avatarUrl: true,
        dateOfBirth: true,
        createdAt: true,
        followersCount: true,
        followingCount: true,
      },
    });

    const response = {
      data: updatedUser,
    };
    
    console.log('=== UPDATE PROFILE RESPONSE ===');
    console.log('Response:', JSON.stringify(response, null, 2));
    
    res.json(response);
  } catch (error) {
    throw error;
  }
};

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!q || typeof q !== 'string') {
      throw new AppError(400, 'INVALID_QUERY', 'Search query parameter (q) is required');
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Search both username and firstName
    const searchPattern = `%${q}%`;
    
    // Use raw query for better control and performance
    const users = await prisma.$queryRaw<Array<{
      id: string;
      username: string;
      first_name: string;
      email: string;
      avatar_url: string | null;
      followers_count: number;
      following_count: number;
      following: boolean;
      follows_me: boolean;
    }>>`
      SELECT 
        u.id,
        u.username,
        u.first_name,
        u.email,
        u.avatar_url,
        u.followers_count,
        u.following_count,
        CASE WHEN f1.id IS NOT NULL THEN true ELSE false END as following,
        CASE WHEN f2.id IS NOT NULL THEN true ELSE false END as follows_me
      FROM users u
      LEFT JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = ${req.user.id}
      LEFT JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = ${req.user.id}
      WHERE 
        u.id != ${req.user.id}
        AND u.first_name != ''
        AND NOT u.username LIKE 'user_%'
        AND (
          LOWER(u.username) LIKE LOWER(${searchPattern})
          OR LOWER(u.first_name) LIKE LOWER(${searchPattern})
        )
      ORDER BY 
        -- Prioritize exact matches
        CASE 
          WHEN LOWER(u.username) = LOWER(${q}) THEN 0
          WHEN LOWER(u.first_name) = LOWER(${q}) THEN 1
          WHEN LOWER(u.username) LIKE LOWER(${q + '%'}) THEN 2
          WHEN LOWER(u.first_name) LIKE LOWER(${q + '%'}) THEN 3
          ELSE 4
        END,
        u.username ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count
    const totalCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM users u
      WHERE 
        u.id != ${req.user.id}
        AND u.first_name != ''
        AND NOT u.username LIKE 'user_%'
        AND (
          LOWER(u.username) LIKE LOWER(${searchPattern})
          OR LOWER(u.first_name) LIKE LOWER(${searchPattern})
        )
    `;

    const total = Number(totalCount[0].count);

    // Transform to camelCase
    const transformedUsers = users.map(user => ({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      followersCount: user.followers_count,
      followingCount: user.following_count,
      following: user.following,
      followsMe: user.follows_me,
    }));

    res.json({
      data: transformedUsers,
      meta: {
        total,
        page,
        limit,
        hasMore: total > offset + limit,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getAllUsers = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    console.log('Getting all users, excluding user:', req.user.id, req.user.username);

    const users = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id, // Exclude current user
        },
        // Only show users with complete profiles
        firstName: {
          not: '',
        },
        NOT: {
          username: {
            startsWith: 'user_',
          },
        },
      },
      select: {
        ...userSelect,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'desc', // Newest users first
      },
    });

    console.log(`Found ${users.length} users with completed profiles`);
    
    // For debugging, let's also check total users
    const totalUsers = await prisma.user.count();
    const incompleteUsers = await prisma.user.count({
      where: {
        username: {
          startsWith: 'user_',
        },
      },
    });
    
    console.log(`Total users in DB: ${totalUsers}, Incomplete profiles: ${incompleteUsers}`);

    res.json({
      data: users,
    });
  } catch (error) {
    throw error;
  }
};

export const updateOneSignalPlayerId = async (req: AuthRequest, res: Response) => {
  try {
    const { playerId } = req.body;

    if (!playerId) {
      throw new AppError(400, 'INVALID_REQUEST', 'playerId is required');
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    await prisma.user.update({
      where: { id: req.user.id },
      data: { oneSignalPlayerId: playerId },
    });

    console.log(`OneSignal player ID updated for user ${req.user.id}: ${playerId}`);

    res.json({
      data: { success: true },
    });
  } catch (error) {
    console.error('Error updating OneSignal player ID:', error);
    throw error;
  }
};

export const getUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get user with follow counts and check follow status
    const [user, following, followsMe] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          ...userSelect,
          followersCount: true,
          followingCount: true,
          createdAt: true,
        },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: req.user.id,
            followingId: userId,
          },
        },
      }),
      prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userId,
            followingId: req.user.id,
          },
        },
      }),
    ]);

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Don't show incomplete profiles
    if (user.firstName === '' || user.username.startsWith('user_')) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    res.json({
      data: {
        ...user,
        following: !!following,
        followsMe: !!followsMe,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getUsersWithoutRooms = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Single optimized query using NOT EXISTS
    const usersWithoutRooms = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id, // Exclude current user
        },
        // Only show users with complete profiles
        firstName: {
          not: '',
        },
        NOT: {
          username: {
            startsWith: 'user_',
          },
        },
        // Exclude users who already have rooms with the current user
        roomParticipants: {
          none: {
            room: {
              participants: {
                some: {
                  userId: req.user.id,
                },
              },
            },
          },
        },
      },
      select: userSelect,
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json({
      data: usersWithoutRooms,
    });
  } catch (error) {
    throw error;
  }
};