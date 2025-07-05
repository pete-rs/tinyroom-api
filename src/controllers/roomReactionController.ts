import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { socketService } from '../services/socketService';
import { NotificationService } from '../services/notificationService';
import { InAppNotificationService } from '../services/inAppNotificationService';
import { NotificationType } from '@prisma/client';

export const toggleReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;
    const { emoji = '❤️' } = req.body;
    
    console.log(`\n❤️  [TOGGLE REACTION] User ${req.user?.id} toggling reaction for room ${roomId}`);

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

    // Check if user already reacted
    const existingReaction = await prisma.roomReaction.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: req.user.id,
        },
      },
    });

    let action: 'added' | 'removed';
    let reactionCount: number;

    if (existingReaction) {
      // Remove reaction
      console.log(`❤️  [TOGGLE REACTION] Removing existing reaction: ${existingReaction.id}`);
      await prisma.roomReaction.delete({
        where: { id: existingReaction.id },
      });
      
      // Update room reaction count
      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: { 
          reactionCount: { decrement: 1 },
        },
        select: { reactionCount: true },
      });
      
      action = 'removed';
      reactionCount = updatedRoom.reactionCount;
    } else {
      // Add reaction
      console.log(`❤️  [TOGGLE REACTION] Creating new reaction with emoji: ${emoji}`);
      const newReaction = await prisma.roomReaction.create({
        data: {
          roomId,
          userId: req.user.id,
          emoji,
        },
      });
      console.log(`❤️  [TOGGLE REACTION] Created reaction: ${newReaction.id}`);
      
      // Update room reaction count and last reaction time
      const updatedRoom = await prisma.room.update({
        where: { id: roomId },
        data: { 
          reactionCount: { increment: 1 },
          lastReactionAt: new Date(),
        },
        select: { 
          reactionCount: true,
          createdBy: true,
          name: true,
        },
      });
      
      action = 'added';
      reactionCount = updatedRoom.reactionCount;

      // Send notification to room owner (if not self-like)
      if (updatedRoom.createdBy !== req.user.id) {
        // Push notification
        NotificationService.notifyRoomLike(
          req.user.firstName || req.user.username,
          updatedRoom.createdBy,
          roomId,
          updatedRoom.name
        ).catch(err => console.error('❌ Failed to send room like notification:', err));

        // In-app notification
        InAppNotificationService.createNotification({
          userId: updatedRoom.createdBy,
          type: NotificationType.ROOM_LIKE,
          actorId: req.user.id,
          roomId,
          data: {
            roomName: updatedRoom.name,
            emoji,
          },
        }).catch(err => console.error('❌ Failed to create in-app notification:', err));
      }
    }

    // Emit socket event to all users in room
    socketService.getIO()?.to(roomId).emit('room:reaction:toggled', {
      roomId,
      userId: req.user.id,
      username: req.user.username,
      emoji: action === 'added' ? emoji : undefined,
      action,
      reactionCount,
    });

    // Debug: Check reaction in database after action
    const [verifyReaction, verifyRoom] = await Promise.all([
      prisma.roomReaction.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId: req.user.id,
          },
        },
      }),
      prisma.room.findUnique({
        where: { id: roomId },
        select: { reactionCount: true, lastReactionAt: true },
      }),
    ]);
    console.log(`❤️  [TOGGLE REACTION] Verified reaction in DB after ${action}:`, verifyReaction);
    console.log(`❤️  [TOGGLE REACTION] Room reaction data after ${action}:`, verifyRoom);

    res.json({
      data: {
        action,
        emoji: action === 'added' ? emoji : undefined,
        reactionCount,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getRoomReactions = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;

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

    // Get all reactions for the room
    const reactions = await prisma.roomReaction.findMany({
      where: { roomId },
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
      orderBy: { createdAt: 'desc' },
    });

    // Get total count
    const totalCount = await prisma.roomReaction.count({
      where: { roomId },
    });

    res.json({
      data: {
        reactions,
        totalCount,
        userReaction: reactions.find(r => r.userId === req.user!.id) || null,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const removeReaction = async (req: AuthRequest, res: Response) => {
  try {
    const { roomId } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Check if user has a reaction
    const reaction = await prisma.roomReaction.findUnique({
      where: {
        roomId_userId: {
          roomId,
          userId: req.user.id,
        },
      },
    });

    if (!reaction) {
      throw new AppError(404, 'NOT_FOUND', 'No reaction to remove');
    }

    // Remove reaction
    await prisma.roomReaction.delete({
      where: { id: reaction.id },
    });

    // Update room reaction count
    const updatedRoom = await prisma.room.update({
      where: { id: roomId },
      data: { 
        reactionCount: { decrement: 1 },
      },
      select: { reactionCount: true },
    });

    // Emit socket event
    socketService.getIO()?.to(roomId).emit('room:reaction:toggled', {
      roomId,
      userId: req.user.id,
      username: req.user.username,
      action: 'removed',
      reactionCount: updatedRoom.reactionCount,
    });

    res.json({
      data: {
        message: 'Reaction removed successfully',
        reactionCount: updatedRoom.reactionCount,
      },
    });
  } catch (error) {
    throw error;
  }
};