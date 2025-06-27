import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { userSelect } from '../utils/prismaSelects';
import { socketService } from '../services/socketService';
import { NotificationService } from '../services/notificationService';

/**
 * Add a comment to an element
 * POST /api/comments/elements/:elementId
 * Body: { content: "Comment text" }
 */
export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const { elementId } = req.params;
    const { content } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (!content || typeof content !== 'string') {
      throw new AppError(400, 'INVALID_REQUEST', 'Comment content is required');
    }

    if (content.length > 140) {
      throw new AppError(400, 'INVALID_REQUEST', 'Comment must be 140 characters or less');
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

    // Create comment
    const comment = await prisma.elementComment.create({
      data: {
        roomId: element.roomId,
        elementId,
        userId: req.user.id,
        content,
      },
      include: {
        user: {
          select: userSelect,
        },
      },
    });

    // Get updated comment count
    const commentCount = await prisma.elementComment.count({
      where: { 
        elementId,
        deletedAt: null,
      },
    });

    const response = {
      data: {
        comment: {
          id: comment.id,
          elementId: comment.elementId,
          userId: comment.userId,
          content: comment.content,
          createdAt: comment.createdAt,
          user: comment.user,
          likeCount: 0,
          hasLiked: false,
        },
        elementStats: {
          totalComments: commentCount,
        },
      },
    };

    // Send response immediately
    res.json(response);

    // Handle background tasks
    setImmediate(async () => {
      try {
        // Emit socket event
        socketService.emitToRoom(element.room.id, 'element:comment:added', {
          elementId,
          comment: {
            id: comment.id,
            userId: comment.userId,
            content: comment.content,
            createdAt: comment.createdAt,
            user: comment.user,
          },
          stats: {
            totalCount: commentCount,
          },
        });

        // Send push notification to element creator (if not self)
        if (element.createdBy !== req.user!.id) {
          await NotificationService.notifyElementComment(
            req.user!.firstName || req.user!.username,
            element.createdBy,
            element.room.id,
            element.room.name,
            element.type.toLowerCase() as 'note' | 'photo' | 'audio' | 'video' | 'link',
            content
          );
        }
      } catch (error) {
        console.error('Error in comment background tasks:', error);
      }
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get comments for an element with pagination
 * GET /api/comments/elements/:elementId?page=1&limit=20
 */
export const getElementComments = async (req: AuthRequest, res: Response) => {
  try {
    const { elementId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

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

    // Get comments with likes
    const [comments, totalCount] = await Promise.all([
      prisma.elementComment.findMany({
        where: {
          elementId,
          deletedAt: null,
        },
        include: {
          user: {
            select: userSelect,
          },
          likes: {
            select: {
              userId: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc', // Newest first
        },
        skip,
        take: limit,
      }),
      prisma.elementComment.count({
        where: {
          elementId,
          deletedAt: null,
        },
      }),
    ]);

    const hasMore = skip + comments.length < totalCount;

    res.json({
      data: {
        comments: comments.map(comment => ({
          id: comment.id,
          userId: comment.userId,
          content: comment.content,
          createdAt: comment.createdAt,
          user: comment.user,
          likeCount: comment.likes.length,
          hasLiked: comment.likes.some(like => like.userId === req.user!.id),
        })),
        pagination: {
          page,
          limit,
          totalCount,
          hasMore,
        },
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Delete a comment (creator only)
 * DELETE /api/comments/:commentId
 */
export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get comment and verify ownership
    const comment = await prisma.elementComment.findFirst({
      where: {
        id: commentId,
        deletedAt: null,
      },
      include: {
        element: {
          include: {
            room: true,
          },
        },
      },
    });

    if (!comment) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    if (comment.userId !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own comments');
    }

    // Soft delete the comment
    await prisma.elementComment.update({
      where: {
        id: commentId,
      },
      data: {
        deletedAt: new Date(),
      },
    });

    // Get updated comment count
    const commentCount = await prisma.elementComment.count({
      where: { 
        elementId: comment.elementId,
        deletedAt: null,
      },
    });

    const response = {
      data: {
        message: 'Comment deleted successfully',
        elementStats: {
          totalComments: commentCount,
        },
      },
    };

    // Send response immediately
    res.json(response);

    // Emit socket event in background
    setImmediate(() => {
      socketService.emitToRoom(comment.element.room.id, 'element:comment:deleted', {
        elementId: comment.elementId,
        commentId,
        stats: {
          totalCount: commentCount,
        },
      });
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Like or unlike a comment
 * POST /api/comments/:commentId/like
 */
export const toggleCommentLike = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get comment and verify it exists
    const comment = await prisma.elementComment.findFirst({
      where: {
        id: commentId,
        deletedAt: null,
      },
      include: {
        user: {
          select: userSelect,
        },
        element: {
          include: {
            room: {
              include: {
                participants: true,
              },
            },
          },
        },
      },
    });

    if (!comment) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    // Verify user has access to room
    const isParticipant = comment.element.room.participants.some(p => p.userId === req.user!.id);
    if (!isParticipant && !comment.element.room.isPublic) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
    }

    const userId = req.user.id;

    // Check if user already liked the comment
    const existingLike = await prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId,
        },
      },
    });

    let action: 'liked' | 'unliked';
    
    if (existingLike) {
      // Unlike
      await prisma.commentLike.delete({
        where: {
          id: existingLike.id,
        },
      });
      action = 'unliked';
    } else {
      // Like
      await prisma.commentLike.create({
        data: {
          commentId,
          userId,
        },
      });
      action = 'liked';
    }

    // Get updated like count
    const likeCount = await prisma.commentLike.count({
      where: { commentId },
    });

    const response = {
      data: {
        action,
        commentStats: {
          likeCount,
          hasLiked: action === 'liked',
        },
      },
    };

    // Send response immediately
    res.json(response);

    // Handle background tasks
    if (action === 'liked') {
      setImmediate(async () => {
        try {
          // Send push notification to comment author (if not self)
          if (comment.userId !== userId) {
            const truncatedComment = comment.content.length > 50 
              ? comment.content.substring(0, 47) + '...' 
              : comment.content;
            
            await NotificationService.notifyCommentLike(
              req.user!.firstName || req.user!.username,
              comment.userId,
              comment.element.room.id,
              comment.element.room.name,
              truncatedComment
            );
          }
        } catch (error) {
          console.error('Error sending like notification:', error);
        }
      });
    }
  } catch (error) {
    throw error;
  }
};