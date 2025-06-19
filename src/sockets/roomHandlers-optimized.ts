import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { ElementType } from '@prisma/client';
import { NotificationService } from '../services/notificationService';

interface SocketWithUser extends Socket {
  userId: string;
  user: any;
}

interface TouchMoveData {
  roomId: string;
  x: number;
  y: number;
  elementId?: string;
}

interface TouchEndData {
  roomId: string;
}

interface ElementCreateData {
  roomId: string;
  type: 'note' | 'photo' | 'audio' | 'horoscope' | 'video' | 'link';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  content?: string;
  imageUrl?: string;
  audioUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  duration?: number;
}

interface ElementUpdateData {
  roomId: string;
  elementId: string;
  positionX: number;
  positionY: number;
  content?: string;
}

interface ElementDeleteData {
  roomId: string;
  elementId: string;
}

interface RoomClearData {
  roomId: string;
}

// Cache for room participant verification (TTL: 5 minutes)
const participantCache = new Map<string, { timestamp: number; isParticipant: boolean }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export const setupRoomHandlers = (io: Server, socket: SocketWithUser) => {
  // Helper function to verify participant with caching
  const verifyParticipant = async (roomId: string, userId: string): Promise<boolean> => {
    const cacheKey = `${roomId}:${userId}`;
    const cached = participantCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.isParticipant;
    }
    
    const participant = await prisma.roomParticipant.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
    });
    
    const isParticipant = !!participant;
    participantCache.set(cacheKey, { timestamp: Date.now(), isParticipant });
    return isParticipant;
  };

  // Join room
  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    try {
      console.log(`🚪 [Room ${roomId}] User ${socket.userId} joining room`);
      
      // Optimized query: Get participant, user data, and elements in one go
      const [participant, elements] = await Promise.all([
        prisma.roomParticipant.findUnique({
          where: {
            roomId_userId: {
              roomId,
              userId: socket.userId,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
                firstName: true,
                email: true,
              },
            },
          },
        }),
        prisma.element.findMany({
          where: {
            roomId: roomId,
            deletedAt: null,
          },
          select: {
            id: true,
            type: true,
            positionX: true,
            positionY: true,
            width: true,
            height: true,
            content: true,
            imageUrl: true,
            audioUrl: true,
            videoUrl: true,
            thumbnailUrl: true,
            duration: true,
            createdBy: true,
          },
        }),
      ]);

      if (!participant) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'You are not a participant in this room' });
        return;
      }

      // Join socket room
      socket.join(roomId);
      console.log(`✅ [Room ${roomId}] User ${socket.userId} joined socket room`);

      // Update participant status and room timestamp in parallel
      await Promise.all([
        prisma.roomParticipant.update({
          where: {
            roomId_userId: {
              roomId,
              userId: socket.userId,
            },
          },
          data: { 
            isActive: true,
            leftAt: null,
          },
        }),
        prisma.room.update({
          where: { id: roomId },
          data: {}, // Empty update will trigger @updatedAt
        }),
      ]);

      // Notify others
      socket.to(roomId).emit('user:joined', {
        userId: socket.userId,
        username: participant.user.username || participant.user.email,
        color: participant.color,
      });

      // Send all elements in a single batch
      console.log(`📊 [Room ${roomId}] Sending ${elements.length} existing elements to joining user`);
      
      if (elements.length > 0) {
        // Send all elements in one message for efficiency
        socket.emit('elements:batch', {
          elements: elements.map(element => ({
            id: element.id,
            type: element.type.toLowerCase(),
            positionX: element.positionX,
            positionY: element.positionY,
            width: element.width,
            height: element.height,
            content: element.content,
            imageUrl: element.imageUrl,
            audioUrl: element.audioUrl,
            videoUrl: element.videoUrl,
            thumbnailUrl: element.thumbnailUrl,
            duration: element.duration,
            createdBy: element.createdBy,
          })),
        });
      }

      console.log(`✅ [Room ${roomId}] User ${socket.userId} fully joined room`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  // Leave room
  socket.on('room:leave', async ({ roomId }: { roomId: string }) => {
    try {
      socket.leave(roomId);
      
      // Clear cache
      participantCache.delete(`${roomId}:${socket.userId}`);

      // Update participant status
      await prisma.roomParticipant.update({
        where: {
          roomId_userId: {
            roomId,
            userId: socket.userId,
          },
        },
        data: { 
          isActive: false,
          leftAt: new Date(),
        },
      });

      // Check if all participants have left
      const activeParticipants = await prisma.roomParticipant.count({
        where: {
          roomId,
          isActive: true,
        },
      });

      // If no active participants, mark room inactive
      if (activeParticipants === 0) {
        await prisma.room.update({
          where: { id: roomId },
          data: {
            isActive: false,
          },
        });
        
        console.log(`Room ${roomId} marked inactive - all participants have left`);
      }

      // Notify others
      socket.to(roomId).emit('user:left', {
        userId: socket.userId,
      });

      console.log(`User ${socket.userId} left room ${roomId}`);
    } catch (error) {
      console.error('Error leaving room:', error);
    }
  });

  // Touch tracking (unchanged - already optimized)
  socket.on('touch:move', async (data: TouchMoveData) => {
    const { roomId, x, y, elementId } = data;
    
    // Quick verification using socket rooms (no DB query)
    const rooms = Array.from(socket.rooms);
    if (!rooms.includes(roomId)) {
      console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room, rejecting touch:move`);
      socket.emit('error', { message: 'Not in room' });
      socket.emit('room:rejoin-needed', { roomId });
      return;
    }

    // Broadcast to others in room
    socket.to(roomId).emit('touch:moved', {
      userId: socket.userId,
      x,
      y,
      elementId,
    });
  });

  socket.on('touch:end', async (data: TouchEndData) => {
    const { roomId } = data;
    
    // Quick verification
    const rooms = Array.from(socket.rooms);
    if (!rooms.includes(roomId)) {
      socket.emit('error', { message: 'Not in room' });
      return;
    }

    socket.to(roomId).emit('touch:ended', {
      userId: socket.userId,
    });
  });

  // OPTIMIZED Element creation
  socket.on('element:create', async (data: ElementCreateData, callback?: Function) => {
    try {
      const { roomId, type, positionX, positionY, width, height, content, imageUrl, audioUrl, videoUrl, thumbnailUrl, duration } = data;
      console.log(`📦 [Room ${roomId}] User ${socket.userId} creating ${type.toUpperCase()} element at (${positionX}, ${positionY})`);

      // Quick participant check with cache
      const isParticipant = await verifyParticipant(roomId, socket.userId);
      if (!isParticipant) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // Create element (single query)
      const element = await prisma.element.create({
        data: {
          roomId,
          type: type.toUpperCase() as ElementType,
          createdBy: socket.userId,
          positionX,
          positionY,
          width,
          height,
          content: content || null,
          imageUrl: imageUrl || null,
          audioUrl: audioUrl || null,
          videoUrl: videoUrl || null,
          thumbnailUrl: thumbnailUrl || null,
          duration: duration || null,
        },
      });

      console.log(`✅ [Room ${roomId}] Element created with ID: ${element.id}`);

      // Prepare response
      const elementResponse = {
        element: {
          id: element.id,
          type: element.type.toLowerCase(),
          positionX: element.positionX,
          positionY: element.positionY,
          width: element.width,
          height: element.height,
          content: element.content,
          imageUrl: element.imageUrl,
          audioUrl: element.audioUrl,
          videoUrl: element.videoUrl,
          thumbnailUrl: element.thumbnailUrl,
          duration: element.duration,
          createdBy: element.createdBy,
        },
      };
      
      // CRITICAL: Emit immediately to all users (including sender)
      // This ensures instant feedback and prevents UI lag
      socket.emit('element:created', elementResponse);
      socket.to(roomId).emit('element:created', elementResponse);

      // Send acknowledgment if callback provided
      if (callback && typeof callback === 'function') {
        callback(elementResponse);
      }

      // Non-blocking background tasks
      setImmediate(async () => {
        try {
          // Update room timestamp
          const updatedRoom = await prisma.room.update({
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

          // Send notification (non-blocking)
          if (socket.user && updatedRoom.participants.length > 0) {
            const creator = socket.user;
            await Promise.all(
              updatedRoom.participants.map(participant =>
                NotificationService.notifyElementAdded(
                  creator.firstName || creator.username,
                  participant.userId,
                  roomId,
                  updatedRoom.name,
                  type.toLowerCase() as any
                ).catch(err => {
                  console.error('Failed to send notification:', err);
                })
              )
            );
          }
        } catch (error) {
          console.error('Error in background tasks:', error);
        }
      });

      console.log(`📤 [Room ${roomId}] Element creation complete`);
    } catch (error) {
      console.error('Error creating element:', error);
      socket.emit('error', { message: 'Failed to create element' });
    }
  });

  // OPTIMIZED Element update
  socket.on('element:update', async (data: ElementUpdateData) => {
    try {
      const { roomId, elementId, positionX, positionY, content } = data;
      
      // Quick socket room check
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room`);
        socket.emit('error', { message: 'Not in room' });
        socket.emit('room:rejoin-needed', { roomId });
        return;
      }

      // Update element (single query, no verification needed since they're in the room)
      const element = await prisma.element.update({
        where: { id: elementId },
        data: {
          positionX,
          positionY,
          ...(content !== undefined && { content }),
        },
      });

      // Broadcast immediately
      io.to(roomId).emit('element:updated', {
        elementId,
        updates: {
          positionX,
          positionY,
          ...(content !== undefined && { content }),
        },
      });

      // Update room timestamp in background
      setImmediate(() => {
        prisma.room.update({
          where: { id: roomId },
          data: {},
        }).catch(err => console.error('Failed to update room timestamp:', err));
      });

      console.log(`✅ [Room ${roomId}] Element ${elementId} updated`);
    } catch (error) {
      console.error('Error updating element:', error);
      socket.emit('error', { message: 'Failed to update element' });
    }
  });

  // OPTIMIZED Element delete
  socket.on('element:delete', async (data: ElementDeleteData) => {
    try {
      const { roomId, elementId } = data;
      console.log(`🗑️ [Room ${roomId}] User ${socket.userId} deleting element ${elementId}`);

      // Quick participant check
      const isParticipant = await verifyParticipant(roomId, socket.userId);
      if (!isParticipant) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // Soft delete and broadcast immediately
      await prisma.element.update({
        where: { id: elementId },
        data: { deletedAt: new Date() },
      });

      io.to(roomId).emit('element:deleted', { elementId });

      // Update room timestamp in background
      setImmediate(() => {
        prisma.room.update({
          where: { id: roomId },
          data: {},
        }).catch(err => console.error('Failed to update room timestamp:', err));
      });

      console.log(`✅ [Room ${roomId}] Element ${elementId} deleted`);
    } catch (error) {
      console.error('Error deleting element:', error);
      socket.emit('error', { message: 'Failed to delete element' });
    }
  });

  // Room clear (unchanged)
  socket.on('room:clear', async (data: RoomClearData) => {
    try {
      const { roomId } = data;

      // Verify user is room creator
      const room = await prisma.room.findFirst({
        where: {
          id: roomId,
          createdBy: socket.userId,
        },
      });

      if (!room) {
        socket.emit('error', { message: 'Only room creator can clear the canvas' });
        return;
      }

      // Soft delete all elements
      await prisma.element.updateMany({
        where: {
          roomId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      // Update room timestamp
      await prisma.room.update({
        where: { id: roomId },
        data: {},
      });

      // Broadcast to all in room
      io.to(roomId).emit('room:cleared', { roomId });
    } catch (error) {
      console.error('Error clearing room:', error);
      socket.emit('error', { message: 'Failed to clear room' });
    }
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    try {
      // Clear all cache entries for this user
      for (const [key] of participantCache) {
        if (key.endsWith(`:${socket.userId}`)) {
          participantCache.delete(key);
        }
      }

      // Get all rooms the user is active in
      const activeRooms = await prisma.roomParticipant.findMany({
        where: {
          userId: socket.userId,
          isActive: true,
        },
      });

      // Update status
      for (const participant of activeRooms) {
        await prisma.roomParticipant.update({
          where: {
            roomId_userId: {
              roomId: participant.roomId,
              userId: socket.userId,
            },
          },
          data: { 
            isActive: false,
            leftAt: new Date(),
          },
        });

        // Check if all participants have left
        const activeCount = await prisma.roomParticipant.count({
          where: {
            roomId: participant.roomId,
            isActive: true,
          },
        });

        if (activeCount === 0) {
          await prisma.room.update({
            where: { id: participant.roomId },
            data: {
              isActive: false,
            },
          });
          
          console.log(`💤 Room ${participant.roomId} marked inactive - all participants disconnected`);
        }
      }
    } catch (error) {
      console.error('Error handling disconnect:', error);
    }
  });
};