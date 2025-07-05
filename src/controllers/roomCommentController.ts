import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { socketService } from '../services/socketService';
import { getPagination, getPaginationMeta } from '../utils/pagination';
import { NotificationService } from '../services/notificationService';
import { InAppNotificationService } from '../services/inAppNotificationService';
import { NotificationType } from '@prisma/client';

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

    // Get top-level comments with referenced elements and first 3 replies
    const [comments, totalCount] = await Promise.all([
      prisma.comment.findMany({
        where: {
          roomId,
          deletedAt: null,
          parentId: null, // Only get top-level comments
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
          replies: {
            where: {
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
              // Check if current user liked each reply
              likes: {
                where: {
                  userId: req.user.id,
                },
                select: {
                  id: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
            take: 3, // Only include first 3 replies
          },
          _count: {
            select: {
              replies: {
                where: {
                  deletedAt: null,
                },
              },
            },
          },
          // Check if current user liked this comment
          likes: {
            where: {
              userId: req.user.id,
            },
            select: {
              id: true,
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
          parentId: null, // Only count top-level comments
        },
      }),
    ]);

    const meta = getPaginationMeta(totalCount, page, limit);

    console.log(`💬 [GET ROOM COMMENTS] Found ${comments.length} comments out of ${totalCount} total`);

    // Transform comments to include reply count, hasMoreReplies flag, and like data
    const transformedComments = comments.map(comment => ({
      ...comment,
      parentId: comment.parentId,
      replyCount: comment._count.replies,
      hasMoreReplies: comment._count.replies > 3,
      likeCount: comment.likeCount,
      userHasLiked: comment.likes.length > 0,
      replies: (comment.replies || []).map(reply => ({
        ...reply,
        likeCount: reply.likeCount,
        userHasLiked: reply.likes.length > 0,
        likes: undefined, // Remove the likes array from response
      })),
      likes: undefined, // Remove the likes array from response
    }));

    console.log(`💬 [GET ROOM COMMENTS] Comments:`, JSON.stringify(transformedComments, null, 2));

    const response = {
      data: transformedComments,
      meta,
    };
    
    console.log(`💬 [GET ROOM COMMENTS] Full response:`, JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    throw error;
  }
};

// Helper function to extract @mentions from text
const extractMentions = (text: string): string[] => {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  
  while ((match = mentionRegex.exec(text)) !== null) {
    mentions.push(match[1]);
  }
  
  return [...new Set(mentions)]; // Remove duplicates
};

export const createComment = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { text, referencedElementId, parentId } = req.body;

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

    // If replying to a comment, verify it exists and belongs to the room
    if (parentId) {
      const parentComment = await prisma.comment.findFirst({
        where: {
          id: parentId,
          roomId,
          deletedAt: null,
        },
      });

      if (!parentComment) {
        throw new AppError(404, 'NOT_FOUND', 'Parent comment not found');
      }
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

    // Extract mentioned usernames
    const mentionedUsernames = extractMentions(text);

    console.log(`\n💬 [CREATE COMMENT] Creating comment in room ${roomId} by user ${req.user.id}`);
    console.log(`💬 [CREATE COMMENT] Text: "${text.trim()}", Parent: ${parentId || 'none'}, Referenced element: ${referencedElementId || 'none'}`);
    console.log(`💬 [CREATE COMMENT] Mentioned users: ${mentionedUsernames.length > 0 ? mentionedUsernames.join(', ') : 'none'}`);

    // Create comment
    const comment = await prisma.comment.create({
      data: {
        roomId,
        userId: req.user.id,
        text: text.trim(),
        parentId,
        referencedElementId,
        referencedElementType,
        mentionedUsernames: mentionedUsernames.length > 0 ? mentionedUsernames : undefined,
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

    // Update room's comments updated timestamp and increment comment count
    await prisma.room.update({
      where: { id: roomId },
      data: { 
        commentsUpdatedAt: new Date(),
        commentCount: {
          increment: 1
        }
      },
    });

    // Emit socket event to all users in room
    if (parentId) {
      console.log(`💬 [CREATE COMMENT] Emitting comment:reply:new for reply to comment ${parentId}`);
      socketService.getIO()?.to(roomId).emit('comment:reply:new', {
        roomId,
        parentCommentId: parentId,
        reply: comment,
      });
    } else {
      console.log(`💬 [CREATE COMMENT] Emitting comment:new for top-level comment`);
      socketService.getIO()?.to(roomId).emit('comment:new', {
        comment,
        roomId,
      });
    }

    // First, identify mentioned users
    const mentionedUserIds = new Set<string>();
    if (mentionedUsernames.length > 0) {
      // Look up mentioned users by username
      const mentionedUsers = await prisma.user.findMany({
        where: {
          username: {
            in: mentionedUsernames,
          },
        },
        select: {
          id: true,
          username: true,
          oneSignalPlayerId: true,
        },
      });

      console.log(`💬 [CREATE COMMENT] Found ${mentionedUsers.length} mentioned users`);
      
      // Track mentioned user IDs
      mentionedUsers.forEach(u => mentionedUserIds.add(u.id));
    }

    // Send notifications
    const notificationPromises = room.participants
      .filter(p => p.user.id !== req.user!.id) // Don't notify self
      .map(p => {
        const isMentioned = mentionedUserIds.has(p.user.id);
        
        if (isMentioned) {
          // Send MENTION notification (not COMMENT_ADDED)
          if (p.user.oneSignalPlayerId) {
            NotificationService.notifyMentioned(
              p.user.id,
              req.user!.firstName || req.user!.username,
              room.name,
              text.substring(0, 100)
            ).catch(err => console.error('❌ Failed to send mention push notification:', err));
          }

          return InAppNotificationService.createNotification({
            userId: p.user.id,
            type: NotificationType.MENTION,
            actorId: req.user!.id,
            roomId,
            data: {
              roomName: room.name,
              commentPreview: text.substring(0, 100),
            },
          });
        } else {
          // Send COMMENT_ADDED notification
          if (p.user.oneSignalPlayerId) {
            NotificationService.notifyNewComment(
              p.user.id,
              req.user!.firstName || req.user!.username,
              room.name,
              text.substring(0, 100)
            ).catch(err => console.error('❌ Failed to send push notification:', err));
          }

          return InAppNotificationService.createNotification({
            userId: p.user.id,
            type: NotificationType.COMMENT_ADDED,
            actorId: req.user!.id,
            roomId,
            data: {
              roomName: room.name,
              commentPreview: text.substring(0, 100),
            },
          });
        }
      });

    // Fire and forget notifications
    Promise.all(notificationPromises).catch(error => {
      console.error('Failed to send comment notifications:', error);
    });

    const response = {
      data: comment,
    };

    console.log(`💬 [CREATE COMMENT] Response sent:`, {
      commentId: comment.id,
      parentId: comment.parentId,
      text: comment.text.substring(0, 50) + (comment.text.length > 50 ? '...' : ''),
      userId: comment.userId,
      likeCount: comment.likeCount || 0,
    });

    res.status(201).json(response);
  } catch (error) {
    throw error;
  }
};

export const deleteComment = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    console.log(`\n🗑️ [DELETE COMMENT] Request to delete comment ${commentId} by user ${req.user?.id}`);

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

    // Update room's comments updated timestamp and decrement comment count
    await prisma.room.update({
      where: { id: comment.roomId },
      data: { 
        commentsUpdatedAt: new Date(),
        commentCount: {
          decrement: 1
        }
      },
    });

    // Emit socket event
    socketService.getIO()?.to(comment.roomId).emit('comment:deleted', {
      commentId,
      roomId: comment.roomId,
    });

    console.log(`🗑️ [DELETE COMMENT] Successfully deleted comment ${commentId} from room ${comment.roomId}`);
    console.log(`🗑️ [DELETE COMMENT] Comment had ${comment.parentId ? 'parent ' + comment.parentId : 'no parent (top-level)'}`);

    res.json({
      data: {
        message: 'Comment deleted successfully',
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getCommentReplies = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { skip, take } = getPagination({ page, limit });

    console.log(`\n💬 [GET COMMENT REPLIES] Request for comment ${commentId}, page ${page}, limit ${limit}, user ${req.user?.id}`);

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify comment exists and get room ID
    const parentComment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { roomId: true },
    });

    if (!parentComment) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    // Verify user has access to the room
    const participant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId: parentComment.roomId,
          userId: req.user.id,
        },
      },
    });

    if (!participant) {
      throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this room');
    }

    // Get all replies for the comment
    const [replies, totalCount] = await Promise.all([
      prisma.comment.findMany({
        where: {
          parentId: commentId,
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
          // Check if current user liked each reply
          likes: {
            where: {
              userId: req.user.id,
            },
            select: {
              id: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take,
      }),
      prisma.comment.count({
        where: {
          parentId: commentId,
          deletedAt: null,
        },
      }),
    ]);

    const meta = getPaginationMeta(totalCount, page, limit);

    console.log(`💬 [GET COMMENT REPLIES] Found ${replies.length} replies out of ${totalCount} total for comment ${commentId}`);

    const transformedReplies = replies.map(reply => ({
      ...reply,
      parentId: reply.parentId,
      replyCount: 0, // Replies don't have nested replies
      likeCount: reply.likeCount,
      userHasLiked: reply.likes.length > 0,
      likes: undefined, // Remove the likes array from response
    }));

    console.log(`💬 [GET COMMENT REPLIES] Transformed replies:`, JSON.stringify(transformedReplies, null, 2));

    res.json({
      data: transformedReplies,
      meta,
    });
  } catch (error) {
    throw error;
  }
};

export const toggleCommentLike = async (req: AuthRequest, res: Response) => {
  try {
    const { commentId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify comment exists and get room ID and current like count
    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { 
        id: true,
        roomId: true,
        deletedAt: true,
        likeCount: true,
        userId: true,
        text: true,
        room: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!comment || comment.deletedAt) {
      throw new AppError(404, 'NOT_FOUND', 'Comment not found');
    }

    // Verify user has access to the room
    const participant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: {
          roomId: comment.roomId,
          userId: req.user.id,
        },
      },
    });

    if (!participant) {
      throw new AppError(403, 'FORBIDDEN', 'You are not a participant in this room');
    }

    // Check if user has already liked this comment
    const existingLike = await prisma.commentLike.findUnique({
      where: {
        commentId_userId: {
          commentId,
          userId: req.user.id,
        },
      },
    });

    let action: 'liked' | 'unliked';
    let newLikeCount: number;

    if (existingLike) {
      // Unlike: Remove the like and decrement count
      await prisma.$transaction([
        prisma.commentLike.delete({
          where: { id: existingLike.id },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
        }),
      ]);
      action = 'unliked';
      newLikeCount = Math.max(0, comment.likeCount - 1);
    } else {
      // Like: Create like and increment count
      await prisma.$transaction([
        prisma.commentLike.create({
          data: {
            commentId,
            userId: req.user.id,
          },
        }),
        prisma.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
        }),
      ]);
      action = 'liked';
      newLikeCount = comment.likeCount + 1;

      // Send notification to comment author (if not self-like)
      if (comment.userId !== req.user.id) {
        // Push notification
        NotificationService.notifyCommentLike(
          req.user.firstName || req.user.username,
          comment.userId,
          comment.roomId,
          comment.room.name,
          comment.text.substring(0, 100)
        ).catch(err => console.error('❌ Failed to send comment like notification:', err));

        // In-app notification
        InAppNotificationService.createNotification({
          userId: comment.userId,
          type: NotificationType.COMMENT_LIKE,
          actorId: req.user.id,
          roomId: comment.roomId,
          data: {
            roomName: comment.room.name,
            commentPreview: comment.text.substring(0, 100),
            commentId,
          },
        }).catch(err => console.error('❌ Failed to create in-app notification:', err));
      }
    }

    console.log(`👍 [TOGGLE COMMENT LIKE] User ${req.user.username} ${action} comment ${commentId}, new count: ${newLikeCount}`);

    const response = {
      data: {
        action,
        likeCount: newLikeCount,
      },
    };

    console.log(`👍 [TOGGLE COMMENT LIKE] Response:`, JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    throw error;
  }
};