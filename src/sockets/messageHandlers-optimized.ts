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
  tempId?: string; // Client-side temporary ID for optimistic updates
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

// Typing indicator debouncing
const typingTimers = new Map<string, NodeJS.Timeout>();

export const setupMessageHandlers = (io: Server, socket: SocketWithUser) => {
  // OPTIMIZED: Send message with immediate response
  socket.on('message:send', async (data: MessageSendData, callback?: Function) => {
    try {
      const { roomId, text, tempId } = data;
      console.log(`💬 [Room ${roomId}] User ${socket.userId} sending message`);

      // Quick validation
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

      // Quick room verification using socket rooms
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        socket.emit('error', { message: 'Not in room' });
        return;
      }

      // Create message - minimal query
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
        },
      });

      // OPTIMIZATION: Immediate broadcast with minimal data
      const messageResponse = {
        message: {
          ...message,
          reactions: [],
          readBy: [],
          tempId, // Include temp ID for client mapping
        },
      };

      // Send to all users immediately
      io.to(roomId).emit('message:new', messageResponse);

      // Send acknowledgment if callback provided
      if (callback && typeof callback === 'function') {
        callback({ success: true, messageId: message.id });
      }

      // OPTIMIZATION: Background tasks (non-blocking)
      setImmediate(async () => {
        try {
          // Update room timestamp and get participants for notifications
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

          // Send push notifications (non-blocking)
          if (socket.user && room.participants.length > 0) {
            const truncatedText = trimmedText.length > 30 
              ? trimmedText.substring(0, 30) + '...' 
              : trimmedText;

            await Promise.all(
              room.participants.map(participant =>
                NotificationService.notifyNewMessage(
                  socket.user.firstName || socket.user.username,
                  participant.userId,
                  roomId,
                  room.name,
                  truncatedText
                ).catch(err => {
                  console.error(`❌ Failed to notify ${participant.userId}:`, err.message);
                })
              )
            );
          }
        } catch (error) {
          console.error('Error in message background tasks:', error);
        }
      });

      console.log(`✅ [Room ${roomId}] Message sent successfully`);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
      if (callback && typeof callback === 'function') {
        callback({ success: false, error: 'Failed to send message' });
      }
    }
  });

  // OPTIMIZED: Delete message with immediate response
  socket.on('message:delete', async (data: MessageDeleteData) => {
    try {
      const { roomId, messageId } = data;
      console.log(`🗑️ [Room ${roomId}] User ${socket.userId} deleting message ${messageId}`);

      // Quick verification of message ownership
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          roomId,
          senderId: socket.userId, // Only check if user is sender
          deletedAt: null,
        },
      });

      if (!message) {
        socket.emit('error', { message: 'Message not found or not authorized' });
        return;
      }

      // Soft delete
      await prisma.message.update({
        where: { id: messageId },
        data: { deletedAt: new Date() },
      });

      // Immediate broadcast
      io.to(roomId).emit('message:deleted', {
        messageId,
      });

      // Update room timestamp in background
      setImmediate(() => {
        prisma.room.update({
          where: { id: roomId },
          data: {},
        }).catch(err => console.error('Failed to update room timestamp:', err));
      });

      console.log(`✅ [Room ${roomId}] Message deleted successfully`);
    } catch (error) {
      console.error('Error deleting message:', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // OPTIMIZED: Typing indicator with debouncing
  socket.on('message:typing', async (data: MessageTypingData) => {
    try {
      const { roomId, isTyping } = data;
      
      // Quick socket room check
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        return;
      }

      const typingKey = `${roomId}:${socket.userId}`;

      if (isTyping) {
        // Clear existing timer
        const existingTimer = typingTimers.get(typingKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
        }

        // Broadcast typing status
        socket.to(roomId).emit('message:typing', {
          userId: socket.userId,
          username: socket.user.username || socket.user.email,
          firstName: socket.user.firstName,
          isTyping: true,
        });

        // Auto-stop typing after 3 seconds
        const timer = setTimeout(() => {
          socket.to(roomId).emit('message:typing', {
            userId: socket.userId,
            username: socket.user.username || socket.user.email,
            firstName: socket.user.firstName,
            isTyping: false,
          });
          typingTimers.delete(typingKey);
        }, 3000);

        typingTimers.set(typingKey, timer);
      } else {
        // Stop typing
        const existingTimer = typingTimers.get(typingKey);
        if (existingTimer) {
          clearTimeout(existingTimer);
          typingTimers.delete(typingKey);
        }

        socket.to(roomId).emit('message:typing', {
          userId: socket.userId,
          username: socket.user.username || socket.user.email,
          firstName: socket.user.firstName,
          isTyping: false,
        });
      }
    } catch (error) {
      console.error('Error handling typing indicator:', error);
    }
  });

  // OPTIMIZED: Toggle reaction with single query
  socket.on('message:reaction:toggle', async (data: MessageReactionData) => {
    try {
      const { roomId, messageId } = data;
      console.log(`❤️ [Room ${roomId}] User ${socket.userId} toggling reaction on message ${messageId}`);

      // Quick socket room check
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        socket.emit('error', { message: 'Not in room' });
        return;
      }

      // Try to delete existing reaction
      const deleted = await prisma.messageReaction.deleteMany({
        where: {
          messageId,
          userId: socket.userId,
        },
      });

      if (deleted.count > 0) {
        // Reaction was removed
        io.to(roomId).emit('message:reaction:removed', {
          messageId,
          userId: socket.userId,
        });
      } else {
        // Add new reaction
        await prisma.messageReaction.create({
          data: {
            messageId,
            userId: socket.userId,
          },
        });

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

  // OPTIMIZED: Batch mark messages as read
  socket.on('messages:mark-read', async (data: MessageReadData) => {
    try {
      const { roomId, messageIds } = data;
      
      if (!messageIds || messageIds.length === 0) {
        return;
      }

      console.log(`👁️ [Room ${roomId}] User ${socket.userId} marking ${messageIds.length} messages as read`);

      // Batch create read receipts
      await prisma.$transaction([
        // Create read receipts
        prisma.messageRead.createMany({
          data: messageIds.map(messageId => ({
            messageId,
            userId: socket.userId,
          })),
          skipDuplicates: true,
        }),
        // Update lastReadAt
        prisma.roomParticipant.update({
          where: {
            roomId_userId: {
              roomId,
              userId: socket.userId,
            },
          },
          data: {
            lastReadAt: new Date(),
          },
        }),
      ]);

      // Emit read receipts to all users
      io.to(roomId).emit('messages:read-receipts', {
        userId: socket.userId,
        messageIds,
      });
    } catch (error) {
      console.error('Error marking messages as read:', error);
      socket.emit('error', { message: 'Failed to mark messages as read' });
    }
  });

  // Clean up typing timers on disconnect
  socket.on('disconnect', () => {
    // Clear all typing timers for this user
    for (const [key, timer] of typingTimers) {
      if (key.endsWith(`:${socket.userId}`)) {
        clearTimeout(timer);
        typingTimers.delete(key);
        
        // Notify rooms that user stopped typing
        const roomId = key.split(':')[0];
        socket.to(roomId).emit('message:typing', {
          userId: socket.userId,
          username: socket.user?.username || socket.user?.email,
          firstName: socket.user?.firstName,
          isTyping: false,
        });
      }
    }
  });
};