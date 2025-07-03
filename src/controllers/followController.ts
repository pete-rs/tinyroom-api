import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { NotificationService } from '../services/notificationService';
import { userSelect } from '../utils/prismaSelects';

/**
 * Follow a user
 * POST /api/users/:userId/follow
 */
export const followUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (userId === req.user.id) {
      throw new AppError(400, 'INVALID_REQUEST', 'You cannot follow yourself');
    }

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, username: true },
    });

    if (!targetUser) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    // Check if already following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: userId,
        },
      },
    });

    if (existingFollow) {
      throw new AppError(400, 'ALREADY_FOLLOWING', 'You are already following this user');
    }

    // Create follow relationship
    await prisma.follow.create({
      data: {
        followerId: req.user.id,
        followingId: userId,
      },
    });

    // Get updated counts
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { followersCount: true },
    });

    // Send notification
    setImmediate(() => {
      NotificationService.notifyUserFollowed(
        req.user!.firstName || req.user!.username,
        userId
      ).catch(err => {
        console.error('❌ Failed to send follow notification:', err);
      });
    });

    res.json({
      data: {
        following: true,
        followersCount: updatedUser?.followersCount || 0,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Unfollow a user
 * DELETE /api/users/:userId/follow
 */
export const unfollowUser = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Check if following
    const existingFollow = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: req.user.id,
          followingId: userId,
        },
      },
    });

    if (!existingFollow) {
      throw new AppError(400, 'NOT_FOLLOWING', 'You are not following this user');
    }

    // Delete follow relationship
    await prisma.follow.delete({
      where: { id: existingFollow.id },
    });

    // Get updated counts
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { followersCount: true },
    });

    res.json({
      data: {
        following: false,
        followersCount: updatedUser?.followersCount || 0,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get followers of a user
 * GET /api/users/:userId/followers
 */
export const getFollowers = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get followers with follow status
    const [followers, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followingId: userId },
        include: {
          follower: {
            select: {
              ...userSelect,
              followersCount: true,
              followingCount: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.follow.count({
        where: { followingId: userId },
      }),
    ]);

    // Check if current user follows each follower
    const followerIds = followers.map(f => f.follower.id);
    const currentUserFollows = await prisma.follow.findMany({
      where: {
        followerId: req.user.id,
        followingId: { in: followerIds },
      },
      select: { followingId: true },
    });

    const followingSet = new Set(currentUserFollows.map(f => f.followingId));

    const followersWithStatus = followers.map(f => ({
      ...f.follower,
      following: followingSet.has(f.follower.id),
      followsMe: true, // They follow the profile being viewed
    }));

    res.json({
      data: followersWithStatus,
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

/**
 * Get users that a user is following
 * GET /api/users/:userId/following
 */
export const getFollowing = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get following with follow status
    const [following, total] = await Promise.all([
      prisma.follow.findMany({
        where: { followerId: userId },
        include: {
          following: {
            select: {
              ...userSelect,
              followersCount: true,
              followingCount: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.follow.count({
        where: { followerId: userId },
      }),
    ]);

    // Check if current user follows each user
    const followingIds = following.map(f => f.following.id);
    const currentUserFollows = await prisma.follow.findMany({
      where: {
        followerId: req.user.id,
        followingId: { in: followingIds },
      },
      select: { followingId: true },
    });

    // Check if they follow current user back
    const followsBack = await prisma.follow.findMany({
      where: {
        followerId: { in: followingIds },
        followingId: req.user.id,
      },
      select: { followerId: true },
    });

    const followingSet = new Set(currentUserFollows.map(f => f.followingId));
    const followsBackSet = new Set(followsBack.map(f => f.followerId));

    const followingWithStatus = following.map(f => ({
      ...f.following,
      following: followingSet.has(f.following.id),
      followsMe: followsBackSet.has(f.following.id),
    }));

    res.json({
      data: followingWithStatus,
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

/**
 * Check follow status between current user and another user
 * GET /api/users/:userId/follow-status
 */
export const getFollowStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const [following, followsMe] = await Promise.all([
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

    res.json({
      data: {
        following: !!following,
        followsMe: !!followsMe,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get following feed - all public rooms from users you follow
 * GET /api/following/feed
 */
export const getFollowingFeed = async (req: AuthRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get all public rooms from users the current user follows
    const rooms = await prisma.room.findMany({
      where: {
        isPublic: true,
        creator: {
          followers: {
            some: {
              followerId: req.user.id,
            },
          },
        },
      },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
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
      skip: offset,
      take: limit,
    });

    // Get total count for pagination
    const total = await prisma.room.count({
      where: {
        isPublic: true,
        creator: {
          followers: {
            some: {
              followerId: req.user.id,
            },
          },
        },
      },
    });

    // Transform the data to match My Rooms format
    const transformedRooms = rooms.map(room => ({
      id: room.id,
      name: room.name,
      isPublic: room.isPublic,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
      messagesUpdatedAt: null, // Messages no longer exist
      createdBy: room.createdBy,
      creator: room.creator,
      nameSetBy: room.nameSetBy,
      nameSetByUser: room.nameSetByUser,
      isCreator: room.createdBy === req.user!.id,
      // Transform participants to match My Rooms format (simplified)
      participants: room.participants.map(p => ({
        id: p.user.id,
        username: p.user.username,
        firstName: p.user.firstName,
        avatarUrl: p.user.avatarUrl,
        color: p.color,
        isActive: p.isActive,
      })),
      elementCount: room._count.elements,
      unreadCount: 0, // Following feed doesn't track unread for non-participants
      hasUnread: false,
      lastVisitedAt: new Date(), // Not applicable for following feed
      badges: {
        messages: 0,
        elements: 0,
      },
    }));

    res.json({
      data: transformedRooms,
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