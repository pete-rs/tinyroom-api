import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

// Get current user's profile
export const getMyProfile = async (req: AuthRequest, res: Response) => {
  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        firstName: true,
        email: true,
        avatarUrl: true,
        followersCount: true,
        followingCount: true,
        dateOfBirth: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    res.json({
      data: {
        user,
        rooms: [], // No rooms shown on own profile as per requirement
      },
    });
  } catch (error) {
    throw error;
  }
};

// Get another user's profile by username
export const getUserProfile = async (req: AuthRequest, res: Response) => {
  const { username } = req.params;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  if (!username) {
    throw new AppError(400, 'INVALID_USERNAME', 'Username is required');
  }

  try {
    // Get the profile user
    const profileUser = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        firstName: true,
        avatarUrl: true,
        followersCount: true,
        followingCount: true,
        createdAt: true,
      },
    });

    if (!profileUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    console.log(`Profile request: ${req.user.username} viewing ${profileUser.username}'s profile`);
    
    // Check if viewing own profile (redirect to /me/profile)
    if (profileUser.id === req.user.id) {
      console.log('Redirecting to own profile');
      return getMyProfile(req, res);
    }

    // Check if current user is following this user
    const followRelation = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: profileUser.id,
        },
      },
    });
    
    const isFollowing = !!followRelation;

    // Get rooms that should be visible:
    // 1. Public rooms where the profile user is creator OR participant
    // 2. Private rooms where BOTH users are creators OR participants
    const visibleRooms = await prisma.room.findMany({
      where: {
        AND: [
          {
            // Profile user is either creator OR participant
            OR: [
              { createdBy: profileUser.id },
              {
                participants: {
                  some: {
                    userId: profileUser.id,
                    leftAt: null,
                  },
                },
              },
            ],
          },
          {
            OR: [
              // Public rooms
              { isPublic: true },
              // Private rooms where current user is also creator OR participant
              {
                isPublic: false,
                OR: [
                  { createdBy: req.user.id },
                  {
                    participants: {
                      some: {
                        userId: req.user.id,
                        leftAt: null,
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      include: {
        participants: {
          where: {
            leftAt: null, // Only active participants
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                avatarUrl: true,
              },
            },
          },
        },
        _count: {
          select: {
            elements: {
              where: {
                deletedAt: null,
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    console.log(`Found ${visibleRooms.length} visible rooms for user ${profileUser.username}`);
    
    // Transform rooms to match expected format
    const transformedRooms = visibleRooms.map(room => ({
      id: room.id,
      name: room.name,
      isPublic: room.isPublic,
      participantCount: room.participants.length,
      elementCount: room._count.elements,
      lastActivityAt: room.updatedAt,
      participants: room.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        firstName: p.user.firstName,
        avatarUrl: p.user.avatarUrl,
      })),
    }));

    res.json({
      data: {
        user: {
          ...profileUser,
          isFollowing,
        },
        rooms: transformedRooms,
      },
    });
  } catch (error) {
    throw error;
  }
};