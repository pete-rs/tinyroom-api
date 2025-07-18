import { Server, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { ElementType, NotificationType, PhotoStyle, LinkStyle } from '@prisma/client';
import { NotificationService } from '../services/notificationService';
import { InAppNotificationService } from '../services/inAppNotificationService';
import { getElementsWithReactions } from '../utils/elementHelpers';
import { getSmallThumbnailUrl } from '../utils/thumbnailHelpers';
import { socketThrottle } from '../utils/socketThrottle';
import { chunkArray, getRoomSize } from '../utils/arrayHelpers';

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
  smallThumbnailUrl?: string;
  duration?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  stickerText?: string;
  // Photo style fields
  imageAlphaMaskUrl?: string;
  imageThumbnailAlphaMaskUrl?: string;
  selectedStyle?: string;
  // Link style fields
  linkStyle?: string;
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
  stickerText?: string;
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

      // Check room size before joining
      const currentRoomSize = await getRoomSize(io, roomId);
      const MAX_ROOM_SIZE = 100; // Limit to 100 concurrent users per room
      
      if (currentRoomSize >= MAX_ROOM_SIZE) {
        console.log(`❌ [Room ${roomId}] Room is full (${currentRoomSize}/${MAX_ROOM_SIZE})`);
        socket.emit('error', { message: 'Room is full. Please try again later.' });
        return;
      }
      
      // Join socket room
      socket.join(roomId);
      console.log(`✅ [Room ${roomId}] User ${socket.userId} joined socket room (${currentRoomSize + 1}/${MAX_ROOM_SIZE})`);

      // Update participant status
      await prisma.roomParticipant.update({
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
      });

      // Notify others
      socket.to(roomId).emit('user:joined', {
        userId: socket.userId,
        username: participant.user.username || participant.user.email,
        color: participant.color,
      });

      // Get room background info
      const roomInfo = await prisma.room.findUnique({
        where: { id: roomId },
        select: {
          backgroundColor: true,
          backgroundImageUrl: true,
          backgroundImageThumbUrl: true,
        },
      });

      // Send room background info
      if (roomInfo && (roomInfo.backgroundColor || roomInfo.backgroundImageUrl)) {
        socket.emit('room:background', {
          backgroundColor: roomInfo.backgroundColor,
          backgroundImageUrl: roomInfo.backgroundImageUrl,
          backgroundImageThumbUrl: roomInfo.backgroundImageThumbUrl,
        });
      }

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
            smallThumbnailUrl: element.smallThumbnailUrl,
            duration: element.duration,
            createdBy: element.createdBy,
            rotation: element.rotation,
            scaleX: element.scaleX,
            scaleY: element.scaleY,
            stickerText: element.stickerText,
            zIndex: element.zIndex,
            reactions: element.reactions,
            // Photo style fields
            imageAlphaMaskUrl: element.imageAlphaMaskUrl,
            imageThumbnailAlphaMaskUrl: element.imageThumbnailAlphaMaskUrl,
            selectedStyle: element.selectedStyle,
            // Link style fields
            linkStyle: element.linkStyle,
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
              stickerText: element.stickerText,
              zIndex: element.zIndex,
              reactions: element.reactions,
              // Photo style fields
              imageAlphaMaskUrl: element.imageAlphaMaskUrl,
              imageThumbnailAlphaMaskUrl: element.imageThumbnailAlphaMaskUrl,
              selectedStyle: element.selectedStyle,
              // Link style fields
              linkStyle: element.linkStyle,
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

  // Touch tracking (throttled to max 30 events/second per user)
  socket.on('touch:move', async (data: TouchMoveData) => {
    const { roomId, x, y, elementId } = data;
    
    // Verify user is in room
    const rooms = Array.from(socket.rooms);
    if (!rooms.includes(roomId)) {
      console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room, rejecting touch:move`);
      socket.emit('error', { message: 'Not in room' });
      socket.emit('room:rejoin-needed', { roomId });
      return;
    }

    // Throttle to 30 events per second (33ms delay)
    const throttleKey = `${socket.userId}-touch-move`;
    socketThrottle.throttle(
      throttleKey,
      data,
      () => {
        console.log(`👆 [Room ${roomId}] Touch move from ${socket.userId} at (${x}, ${y})${elementId ? ` for element ${elementId}` : ''}`);
        
        // Broadcast to others in room (not sender)
        socket.to(roomId).emit('touch:moved', {
          userId: socket.userId,
          x,
          y,
          elementId,  // Include elementId when present (element dragging)
        });
      },
      33 // 33ms = ~30 events per second
    );
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
      const { 
        roomId, type, positionX, positionY, width, height, content, 
        imageUrl, audioUrl, videoUrl, thumbnailUrl, smallThumbnailUrl, duration, 
        rotation, scaleX, scaleY, stickerText,
        imageAlphaMaskUrl, imageThumbnailAlphaMaskUrl, selectedStyle,
        linkStyle 
      } = data;
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

      // Get the highest z-index in the room to place new element on top
      const highestZIndex = await prisma.element.findFirst({
        where: { 
          roomId,
          deletedAt: null 
        },
        select: { zIndex: true },
        orderBy: { zIndex: 'desc' }
      });
      const newZIndex = (highestZIndex?.zIndex ?? -1) + 1;

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
          smallThumbnailUrl: smallThumbnailUrl || null,
          duration: duration || null,
          rotation: rotation || 0,
          scaleX: scaleX || 1,
          scaleY: scaleY || 1,
          stickerText: stickerText || null,
          imageAlphaMaskUrl: imageAlphaMaskUrl || null,
          imageThumbnailAlphaMaskUrl: imageThumbnailAlphaMaskUrl || null,
          selectedStyle: selectedStyle as PhotoStyle | null || (imageAlphaMaskUrl ? 'squared_photo' as PhotoStyle : null),
          linkStyle: linkStyle as LinkStyle | null || (type.toUpperCase() === 'LINK' ? 'default' as LinkStyle : null),
          zIndex: newZIndex,
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

      // Update room's objectAddedAt timestamp when element is created
      await prisma.room.update({
        where: { id: roomId },
        data: {
          objectAddedAt: new Date(),
        },
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
          smallThumbnailUrl: element.smallThumbnailUrl,
          duration: element.duration,
          createdBy: element.createdBy,
          createdAt: element.createdAt,
          creator: element.creator,
          rotation: element.rotation,
          scaleX: element.scaleX,
          scaleY: element.scaleY,
          stickerText: element.stickerText,
          imageAlphaMaskUrl: element.imageAlphaMaskUrl,
          imageThumbnailAlphaMaskUrl: element.imageThumbnailAlphaMaskUrl,
          selectedStyle: element.selectedStyle,
          linkStyle: element.linkStyle,
          zIndex: element.zIndex,
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

      console.log(`📤 [Room ${roomId}] Broadcasted element:created to all participants`);
      
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

          // Send notifications to other participants (non-blocking)
          const creator = socket.user;
          if (creator && updatedRoom && updatedRoom.participants.length > 0) {
            // Prepare thumbnail URL if available
            let notificationThumbnailUrl = null;
            const lowerType = type.toLowerCase();
            if (lowerType === 'photo' && imageUrl) {
              notificationThumbnailUrl = getSmallThumbnailUrl(imageUrl);
              console.log(`📸 [PHOTO THUMBNAIL] Generated thumbnail URL: ${notificationThumbnailUrl}`);
            } else if (lowerType === 'video' && (thumbnailUrl || videoUrl)) {
              notificationThumbnailUrl = getSmallThumbnailUrl(thumbnailUrl || videoUrl);
              console.log(`🎥 [VIDEO THUMBNAIL] Generated thumbnail URL: ${notificationThumbnailUrl}`);
            }
            console.log(`🔔 [NOTIFICATION] Creating notification with thumbnail: ${notificationThumbnailUrl}`);
            console.log(`🔔 [NOTIFICATION] Element type: ${type}, imageUrl: ${imageUrl}, videoUrl: ${videoUrl}`);
            

            await Promise.all(
              updatedRoom.participants.map(async participant => {
                // Push notification
                NotificationService.notifyElementAdded(
                  creator.firstName || creator.username,
                  participant.userId,
                  roomId,
                  updatedRoom.name,
                  type.toLowerCase() as 'note' | 'photo' | 'audio' | 'horoscope' | 'video' | 'link'
                ).catch(err => {
                  console.error(`❌ Failed to send push notification to ${participant.user.username}:`, err.message);
                });

                // In-app notification (batched)
                await InAppNotificationService.createNotification({
                  userId: participant.userId,
                  type: NotificationType.ELEMENT_ADDED,
                  actorId: socket.userId,
                  roomId,
                  data: {
                    elementType: type.toUpperCase(),
                    roomName: updatedRoom.name,
                    thumbnailUrl: notificationThumbnailUrl,
                  },
                });
              })
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
      const { roomId, elementId, positionX, positionY, content, rotation, scaleX, scaleY, stickerText } = data;
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

      // Get the highest z-index in the room to bring this element to front
      const highestZIndex = await prisma.element.findFirst({
        where: { 
          roomId,
          deletedAt: null,
          id: { not: elementId } // Exclude current element
        },
        select: { zIndex: true },
        orderBy: { zIndex: 'desc' }
      });
      
      const newZIndex = Math.max((highestZIndex?.zIndex ?? -1) + 1, existingElement.zIndex);
      const shouldUpdateZIndex = newZIndex > existingElement.zIndex;

      // Update element (including z-index to bring to front)
      const element = await prisma.element.update({
        where: { id: elementId },
        data: {
          positionX,
          positionY,
          ...(content !== undefined && { content }),
          ...(rotation !== undefined && { rotation }),
          ...(scaleX !== undefined && { scaleX }),
          ...(scaleY !== undefined && { scaleY }),
          ...(stickerText !== undefined && { stickerText }),
          ...(shouldUpdateZIndex && { zIndex: newZIndex }),
        },
      });

      console.log(`✅ [Room ${roomId}] Element ${elementId} updated`);

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
          ...(stickerText !== undefined && { stickerText }),
          ...(shouldUpdateZIndex && { zIndex: newZIndex }),
        },
      });

      // If z-index changed, also emit specific z-index change event
      if (shouldUpdateZIndex) {
        io.to(roomId).emit('element:z-index-changed', {
          elementId,
          zIndex: newZIndex,
        });
        console.log(`⬆️ [Room ${roomId}] Element ${elementId} brought to front (z-index: ${newZIndex})`);
      }

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

  // Handle live transform preview (during gesture) - throttled to max 10 events/second
  socket.on('element:transforming', async (data: ElementTransformData) => {
    try {
      const { roomId, elementId, transform } = data;
      
      // Quick verification user is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room for transform`);
        socket.emit('error', { message: 'Not in room' });
        return;
      }
      
      // Throttle to 10 events per second (100ms delay)
      const throttleKey = `${socket.userId}-transform-${elementId}`;
      socketThrottle.throttle(
        throttleKey,
        data,
        async () => {
          console.log(`🔄 [Room ${roomId}] User ${socket.userId} live transforming element ${elementId}:`, {
            rotation: transform.rotation,
            scaleX: transform.scaleX,
            scaleY: transform.scaleY
          });
          
          // Get other users in room for logging
          const roomSockets = await io.in(roomId).fetchSockets();
          const otherUsers = roomSockets.filter(s => s.id !== socket.id).length;
          console.log(`📤 [Room ${roomId}] Broadcasting element:transforming to ${otherUsers} other users`);
          
          // Broadcast preview to others (no DB write)
          socket.to(roomId).emit('element:transforming', {
            elementId,
            userId: socket.userId,
            transform,
          });
        },
        100 // 100ms = 10 events per second
      );
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
      
      // Get the highest z-index in the room to bring this element to front
      const highestZIndex = await prisma.element.findFirst({
        where: { 
          roomId,
          deletedAt: null,
          id: { not: elementId } // Exclude current element
        },
        select: { zIndex: true },
        orderBy: { zIndex: 'desc' }
      });
      
      const newZIndex = Math.max((highestZIndex?.zIndex ?? -1) + 1, existingElement.zIndex);
      const shouldUpdateZIndex = newZIndex > existingElement.zIndex;

      // Update element with transform (and bring to front)
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
          ...(shouldUpdateZIndex && { zIndex: newZIndex }),
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
          zIndex: element.zIndex,
        }
      });

      // If z-index changed, also emit specific z-index change event
      if (shouldUpdateZIndex) {
        io.to(roomId).emit('element:z-index-changed', {
          elementId,
          zIndex: newZIndex,
        });
        console.log(`⬆️ [Room ${roomId}] Element ${elementId} brought to front during transform (z-index: ${newZIndex})`);
      }
      
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

  // Handle bringing element to front (z-index update)
  socket.on('element:bring-to-front', async (data: { roomId: string; elementId: string }) => {
    try {
      console.log('🔍 [BRING TO FRONT] Raw data received:', data);
      
      if (!data || typeof data !== 'object') {
        console.error('❌ [BRING TO FRONT] Invalid data format. Expected object with roomId and elementId');
        socket.emit('error', { message: 'Invalid data format for bring-to-front' });
        return;
      }
      
      const { roomId, elementId } = data;
      
      if (!roomId || !elementId) {
        console.error('❌ [BRING TO FRONT] Missing required fields:', { roomId, elementId });
        socket.emit('error', { message: 'roomId and elementId are required' });
        return;
      }
      
      console.log(`⬆️ [Room ${roomId}] User ${socket.userId} bringing element ${elementId} to front`);
      
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
        select: { zIndex: true },
      });
      
      if (!existingElement) {
        console.log(`❌ [Room ${roomId}] Element ${elementId} not found`);
        socket.emit('error', { message: `Element ${elementId} not found` });
        return;
      }
      
      // Get the highest z-index in the room
      const highestZIndex = await prisma.element.findFirst({
        where: { 
          roomId,
          deletedAt: null 
        },
        select: { zIndex: true },
        orderBy: { zIndex: 'desc' }
      });
      
      const newZIndex = (highestZIndex?.zIndex ?? 0) + 1;
      
      // Only update if it's not already on top
      if (existingElement.zIndex < newZIndex - 1) {
        // Update element z-index
        await prisma.element.update({
          where: { id: elementId },
          data: { zIndex: newZIndex },
        });
        
        console.log(`✅ [Room ${roomId}] Element ${elementId} moved to z-index ${newZIndex}`);
        
        // Broadcast z-index change to all participants
        io.to(roomId).emit('element:z-index-changed', {
          elementId,
          zIndex: newZIndex,
        });
      } else {
        console.log(`ℹ️ [Room ${roomId}] Element ${elementId} already on top (z-index: ${existingElement.zIndex})`);
      }
    } catch (error) {
      console.error('Error bringing element to front:', error);
      socket.emit('error', { message: 'Failed to bring element to front' });
    }
  });

  // Room-level reaction handler (for real-time updates after REST API calls)
  socket.on('room:reaction:toggle', async (data: { roomId: string; emoji?: string }) => {
    try {
      console.log(`❤️ [Room ${data.roomId}] Reaction toggle notification from ${socket.userId}`);
      
      // This is mainly for clients to notify about reaction changes
      // The actual toggle happens via REST API
      // We just broadcast the update to other users
      
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(data.roomId)) {
        console.log(`❌ [Room ${data.roomId}] User ${socket.userId} not in room`);
        return;
      }
      
      // Note: The REST API already handles the broadcast
      // This handler is kept for potential future use
    } catch (error) {
      console.error('Error handling room reaction toggle:', error);
    }
  });
  
  // Room-level comment handler (for real-time updates after REST API calls)
  socket.on('room:comment:create', async (data: { roomId: string; text: string; referencedElementId?: string }) => {
    try {
      console.log(`💬 [Room ${data.roomId}] Comment creation notification from ${socket.userId}`);
      
      // This is mainly for clients to notify about new comments
      // The actual creation happens via REST API
      // We just verify the user is in the room
      
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(data.roomId)) {
        console.log(`❌ [Room ${data.roomId}] User ${socket.userId} not in room`);
        return;
      }
      
      // Note: The REST API already handles the broadcast
      // This handler is kept for potential future use
    } catch (error) {
      console.error('Error handling room comment creation:', error);
    }
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

  // Handle room background change (for real-time updates after REST API calls)
  socket.on('room:background:update', async (data: { roomId: string; backgroundColor?: string; backgroundImageUrl?: string; backgroundImageThumbUrl?: string }) => {
    try {
      console.log(`🎨 [Room ${data.roomId}] Background update notification from ${socket.userId}`);
      
      // Verify the user is in the room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(data.roomId)) {
        console.log(`❌ [Room ${data.roomId}] User ${socket.userId} not in room`);
        return;
      }
      
      // Note: The REST API already handles the broadcast via socketService
      // This handler is kept for potential future use or manual triggers
    } catch (error) {
      console.error('Error handling room background update:', error);
    }
  });

  // Handle disconnect (called from index.ts)
  // Handle photo style update
  socket.on('element:photo-style', async (data: { roomId: string; elementId: string; selectedStyle: string }) => {
    try {
      const { roomId, elementId, selectedStyle } = data;
      
      console.log(`🎨 [Room ${roomId}] User ${socket.userId} updating photo style for element ${elementId} to ${selectedStyle}`);
      
      // Verify user is in room
      const rooms = Array.from(socket.rooms);
      if (!rooms.includes(roomId)) {
        console.log(`❌ [Room ${roomId}] User ${socket.userId} not in room for photo style update`);
        socket.emit('error', { message: 'Not in room' });
        socket.emit('room:rejoin-needed', { roomId });
        return;
      }
      
      // Validate style
      const validStyles = ['squared_photo', 'rounded_photo', 'polaroid_photo', 'cutout', 'cutout_white_sticker', 'cutout_black_sticker'];
      if (!validStyles.includes(selectedStyle)) {
        console.log(`❌ Invalid photo style: ${selectedStyle}`);
        socket.emit('error', { message: 'Invalid photo style' });
        return;
      }
      
      // Check if element exists and is a photo
      const element = await prisma.element.findFirst({
        where: {
          id: elementId,
          roomId: roomId,
          type: 'PHOTO',
          deletedAt: null,
        },
      });
      
      if (!element) {
        console.log(`❌ [Room ${roomId}] Photo element ${elementId} not found`);
        socket.emit('error', { message: 'Photo element not found' });
        return;
      }
      
      // Check if style requires alpha mask
      const cutoutStyles = ['cutout', 'cutout_white_sticker', 'cutout_black_sticker'];
      if (cutoutStyles.includes(selectedStyle) && !element.imageAlphaMaskUrl) {
        console.log(`❌ [Room ${roomId}] Photo element ${elementId} cannot use cutout style (no alpha mask)`);
        socket.emit('error', { message: 'Cutout styles require an alpha mask' });
        return;
      }
      
      // Update the photo style
      await prisma.element.update({
        where: { id: elementId },
        data: { selectedStyle: selectedStyle as PhotoStyle },
      });
      
      console.log(`✅ [Room ${roomId}] Photo style updated for element ${elementId}`);
      
      // Broadcast style change to all participants
      io.to(roomId).emit('element:photo-style-changed', {
        elementId,
        selectedStyle,
        userId: socket.userId,
      });
      
      console.log(`📤 [Room ${roomId}] Broadcasted element:photo-style-changed to all participants`);
    } catch (error) {
      console.error('Error updating photo style:', error);
      socket.emit('error', { message: 'Failed to update photo style' });
    }
  });

  // Update link style
  socket.on('element:link-style', async (data: { roomId: string; elementId: string; linkStyle: string }) => {
    try {
      const { roomId, elementId, linkStyle } = data;
      console.log(`🔗 [Room ${roomId}] User ${socket.userId} updating link style for ${elementId} to ${linkStyle}`);
      
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

      // Verify element exists and is a link
      const element = await prisma.element.findFirst({
        where: {
          id: elementId,
          roomId,
          type: 'LINK',
          deletedAt: null,
        },
      });

      if (!element) {
        socket.emit('error', { message: 'Link element not found' });
        return;
      }

      // Validate link style
      const validStyles = ['default', 'clear', 'style1', 'style2'];
      if (!validStyles.includes(linkStyle)) {
        socket.emit('error', { message: 'Invalid link style' });
        return;
      }

      // Update link style
      await prisma.element.update({
        where: { id: elementId },
        data: { linkStyle: linkStyle as LinkStyle },
      });

      // Broadcast to all in room
      io.to(roomId).emit('element:link-style-changed', {
        elementId,
        linkStyle,
        userId: socket.userId,
      });

      console.log(`📤 [Room ${roomId}] Broadcasted element:link-style-changed to all participants`);
    } catch (error) {
      console.error('Error updating link style:', error);
      socket.emit('error', { message: 'Failed to update link style' });
    }
  });

  socket.on('disconnect', async () => {
    try {
      // Clean up throttle data for this user
      socketThrottle.cleanup(`${socket.userId}-touch-move`);
      // Clean up any transform throttles (we don't know all element IDs, so this is a limitation)
      
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