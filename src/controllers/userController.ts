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

    // Check if profile is complete
    const profileComplete = req.user.firstName !== '' && 
                          !req.user.username.startsWith('user_') &&
                          req.user.dateOfBirth.getTime() !== new Date(0).getTime();

    res.json({
      data: {
        ...req.user,
        profileComplete,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const updateProfile = async (req: AuthRequest, res: Response) => {
  try {
    let { firstName, dateOfBirth } = req.body;

    if (!req.user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Trim firstName if provided
    if (firstName) {
      firstName = firstName.trim();
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        ...(firstName && { firstName }),
        ...(dateOfBirth && { dateOfBirth: new Date(dateOfBirth) }),
      },
    });

    res.json({
      data: updatedUser,
    });
  } catch (error) {
    throw error;
  }
};

export const searchUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { username } = req.query;

    if (!username || typeof username !== 'string') {
      throw new AppError(400, 'INVALID_QUERY', 'Username query parameter is required');
    }

    const users = await prisma.user.findMany({
      where: {
        username: {
          contains: username,
          mode: 'insensitive',
        },
        id: {
          not: req.user?.id,
        },
      },
      select: userSelect,
      take: 20,
    });

    res.json({
      data: users,
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

export const getUsersWithoutRooms = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // First, get all users who have rooms with the current user
    const usersWithRooms = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id, // Exclude current user
        },
        roomParticipants: {
          some: {
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
      select: {
        id: true,
      },
    });

    const userIdsWithRooms = usersWithRooms.map(u => u.id);

    // Now get all users who don't have rooms with the current user
    const usersWithoutRooms = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id, // Exclude current user
          notIn: userIdsWithRooms, // Exclude users who already have rooms
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