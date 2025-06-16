import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { NotificationService } from '../services/notificationService';

interface SocketWithUser extends Socket {
  userId: string;
  user: any;
}

interface MessageSendData {
  roomId: string;
  text: string;
}

interface MessageDeleteData {
  roomId: string;
  messageId: string;
}

interface MessageTypingData {
  roomId: string;
  isTyping: boolean;
}

interface MessageReactionData {
  roomId: string;
  messageId: string;
}

interface MessageReadData {
  roomId: string;
  messageIds: string[];
}

export const setupMessageHandlers = (io: Server, socket: SocketWithUser) => {
  // Send message
  socket.on('message:send', async (data: MessageSendData) => {
    try {
      const { roomId, text } = data;
      console.log(`💬 [Room ${roomId}] User ${socket.userId} sending message`);

      // Validate input
      if (!text || typeof text !== 'string') {
        socket.emit('error', { message: 'Message text is required' });
        return;
      }

      const trimmedText = text.trim();
      if (trimmedText.length === 0) {
        socket.emit('error', { message: 'Message cannot be empty' });
        return;
      }

      if (trimmedText.length > 1000) {
        socket.emit('error', { message: 'Message too long (max 1000 characters)' });
        return;
      }

      // Verify user is in room
      const participant = await prisma.roomParticipant.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId: socket.userId,
          },
        },
      });

      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // Create message
      const message = await prisma.message.create({
        data: {
          roomId,
          senderId: socket.userId,
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
      });

      // Update room timestamp
      const room = await prisma.room.update({
        where: { id: roomId },
        data: {}, // Empty update will trigger @updatedAt
        include: {
          participants: {
            where: {
              userId: {
                not: socket.userId,
              },
            },
          },
        },
      });

      // Emit to all users in room (including sender)
      io.to(roomId).emit('message:new', {
        message,
      });

      // Send push notifications
      const truncatedText = trimmedText.length > 30 
        ? trimmedText.substring(0, 30) + '...' 
        : trimmedText;

      for (const otherParticipant of room.participants) {
        await NotificationService.notifyNewMessage(
          socket.user.firstName || socket.user.username,
          otherParticipant.userId,
          roomId,
          room.name,
          truncatedText
        );
      }

      console.log(`✅ [Room ${roomId}] Message sent successfully`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Delete message
  socket.on('message:delete', async (data: MessageDeleteData) => {
    try {
      const { roomId, messageId } = data;
      console.log(`🗑️ [Room ${roomId}] User ${socket.userId} deleting message ${messageId}`);

      // Get message to verify ownership
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          roomId,
          deletedAt: null,
        },
      });

      if (!message) {
        socket.emit('error', { message: 'Message not found' });
        return;
      }

      // Only sender can delete
      if (message.senderId !== socket.userId) {
        socket.emit('error', { message: 'You can only delete your own messages' });
        return;
      }

      // Soft delete
      await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      // Update room timestamp
      await prisma.room.update({
        where: { id: roomId },
        data: {},
      });

      // Emit to all users in room
      io.to(roomId).emit('message:deleted', {
        messageId,
      });

      console.log(`✅ [Room ${roomId}] Message deleted successfully`);
    } catch (error) {
      console.error('Error deleting message:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Typing indicator
  socket.on('message:typing', async (data: MessageTypingData) => {
    try {
      const { roomId, isTyping } = data;
      
      // Verify user is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        return;
      }

      // Broadcast to others in room (not sender)
      socket.to(roomId).emit('message:typing', {
        userId: socket.userId,
        username: socket.user.username || socket.user.email,
        firstName: socket.user.firstName,
        isTyping,
      });
    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  });

  // Toggle reaction
  socket.on('message:reaction:toggle', async (data: MessageReactionData) => {
    try {
      const { roomId, messageId } = data;
      console.log(`❤️ [Room ${roomId}] User ${socket.userId} toggling reaction on message ${messageId}`);

      // Verify user is in room
      const participant = await prisma.roomParticipant.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId: socket.userId,
          },
        },
      });

      if (!participant) {
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // Check if reaction exists
      const existingReaction = await prisma.messageReaction.findUnique({
        where: {
          messageId_userId: {
            messageId,
            userId: socket.userId,
          },
        },
      });

      if (existingReaction) {
        // Remove reaction
        await prisma.messageReaction.delete({
          where: {
            messageId_userId: {
              messageId,
              userId: socket.userId,
            },
          },
        });

        // Emit to all users in room
        io.to(roomId).emit('message:reaction:removed', {
          messageId,
          userId: socket.userId,
        });
      } else {
        // Add reaction
        await prisma.messageReaction.create({
          data: {
            messageId,
            userId: socket.userId,
          },
        });

        // Emit to all users in room
        io.to(roomId).emit('message:reaction:added', {
          messageId,
          userId: socket.userId,
        });
      }
    } catch (error) {
      console.error('Error toggling reaction:', error);
      socket.emit('error', { message: 'Failed to toggle reaction' });
    }
  });

  // Mark specific messages as read
  socket.on('messages:mark-read', async (data: MessageReadData) => {
    try {
      const { roomId, messageIds } = data;
      console.log(`👁️ [Room ${roomId}] User ${socket.userId} marking ${messageIds.length} messages as read`);

      // Create read receipts for each message
      const readReceipts = messageIds.map(messageId => ({
        messageId,
        userId: socket.userId,
      }));

      await prisma.messageRead.createMany({
        data: readReceipts,
        skipDuplicates: true, // Skip if already marked as read
      });

      // Update lastReadAt
      await prisma.roomParticipant.update({
        where: {
          roomId_userId: {
            roomId,
            userId: socket.userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });

      // Emit read receipts to all users in room
      io.to(roomId).emit('messages:read-receipts', {
        userId: socket.userId,
        messageIds,
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  });

  // Mark all messages as read (backward compatibility)
  socket.on('messages:read', async ({ roomId }: { roomId: string }) => {
    try {
      console.log(`👁️ [Room ${roomId}] User ${socket.userId} marking all messages as read`);

      await prisma.roomParticipant.update({
        where: {
          roomId_userId: {
            roomId,
            userId: socket.userId,
          },
        },
        data: {
          lastReadAt: new Date(),
        },
      });

      // Emit confirmation back to sender
      socket.emit('messages:read:success', { roomId });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  });
};