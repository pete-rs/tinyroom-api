import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { userSelect } from '../utils/prismaSelects';
import { socketService } from '../services/socketService';
import { NotificationService } from '../services/notificationService';

export const toggleReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, elementId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify user has access to room
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        OR: [
          {
            participants: {
              some: {
                userId: req.user.id,
              },
            },
          },
          {
            isPublic: true,
          },
        ],
      },
      include: {
        participants: true,
      },
    });

    if (!room) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    // Verify element exists and belongs to this room
    const element = await prisma.element.findFirst({
      where: {
        id: elementId,
        roomId,
        deletedAt: null,
      },
      include: {
        creator: {
          select: userSelect,
        },
      },
    });

    if (!element) {
      throw new AppError(404, 'NOT_FOUND', 'Element not found');
    }

    // Store userId to avoid TypeScript issues in transaction
    const userId = req.user.id;

    // Use a transaction to handle the toggle atomically
    const result = await prisma.$transaction(async (tx) => {
      // Check if user already reacted
      const existingReaction = await tx.elementReaction.findUnique({
        where: {
          elementId_userId: {
            elementId,
            userId,
          },
        },
      });

      if (existingReaction) {
        // Remove reaction
        await tx.elementReaction.delete({
          where: {
            id: existingReaction.id,
          },
        });
        return { action: 'removed' as const, reaction: null };
      } else {
        try {
          // Try to add reaction
          const newReaction = await tx.elementReaction.create({
            data: {
              elementId,
              userId,
              type: 'HEART',
            },
            include: {
              user: {
                select: userSelect,
              },
            },
          });
          return { action: 'added' as const, reaction: newReaction };
        } catch (error: any) {
          // If we get a unique constraint error, it means the reaction was just added
          // (likely by the socket handler), so we should fetch it and return as added
          if (error.code === 'P2002') {
            const existingReaction = await tx.elementReaction.findUnique({
              where: {
                elementId_userId: {
                  elementId,
                  userId,
                },
              },
              include: {
                user: {
                  select: userSelect,
                },
              },
            });
            return { action: 'added' as const, reaction: existingReaction };
          }
          throw error;
        }
      }
    });

    const { action, reaction } = result;

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
      hasReacted: action === 'added',
      topReactors: topReactors.map(r => r.user),
    };

    // Prepare response
    const response = {
      data: {
        action,
        reaction: reaction ? {
          id: reaction.id,
          elementId: reaction.elementId,
          userId: reaction.userId,
          type: 'heart',
          createdAt: reaction.createdAt,
          user: reaction.user,
        } : null,
        elementStats,
      },
    };

    // Send response immediately
    res.json(response);

    // Handle background tasks
    setImmediate(async () => {
      try {
        // Emit socket events
        if (action === 'added' && reaction) {
          socketService.emitToRoom(roomId, 'element:reaction:added', {
            elementId,
            reaction: {
              userId: reaction.userId,
              type: 'heart',
              user: reaction.user,
            },
            stats: {
              totalCount: totalReactions,
              topReactors: topReactors.map(r => r.user),
            },
          });

          // Send push notification (not for self-reactions)
          if (element.createdBy !== req.user!.id) {
            await NotificationService.notifyElementReaction(
              req.user!.firstName || req.user!.username,
              element.createdBy,
              roomId,
              room.name,
              element.type.toLowerCase() as 'note' | 'photo' | 'audio' | 'video' | 'link',
              totalReactions
            );
          }
        } else {
          socketService.emitToRoom(roomId, 'element:reaction:removed', {
            elementId,
            userId: req.user!.id,
            type: 'heart',
            stats: {
              totalCount: totalReactions,
              topReactors: topReactors.map(r => r.user),
            },
          });
        }
      } catch (error) {
        console.error('Error in reaction background tasks:', error);
      }
    });
  } catch (error) {
    throw error;
  }
};

export const getElementReactions = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId, elementId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify user has access to room
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        OR: [
          {
            participants: {
              some: {
                userId: req.user.id,
              },
            },
          },
          {
            isPublic: true,
          },
        ],
      },
    });

    if (!room) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    // Get all reactions for the element
    const reactions = await prisma.elementReaction.findMany({
      where: {
        elementId,
        element: {
          roomId,
          deletedAt: null,
        },
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

    res.json({
      data: {
        reactions: reactions.map(r => ({
          id: r.id,
          userId: r.user.id,
          name: r.user.firstName,
          avatarUrl: r.user.avatarUrl,
          username: r.user.username,
          reactedAt: r.createdAt,
          reaction: '❤️', // Currently only heart, will expand later
          type: 'heart', // API type for programmatic use
        })),
        total: reactions.length,
        hasReacted,
      },
    });
  } catch (error) {
    throw error;
  }
};