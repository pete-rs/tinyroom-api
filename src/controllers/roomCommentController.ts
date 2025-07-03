import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { socketService } from '../services/socketService';
import { getPagination, getPaginationMeta } from '../utils/pagination';
import { NotificationService } from '../services/notificationService';

export const getRoomComments = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { skip, take } = getPagination({ page, limit });

    console.log(`\n💬 [GET ROOM COMMENTS] Request for room ${roomId}, page ${page}, limit ${limit}, user ${req.user?.id}`);

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify user has access to the room
    const participant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: req.user.id,
        },
      },
    });

    if (!participant) {
      throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this room');
    }

    // Get comments with referenced elements
    const [comments, totalCount] = await Promise.all([
      prisma.comment.findMany({
        where: {
          roomId,
          deletedAt: null,
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
          referencedElement: {
            select: {
              id: true,
              type: true,
              content: true,
              imageUrl: true,
              videoUrl: true,
              thumbnailUrl: true,
              audioUrl: true,
              createdBy: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.comment.count({
        where: {
          roomId,
          deletedAt: null,
        },
      }),
    ]);

    const meta = getPaginationMeta(totalCount, page, limit);

    console.log(`💬 [GET ROOM COMMENTS] Found ${comments.length} comments out of ${totalCount} total`);
    console.log(`💬 [GET ROOM COMMENTS] Comments:`, JSON.stringify(comments, null, 2));

    const response = {
      data: comments,
      meta,
    };
    
    console.log(`💬 [GET ROOM COMMENTS] Full response:`, JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    throw error;
  }
};

export const createComment = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { text, referencedElementId } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (!text || text.trim().length === 0) {
      throw new AppError(400, 'INVALID_INPUT', 'Comment text is required');
    }

    if (text.length > 500) {
      throw new AppError(400, 'INVALID_INPUT', 'Comment text must be 500 characters or less');
    }

    // Verify user has access to the room
    const room = await prisma.room.findFirst({
      where: {
        id: roomId,
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        participants: {
          where: {
            userId: {
              not: req.user.id,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                oneSignalPlayerId: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this room');
    }

    // If referencing an element, verify it exists and belongs to the room
    let referencedElementType = null;
    if (referencedElementId) {
      const element = await prisma.element.findFirst({
        where: {
          id: referencedElementId,
          roomId,
          deletedAt: null,
        },
      });

      if (!element) {
        throw new AppError(404, 'NOT_FOUND', 'Referenced element not found');
      }

      referencedElementType = element.type;
    }

    console.log(`\n💬 [CREATE COMMENT] Creating comment in room ${roomId} by user ${req.user.id}`);
    console.log(`💬 [CREATE COMMENT] Text: "${text.trim()}", Referenced element: ${referencedElementId || 'none'}`);

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        roomId,
        userId: req.user.id,
        text: text.trim(),
        referencedElementId,
        referencedElementType,
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
        referencedElement: referencedElementId ? {
          select: {
            id: true,
            type: true,
            content: true,
            imageUrl: true,
            videoUrl: true,
            thumbnailUrl: true,
            audioUrl: true,
            createdBy: true,
          },
        } : undefined,
      },
    });

    console.log(`💬 [CREATE COMMENT] Created comment:`, JSON.stringify(comment, null, 2));

    // Update room's comments updated timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: { commentsUpdatedAt: new Date() },
    });

    // Emit socket event to all users in room
    socketService.getIO()?.to(roomId).emit('comment:new', {
      comment,
      roomId,
    });

    // Send push notifications to other participants
    const notificationPromises = room.participants
      .filter(p => p.user.oneSignalPlayerId)
      .map(p => 
        NotificationService.notifyNewComment(
          p.user.id,
          req.user!.firstName || req.user!.username,
          room.name,
          text.substring(0, 100) // Preview of comment
        )
      );

    // Fire and forget notifications
    Promise.all(notificationPromises).catch(error => {
      console.error('Failed to send comment notifications:', error);
    });

    res.status(201).json({
      data: comment,
    });
  } catch (error) {
    throw error;
  }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get comment to verify ownership
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: {
        room: {
          select: {
            id: true,
            createdBy: true,
          },
        },
      },
    });

    if (!comment) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    // Only comment author or room creator can delete
    if (comment.userId !== req.user.id && comment.room.createdBy !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comments');
    }

    // Soft delete
    await prisma.comment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });

    // Update room's comments updated timestamp
    await prisma.room.update({
      where: { id: comment.roomId },
      data: { commentsUpdatedAt: new Date() },
    });

    // Emit socket event
    socketService.getIO()?.to(comment.roomId).emit('comment:deleted', {
      commentId,
      roomId: comment.roomId,
    });

    res.json({
      data: {
        message: 'Comment deleted successfully',
      },
    });
  } catch (error) {
    throw error;
  }
};