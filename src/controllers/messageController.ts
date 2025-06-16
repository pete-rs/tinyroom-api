import { Response } from 'express';
import { AuthRequest } from '../types';
import { AppError } from '../middleware/errorHandler';
import { prisma } from '../config/prisma';
import { NotificationService } from '../services/notificationService';

export const sendMessage = async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const { text } = req.body;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  if (!text || typeof text !== 'string') {
    throw new AppError(400, 'INVALID_INPUT', 'Message text is required');
  }

  // Trim and validate message
  const trimmedText = text.trim();
  if (trimmedText.length === 0) {
    throw new AppError(400, 'INVALID_INPUT', 'Message cannot be empty');
  }

  if (trimmedText.length > 1000) {
    throw new AppError(400, 'INVALID_INPUT', 'Message too long (max 1000 characters)');
  }

  try {
    // Verify user is a participant in the room
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

    // Create the message
    const message = await prisma.message.create({
      data: {
        roomId,
        senderId: req.user.id,
        text: trimmedText,
      },
      include: {
        sender: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Update room's updatedAt timestamp
    const room = await prisma.room.update({
      where: { id: roomId },
      data: {}, // Empty update will trigger @updatedAt
      include: {
        participants: {
          where: {
            userId: {
              not: req.user.id, // Exclude sender
            },
          },
        },
      },
    });

    // Send push notifications to other participants
    const truncatedText = trimmedText.length > 30 
      ? trimmedText.substring(0, 30) + '...' 
      : trimmedText;

    for (const otherParticipant of room.participants) {
      await NotificationService.notifyNewMessage(
        req.user.firstName || req.user.username,
        otherParticipant.userId,
        roomId,
        room.name,
        truncatedText
      );
    }

    res.json({
      data: message,
    });
  } catch (error) {
    console.error('Error sending message:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to send message');
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const page = parseInt(req.query.page as string) || 1;
  const limit = 30;
  const skip = (page - 1) * limit;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Verify user is a participant in the room
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

    // Get messages with pagination (newest first)
    const [messages, totalCount] = await Promise.all([
      prisma.message.findMany({
        where: {
          roomId,
          deletedAt: null,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              firstName: true,
              avatarUrl: true,
            },
          },
          reactions: {
            select: {
              userId: true,
              createdAt: true,
            },
          },
          readBy: {
            select: {
              userId: true,
              readAt: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.message.count({
        where: {
          roomId,
          deletedAt: null,
        },
      }),
    ]);

    // Update lastReadAt for this participant
    await prisma.roomParticipant.update({
      where: {
        roomId_userId: {
          roomId,
          userId: req.user.id,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    const totalPages = Math.ceil(totalCount / limit);
    const hasMore = page < totalPages;

    res.json({
      data: {
        messages: messages.reverse(), // Return in chronological order
        pagination: {
          page,
          totalPages,
          totalCount,
          hasMore,
        },
      },
    });
  } catch (error) {
    console.error('Error getting messages:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to get messages');
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  const { roomId, messageId } = req.params;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Get the message to check ownership
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        roomId,
        deletedAt: null,
      },
    });

    if (!message) {
      throw new AppError(404, 'NOT_FOUND', 'Message not found');
    }

    // Only the sender can delete their message
    if (message.senderId !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'You can only delete your own messages');
    }

    // Soft delete the message
    await prisma.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });

    // Update room's updatedAt timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: {}, // Empty update will trigger @updatedAt
    });

    res.json({
      data: {
        message: 'Message deleted successfully',
      },
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to delete message');
  }
};

export const toggleReaction = async (req: AuthRequest, res: Response) => {
  const { roomId, messageId } = req.params;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Verify message exists and user has access
    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        roomId,
        deletedAt: null,
      },
    });

    if (!message) {
      throw new AppError(404, 'NOT_FOUND', 'Message not found');
    }

    // Check if user is participant
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

    // Check if reaction exists
    const existingReaction = await prisma.messageReaction.findUnique({
      where: {
        messageId_userId: {
          messageId,
          userId: req.user.id,
        },
      },
    });

    if (existingReaction) {
      // Remove reaction
      await prisma.messageReaction.delete({
        where: {
          messageId_userId: {
            messageId,
            userId: req.user.id,
          },
        },
      });

      res.json({
        data: {
          reacted: false,
          message: 'Reaction removed',
        },
      });
    } else {
      // Add reaction
      await prisma.messageReaction.create({
        data: {
          messageId,
          userId: req.user.id,
        },
      });

      res.json({
        data: {
          reacted: true,
          message: 'Reaction added',
        },
      });
    }
  } catch (error) {
    console.error('Error toggling reaction:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to toggle reaction');
  }
};

export const markMessagesAsRead = async (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Update lastReadAt for this participant
    await prisma.roomParticipant.update({
      where: {
        roomId_userId: {
          roomId,
          userId: req.user.id,
        },
      },
      data: {
        lastReadAt: new Date(),
      },
    });

    res.json({
      data: {
        message: 'Messages marked as read',
      },
    });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to mark messages as read');
  }
};