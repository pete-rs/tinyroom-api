import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { userSelect } from '../utils/prismaSelects';
import { socketService } from '../services/socketService';
import { NotificationService } from '../services/notificationService';

/**
 * Add or update a reaction to an element
 * POST /api/reactions/elements/:elementId
 * Body: { emoji: "❤️" }
 */
export const addReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { elementId } = req.params;
    const { emoji } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (!emoji || typeof emoji !== 'string') {
      throw new AppError(400, 'INVALID_REQUEST', 'Emoji is required');
    }

    // Verify element exists and get room info
    const element = await prisma.element.findFirst({
      where: {
        id: elementId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: userSelect,
        },
        room: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!element) {
      throw new AppError(404, 'NOT_FOUND', 'Element not found');
    }

    // Verify user has access to room
    const isParticipant = element.room.participants.some(p => p.userId === req.user!.id);
    if (!isParticipant && !element.room.isPublic) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    // Store userId to avoid TypeScript issues
    const userId = req.user.id;

    // Check if user already reacted
    const existingReaction = await prisma.elementReaction.findUnique({
      where: {
        elementId_userId: {
          elementId,
          userId,
        },
      },
    });

    let reaction;
    let action: 'added' | 'updated';

    if (existingReaction) {
      // Update existing reaction with new emoji
      reaction = await prisma.elementReaction.update({
        where: {
          id: existingReaction.id,
        },
        data: {
          emoji,
        },
        include: {
          user: {
            select: userSelect,
          },
        },
      });
      action = 'updated';
    } else {
      // Create new reaction
      reaction = await prisma.elementReaction.create({
        data: {
          elementId,
          userId,
          emoji,
        },
        include: {
          user: {
            select: userSelect,
          },
        },
      });
      action = 'added';
    }

    // Get updated stats
    const [totalReactions, topReactors] = await Promise.all([
      prisma.elementReaction.count({
        where: { elementId },
      }),
      prisma.elementReaction.findMany({
        where: { elementId },
        take: 3,
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: userSelect,
          },
        },
      }),
    ]);

    const elementStats = {
      totalReactions,
      hasReacted: true,
      topReactors: topReactors.map(r => ({
        ...r.user,
        emoji: r.emoji,
      })),
    };

    // Prepare response
    const response = {
      data: {
        action,
        reaction: {
          id: reaction.id,
          elementId: reaction.elementId,
          userId: reaction.userId,
          emoji: reaction.emoji,
          createdAt: reaction.createdAt,
          user: reaction.user,
        },
        elementStats,
      },
    };

    // Send response immediately
    res.json(response);

    // Handle background tasks
    setImmediate(async () => {
      try {
        // Emit socket events
        const eventType = action === 'updated' ? 'element:reaction:updated' : 'element:reaction:added';
        socketService.emitToRoom(element.room.id, eventType, {
          elementId,
          reaction: {
            userId: reaction.userId,
            emoji: reaction.emoji,
            user: reaction.user,
          },
          stats: {
            totalCount: totalReactions,
            topReactors: topReactors.map(r => ({
              ...r.user,
              emoji: r.emoji,
            })),
          },
        });

        // Send push notification for new reactions (not for self-reactions or updates)
        if (action === 'added' && element.createdBy !== userId) {
          await NotificationService.notifyElementReaction(
            req.user!.firstName || req.user!.username,
            element.createdBy,
            element.room.id,
            element.room.name,
            element.type.toLowerCase() as 'note' | 'photo' | 'audio' | 'video' | 'link',
            totalReactions
          );
        }
      } catch (error) {
        console.error('Error in reaction background tasks:', error);
      }
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Remove a reaction from an element
 * DELETE /api/reactions/elements/:elementId
 */
export const removeReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { elementId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify element exists and get room info
    const element = await prisma.element.findFirst({
      where: {
        id: elementId,
        deletedAt: null,
      },
      include: {
        room: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!element) {
      throw new AppError(404, 'NOT_FOUND', 'Element not found');
    }

    // Verify user has access to room
    const isParticipant = element.room.participants.some(p => p.userId === req.user!.id);
    if (!isParticipant && !element.room.isPublic) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    const userId = req.user.id;

    // Check if reaction exists
    const existingReaction = await prisma.elementReaction.findUnique({
      where: {
        elementId_userId: {
          elementId,
          userId,
        },
      },
    });

    if (!existingReaction) {
      throw new AppError(404, 'NOT_FOUND', 'Reaction not found');
    }

    // Delete the reaction
    await prisma.elementReaction.delete({
      where: {
        id: existingReaction.id,
      },
    });

    // Get updated stats
    const [totalReactions, topReactors] = await Promise.all([
      prisma.elementReaction.count({
        where: { elementId },
      }),
      prisma.elementReaction.findMany({
        where: { elementId },
        take: 3,
        orderBy: { createdAt: 'asc' },
        include: {
          user: {
            select: userSelect,
          },
        },
      }),
    ]);

    const response = {
      data: {
        message: 'Reaction removed successfully',
        elementStats: {
          totalReactions,
          hasReacted: false,
          topReactors: topReactors.map(r => ({
            ...r.user,
            emoji: r.emoji,
          })),
        },
      },
    };

    // Send response immediately
    res.json(response);

    // Emit socket event in background
    setImmediate(() => {
      socketService.emitToRoom(element.room.id, 'element:reaction:removed', {
        elementId,
        userId,
        stats: {
          totalCount: totalReactions,
          topReactors: topReactors.map(r => ({
            ...r.user,
            emoji: r.emoji,
          })),
        },
      });
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get all reactions for an element
 * GET /api/reactions/elements/:elementId
 */
export const getElementReactions = async (req: AuthRequest, res: Response) => {
  try {
    const { elementId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify element exists and user has access
    const element = await prisma.element.findFirst({
      where: {
        id: elementId,
        deletedAt: null,
      },
      include: {
        room: {
          include: {
            participants: true,
          },
        },
      },
    });

    if (!element) {
      throw new AppError(404, 'NOT_FOUND', 'Element not found');
    }

    // Verify user has access to room
    const isParticipant = element.room.participants.some(p => p.userId === req.user!.id);
    if (!isParticipant && !element.room.isPublic) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    // Get all reactions for the element
    const reactions = await prisma.elementReaction.findMany({
      where: {
        elementId,
      },
      include: {
        user: {
          select: userSelect,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const hasReacted = reactions.some(r => r.userId === req.user!.id);
    const userReaction = reactions.find(r => r.userId === req.user!.id);

    res.json({
      data: {
        reactions: reactions.map(r => ({
          id: r.id,
          userId: r.user.id,
          name: r.user.firstName,
          avatarUrl: r.user.avatarUrl,
          username: r.user.username,
          reactedAt: r.createdAt,
          emoji: r.emoji,
        })),
        total: reactions.length,
        hasReacted,
        userEmoji: userReaction?.emoji || null,
      },
    });
  } catch (error) {
    throw error;
  }
};