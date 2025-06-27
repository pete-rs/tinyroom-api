import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { ElementType } from '@prisma/client';
import { NotificationService } from '../services/notificationService';
import { getElementsWithReactions } from '../utils/elementHelpers';

interface SocketWithUser extends Socket {
  userId: string;
  user: any;
}

interface TouchMoveData {
  roomId: string;
  x: number;
  y: number;
  elementId?: string;  // Optional: present when dragging an element
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
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

interface ElementUpdateData {
  roomId: string;
  elementId: string;
  positionX: number;
  positionY: number;
  content?: string;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}

interface ElementDeleteData {
  roomId: string;
  elementId: string;
}

interface RoomClearData {
  roomId: string;
}

interface ElementTransformData {
  roomId: string;
  elementId: string;
  transform: {
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
  };
}

interface ElementTransformFinalData extends ElementTransformData {
  positionX: number;
  positionY: number;
  width: number;
  height: number;
}

export const setupRoomHandlers = (io: Server, socket: SocketWithUser) => {
  // Join room
  socket.on('room:join', async ({ roomId }: { roomId: string }) => {
    try {
      console.log(`🚪 [Room ${roomId}] User ${socket.userId} joining room`);
      
      // Parallel queries for better performance
      const [participant, elements] = await Promise.all([
        // Get participant data
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
        // Get room elements with reactions
        getElementsWithReactions(roomId, socket.userId),
      ]);

      if (!participant) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'You are not a participant in this room' });
        return;
      }

      // Room found and user is a participant

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

      console.log(`📊 [Room ${roomId}] Sending ${elements.length} existing elements to joining user`);

      if (elements.length > 0) {
        // OPTIMIZATION: Send all elements in a single batch
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
            rotation: element.rotation,
            scaleX: element.scaleX,
            scaleY: element.scaleY,
            reactions: element.reactions,
            stats: {
              totalComments: element.comments?.count || 0,
              totalReactions: element.reactions?.count || 0,
              hasReacted: element.reactions?.hasReacted || false,
              topReactors: element.reactions?.topReactors || [],
            },
          })),
        });
        
        // Also send individual element:created events for backward compatibility
        // TODO: Remove this after iOS clients are updated
        elements.forEach(element => {
          socket.emit('element:created', {
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
              createdAt: element.createdAt,
              creator: element.creator,
              rotation: element.rotation,
              scaleX: element.scaleX,
              scaleY: element.scaleY,
              reactions: element.reactions,
              stats: {
                totalComments: element.comments?.count || 0,
                totalReactions: element.reactions?.count || 0,
                hasReacted: element.reactions?.hasReacted || false,
                topReactors: element.reactions?.topReactors || [],
              },
            },
          });
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

      // If no active participants, lock the room
      if (activeParticipants === 0) {
        await prisma.room.update({
          where: { id: roomId },
          data: {
            isActive: false,
            // updatedAt will be auto-updated
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

  // Touch tracking
  socket.on('touch:move', async (data: TouchMoveData) => {
    const { roomId, x, y, elementId } = data;
    console.log(`👆 [Room ${roomId}] Touch move from ${socket.userId} at (${x}, ${y})${elementId ? ` for element ${elementId}` : ''}`);

    // Verify user is in room
    const rooms = Array.from(socket.rooms);
    if (!rooms.includes(roomId)) {
      console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room, rejecting touch:move`);
      socket.emit('error', { message: 'Not in room' });
      socket.emit('room:rejoin-needed', { roomId });
      return;
    }

    // Broadcast to others in room (not sender)
    socket.to(roomId).emit('touch:moved', {
      userId: socket.userId,
      x,
      y,
      elementId,  // Include elementId when present (element dragging)
    });
  });

  socket.on('touch:end', async (data: TouchEndData) => {
    const { roomId } = data;
    console.log(`👆 [Room ${roomId}] Touch end from ${socket.userId}`);

    // Verify user is in room
    const rooms = Array.from(socket.rooms);
    if (!rooms.includes(roomId)) {
      socket.emit('error', { message: 'Not in room' });
      return;
    }

    // Broadcast to others in room (not sender)
    socket.to(roomId).emit('touch:ended', {
      userId: socket.userId,
    });
  });

  // Element management
  socket.on('element:create', async (data: ElementCreateData, callback?: Function) => {
    try {
      const { roomId, type, positionX, positionY, width, height, content, imageUrl, audioUrl, videoUrl, thumbnailUrl, duration, rotation, scaleX, scaleY } = data;
      console.log(`📦 [Room ${roomId}] User ${socket.userId} creating ${type.toUpperCase()} element at (${positionX}, ${positionY})`);

      // Verify user is in room and room is not locked
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          participants: {
            where: { userId: socket.userId },
          },
        },
      });

      if (!room || room.participants.length === 0) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // User can create elements in the room

      // Create element with server-generated ID
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
          rotation: rotation || 0,
          scaleX: scaleX || 1,
          scaleY: scaleY || 1,
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              avatarUrl: true,
            },
          },
        },
      });

      console.log(`✅ [Room ${roomId}] Element created with ID: ${element.id}`);

      // Update room's updatedAt timestamp IMMEDIATELY (not in background)
      await prisma.room.update({
        where: { id: roomId },
        data: {}, // Empty update will trigger @updatedAt
      });

      // OPTIMIZATION: Send response immediately for instant feedback
      const elementResponse = {
        element: {
          id: element.id,  // Server-generated ID
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
          createdAt: element.createdAt,
          creator: element.creator,
          rotation: element.rotation,
          scaleX: element.scaleX,
          scaleY: element.scaleY,
          reactions: {
            count: 0,
            hasReacted: false,
            userEmoji: null,
            topReactors: [],
          },
          stats: {
            totalComments: 0,
            totalReactions: 0,
            hasReacted: false,
            topReactors: [],
          },
        },
      };
      
      // Emit to sender immediately (even if not in room)
      socket.emit('element:created', elementResponse);
      
      // Also broadcast to all others in room
      socket.to(roomId).emit('element:created', elementResponse);

      // ALSO broadcast globally for element count tracking in MyRooms
      io.emit('element:created:global', {
        roomId,
        elementId: element.id,
        createdBy: element.createdBy,
        type: element.type.toLowerCase(),
      });

      console.log(`📤 [Room ${roomId}] Broadcasted element:created to all participants and globally`);
      
      // Send acknowledgment if callback provided
      if (callback && typeof callback === 'function') {
        callback(elementResponse);
        console.log(`📤 [Room ${roomId}] Sent element:created acknowledgment to sender`);
      }

      // OPTIMIZATION: Handle notifications in background (but room update already done)
      setImmediate(async () => {
        try {
          // Get room details for notification
          const updatedRoom = await prisma.room.findUnique({
            where: { id: roomId },
            include: {
              participants: {
                where: {
                  userId: {
                    not: socket.userId,
                  },
                },
                include: {
                  user: true,
                },
              },
            },
          });

          // Send notification to other participants (non-blocking)
          const creator = socket.user;
          if (creator && updatedRoom && updatedRoom.participants.length > 0) {
            await Promise.all(
              updatedRoom.participants.map(participant =>
                NotificationService.notifyElementAdded(
                  creator.firstName || creator.username,
                  participant.userId,
                  roomId,
                  updatedRoom.name,
                  type.toLowerCase() as 'note' | 'photo' | 'audio' | 'horoscope' | 'video' | 'link'
                ).catch(err => {
                  console.error(`❌ Failed to send notification to ${participant.user.username}:`, err.message);
                })
              )
            );
          }
        } catch (error) {
          console.error('Error in background tasks:', error);
        }
      });
    } catch (error) {
      console.error('Error creating element:', error);
      socket.emit('error', { message: 'Failed to create element' });
    }
  });

  socket.on('element:update', async (data: ElementUpdateData) => {
    try {
      const { roomId, elementId, positionX, positionY, content, rotation, scaleX, scaleY } = data;
      console.log(`🔄 [Room ${roomId}] User ${socket.userId} updating element ${elementId}`);
      
      // Check if socket is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room, rejecting element:update`);
        socket.emit('error', { message: 'Not in room' });
        socket.emit('room:rejoin-needed', { roomId });
        return;
      }

      // Verify room is not locked
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          participants: {
            where: { userId: socket.userId },
          },
        },
      });

      if (!room || room.participants.length === 0) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // User can update elements in the room

      // Check if element exists first
      const existingElement = await prisma.element.findUnique({
        where: { id: elementId },
      });

      if (!existingElement) {
        console.log(`❌ [Room ${roomId}] Element ${elementId} not found`);
        socket.emit('error', { message: `Element ${elementId} not found` });
        return;
      }

      // Update element
      const element = await prisma.element.update({
        where: { id: elementId },
        data: {
          positionX,
          positionY,
          ...(content !== undefined && { content }),
          ...(rotation !== undefined && { rotation }),
          ...(scaleX !== undefined && { scaleX }),
          ...(scaleY !== undefined && { scaleY }),
        },
      });

      console.log(`✅ [Room ${roomId}] Element ${elementId} updated`);

      // Update room's updatedAt timestamp IMMEDIATELY (not in background)
      await prisma.room.update({
        where: { id: roomId },
        data: {}, // Empty update will trigger @updatedAt
      });

      // OPTIMIZATION: Broadcast immediately
      io.to(roomId).emit('element:updated', {
        elementId,
        updates: {
          positionX,
          positionY,
          ...(content !== undefined && { content }),
          ...(rotation !== undefined && { rotation }),
          ...(scaleX !== undefined && { scaleX }),
          ...(scaleY !== undefined && { scaleY }),
        },
      });

      console.log(`📤 [Room ${roomId}] Broadcasted element:updated to all participants`);
    } catch (error) {
      console.error('Error updating element:', error);
      socket.emit('error', { message: 'Failed to update element' });
    }
  });

  socket.on('element:delete', async (data: ElementDeleteData) => {
    try {
      const { roomId, elementId } = data;
      console.log(`🗑️ [Room ${roomId}] User ${socket.userId} deleting element ${elementId}`);

      // Verify room is not locked
      const room = await prisma.room.findUnique({
        where: { id: roomId },
        include: {
          participants: {
            where: { userId: socket.userId },
          },
        },
      });

      if (!room || room.participants.length === 0) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} is not a participant`);
        socket.emit('error', { message: 'Not a participant in this room' });
        return;
      }

      // User can delete elements in the room

      // Soft delete element
      await prisma.element.update({
        where: { id: elementId },
        data: { deletedAt: new Date() },
      });

      console.log(`✅ [Room ${roomId}] Element ${elementId} deleted`);

      // Update room's updatedAt timestamp IMMEDIATELY (not in background)
      await prisma.room.update({
        where: { id: roomId },
        data: {}, // Empty update will trigger @updatedAt
      });

      // OPTIMIZATION: Broadcast immediately
      io.to(roomId).emit('element:deleted', { elementId });

      // ALSO broadcast globally for element count tracking in MyRooms
      io.emit('element:deleted:global', {
        roomId,
        elementId,
        deletedBy: socket.userId,
      });

      console.log(`📤 [Room ${roomId}] Broadcasted element:deleted to all participants and globally`);
    } catch (error) {
      console.error('Error deleting element:', error);
      socket.emit('error', { message: 'Failed to delete element' });
    }
  });

  // Handle live transform preview (during gesture)
  socket.on('element:transforming', async (data: ElementTransformData) => {
    try {
      const { roomId, elementId, transform } = data;
      
      // Quick verification user is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        socket.emit('error', { message: 'Not in room' });
        return;
      }
      
      // Broadcast preview to others (no DB write)
      socket.to(roomId).emit('element:transforming', {
        elementId,
        userId: socket.userId,
        transform,
      });
    } catch (error) {
      console.error('Error handling element transform preview:', error);
    }
  });

  // Handle final transform (when gesture ends)
  socket.on('element:transform', async (data: ElementTransformFinalData) => {
    try {
      const { roomId, elementId, transform, positionX, positionY, width, height } = data;
      
      console.log(`🔄 [Room ${roomId}] User ${socket.userId} transforming element ${elementId}`);
      
      // Verify user is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        socket.emit('error', { message: 'Not in room' });
        socket.emit('room:rejoin-needed', { roomId });
        return;
      }
      
      // Check if element exists
      const existingElement = await prisma.element.findUnique({
        where: { id: elementId },
      });
      
      if (!existingElement) {
        console.log(`❌ [Room ${roomId}] Element ${elementId} not found`);
        socket.emit('error', { message: `Element ${elementId} not found` });
        return;
      }
      
      // Update element with transform
      const element = await prisma.element.update({
        where: { id: elementId },
        data: {
          positionX,
          positionY,
          width,
          height,
          rotation: transform.rotation ?? existingElement.rotation,
          scaleX: transform.scaleX ?? existingElement.scaleX,
          scaleY: transform.scaleY ?? existingElement.scaleY,
        },
      });
      
      console.log(`✅ [Room ${roomId}] Element ${elementId} transformed`);
      
      // OPTIMIZATION: Broadcast immediately
      io.to(roomId).emit('element:transformed', {
        element: {
          id: element.id,
          type: element.type.toLowerCase(),
          positionX: element.positionX,
          positionY: element.positionY,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          scaleX: element.scaleX,
          scaleY: element.scaleY,
        }
      });
      
      // Update room timestamp in background
      setImmediate(() => {
        prisma.room.update({
          where: { id: roomId },
          data: {},
        }).catch(err => {
          console.error('Failed to update room timestamp:', err);
        });
      });
    } catch (error) {
      console.error('Error handling element transform:', error);
      socket.emit('error', { message: 'Failed to transform element' });
    }
  });

  // DEPRECATED: Direct socket reaction toggle - clients should use REST API
  socket.on('element:reaction:toggle', async (data: { roomId: string; elementId: string }) => {
    console.log(`⚠️ [Room ${data.roomId}] Client attempted to use deprecated socket reaction toggle`);
    socket.emit('error', { 
      message: 'Please use REST API endpoint POST /api/rooms/:roomId/elements/:elementId/reactions/toggle',
      code: 'USE_REST_API'
    });
  });

  socket.on('room:clear', async (data: RoomClearData) => {
    try {
      const { roomId } = data;

      // Verify user is room creator and room is not locked
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

      // Room creator can clear the room

      // Soft delete all elements
      await prisma.element.updateMany({
        where: {
          roomId,
          deletedAt: null,
        },
        data: { deletedAt: new Date() },
      });

      // Update room's updatedAt timestamp
      await prisma.room.update({
        where: { id: roomId },
        data: {}, // Empty update will trigger @updatedAt
      });

      // Broadcast to all in room
      io.to(roomId).emit('room:cleared', { roomId });

      // ALSO broadcast globally for element count tracking in MyRooms
      io.emit('room:cleared:global', {
        roomId,
        clearedBy: socket.userId,
      });
    } catch (error) {
      console.error('Error clearing room:', error);
      socket.emit('error', { message: 'Failed to clear room' });
    }
  });

  // Handle disconnect (called from index.ts)
  socket.on('disconnect', async () => {
    try {
      // Get all rooms the user is active in
      const activeRooms = await prisma.roomParticipant.findMany({
        where: {
          userId: socket.userId,
          isActive: true,
        },
      });

      // Update status and notify others
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

        // If no active participants, mark room as inactive
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