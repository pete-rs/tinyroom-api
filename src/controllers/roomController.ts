import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPagination, getPaginationMeta } from '../utils/pagination';
import { getAvailableColor } from '../utils/colors';
import { NotificationService } from '../services/notificationService';
import { userSelect } from '../utils/prismaSelects';
import { socketService } from '../services/socketService';
import { generateRoomColors } from '../utils/roomColors';
import { getElementsWithReactions } from '../utils/elementHelpers';
import { getSmallThumbnailUrl } from '../utils/thumbnailHelpers';

export const getRooms = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { skip, take } = getPagination({ page, limit });

    const [rooms, totalCount] = await Promise.all([
      prisma.room.findMany({
        where: {
          participants: {
            some: {
              userId: req.user.id,
            },
          },
        },
        include: {
          creator: {
            select: {
              id: true,
              username: true,
              firstName: true,
              email: true,
            },
          },
          nameSetByUser: {
            select: {
              id: true,
              username: true,
              firstName: true,
              avatarUrl: true,
            },
          },
          participants: {
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
          },
          _count: {
            select: {
              elements: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
        skip,
        take,
      }),
      prisma.room.count({
        where: {
          participants: {
            some: {
              userId: req.user.id,
            },
          },
        },
      }),
    ]);

    const meta = getPaginationMeta(totalCount, page, limit);

    res.json({
      data: rooms,
      meta,
    });
  } catch (error) {
    throw error;
  }
};

export const createRoom = async (req: AuthRequest, res: Response) => {
  const startTime = Date.now();
  const timings: Record<string, { start: number; end: number; duration: number }> = {};
  
  const logTiming = (taskName: string, start: number) => {
    const end = Date.now();
    const duration = end - start;
    const elapsed = end - startTime;
    timings[taskName] = { start: start - startTime, end: elapsed, duration };
    
    console.log(`⏱️  [${taskName}] Completed at ${elapsed}ms (took ${duration}ms)`);
  };

  try {
    console.log('\n🚀 ========== ROOM CREATION STARTED ==========');
    console.log(`📅 Timestamp: ${new Date().toISOString()}`);
    console.log(`👤 User: ${req.user?.id || 'unknown'}`);
    
    const { name, participantIds } = req.body;
    
    console.log('📥 Request Details:', {
      roomName: name,
      participantCount: participantIds?.length || 0,
      participantIds: participantIds,
      requestSize: JSON.stringify(req.body).length + ' bytes'
    });

    // VALIDATION PHASE
    const validationStart = Date.now();
    console.log(`\n🔍 [VALIDATION PHASE] Starting at ${validationStart - startTime}ms...`);

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (!name || !name.trim()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Room name is required');
    }

    if (!participantIds || !Array.isArray(participantIds)) {
      throw new AppError(400, 'INVALID_REQUEST', 'participantIds must be an array');
    }

    if (participantIds.includes(req.user.id)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Creator should not be in participant list');
    }
    
    logTiming('Validation', validationStart);

    // PARTICIPANT VERIFICATION PHASE - Skip for better performance
    // We'll handle missing participants gracefully
    if (participantIds.length > 0) {
      console.log(`\n👥 [PARTICIPANT VERIFICATION] Skipped for performance (${participantIds.length} participants)`);
    }

    // COLOR GENERATION PHASE
    const colorGenStart = Date.now();
    console.log(`\n🎨 [COLOR GENERATION] Starting at ${colorGenStart - startTime}ms...`);
    
    const colors = generateRoomColors(participantIds.length + 1);
    console.log(`   Generated ${colors.length} colors: ${colors.join(', ')}`);
    
    logTiming('Color Generation', colorGenStart);
    
    // PARTICIPANT DATA PREPARATION
    const prepStart = Date.now();
    console.log(`\n📋 [DATA PREPARATION] Starting at ${prepStart - startTime}ms...`);
    
    const participantData = [
      {
        userId: req.user.id,
        color: colors[0],
      },
      ...participantIds.map((userId: string, index: number) => ({
        userId,
        color: colors[index + 1],
      })),
    ];
    
    console.log('   Participant data structure:', participantData.map(p => ({
      userId: p.userId.substring(0, 8) + '...',
      color: p.color
    })));
    
    logTiming('Data Preparation', prepStart);
    
    // DATABASE TRANSACTION PHASE
    const dbStart = Date.now();
    console.log(`\n💾 [DATABASE TRANSACTION] Starting at ${dbStart - startTime}ms...`);
    console.log('   Creating room with:');
    console.log(`   - Name: "${name.trim()}"`);
    console.log(`   - Creator: ${req.user.id}`);
    console.log(`   - Participants: ${participantData.length} total`);
    
    const room = await prisma.room.create({
      data: {
        name: name.trim(),
        createdBy: req.user.id,
        participants: {
          create: participantData,
        },
      },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    console.log(`   ✅ Room created successfully`);
    console.log(`   - Room ID: ${room.id}`);
    console.log(`   - Created At: ${room.createdAt.toISOString()}`);
    
    logTiming('Database Transaction', dbStart);

    // RESPONSE PHASE
    const responseStart = Date.now();
    console.log(`\n📤 [RESPONSE PHASE] Starting at ${responseStart - startTime}ms...`);
    console.log(`   Sending response with room data (${JSON.stringify(room).length} bytes)`);
    
    res.status(201).json({
      data: room,
    });
    
    logTiming('Response Sent', responseStart);
    
    const totalTime = Date.now() - startTime;
    console.log(`\n✅ ========== ROOM CREATION COMPLETED ==========`);
    console.log(`⏱️  Total time: ${totalTime}ms`);
    console.log('\n📊 Performance Summary:');
    Object.entries(timings).forEach(([task, timing]) => {
      const percentage = ((timing.duration / totalTime) * 100).toFixed(1);
      console.log(`   ${task}: ${timing.duration}ms (${percentage}%)`);
    });
    console.log('================================================\n');

    // NOTIFICATION PHASE (non-blocking)
    setImmediate(() => {
      const notificationStart = Date.now();
      console.log(`\n🔔 [NOTIFICATION PHASE - ASYNC] Starting...`);
      
      const creator = req.user!;
      const otherParticipants = room.participants.filter(p => p.userId !== creator.id);
      
      console.log(`   Sending notifications to ${otherParticipants.length} participants`);
      
      // Send notifications in background
      otherParticipants.forEach((participant, index) => {
        const participantNotifStart = Date.now();
        
        NotificationService.notifyRoomCreated(
          creator.firstName || creator.username,
          participant.userId,
          room.id
        ).then(() => {
          const duration = Date.now() - participantNotifStart;
          console.log(`   ✅ Notification ${index + 1}/${otherParticipants.length} sent to ${participant.user.username} (${duration}ms)`);
        }).catch(err => {
          const duration = Date.now() - participantNotifStart;
          console.error(`   ❌ Notification ${index + 1}/${otherParticipants.length} failed for ${participant.user.username} (${duration}ms):`, err.message);
        });
      });
      
      // Log total notification phase time after a delay
      setTimeout(() => {
        const notifDuration = Date.now() - notificationStart;
        console.log(`\n🔔 [NOTIFICATION PHASE - COMPLETE] Total async time: ${notifDuration}ms`);
        console.log('================================================\n');
      }, 5000); // Check after 5 seconds
    });
  } catch (error) {
    const errorTime = Date.now() - startTime;
    console.log(`\n❌ [ERROR] Room creation failed at ${errorTime}ms`);
    console.log(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.log('================================================\n');
    throw error;
  }
};

export const testRoomPublicStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Multiple ways to check the value
    const prismaFindUnique = await prisma.room.findUnique({
      where: { id },
      select: { id: true, name: true, isPublic: true },
    });

    const prismaFindFirst = await prisma.room.findFirst({
      where: { id },
      select: { id: true, name: true, isPublic: true },
    });

    const rawQuery = await prisma.$queryRaw<any[]>`
      SELECT id, name, is_public FROM rooms WHERE id = ${id}
    `;

    res.json({
      prismaFindUnique,
      prismaFindFirst,
      rawQuery: rawQuery[0] || null,
      comparison: {
        findUniqueIsPublic: prismaFindUnique?.isPublic,
        findFirstIsPublic: prismaFindFirst?.isPublic,
        rawQueryIsPublic: rawQuery[0]?.is_public,
      }
    });
  } catch (error) {
    throw error;
  }
};

export const getRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Debug: Direct database query to check actual value
    const directQuery = await prisma.$queryRaw<any[]>`
      SELECT id, name, is_public FROM rooms WHERE id = ${id}
    `;
    console.log(`🔍 [GET ROOM ${id}] Direct DB query result:`, directQuery);

    // First try to find the room with user as participant
    let room = await prisma.room.findFirst({
      where: {
        id,
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    // If not found as participant, check if it's a public room
    if (!room) {
      room = await prisma.room.findFirst({
        where: {
          id,
          isPublic: true, // Only allow viewing public rooms if not a participant
        },
        include: {
          creator: {
            select: userSelect,
          },
          nameSetByUser: {
            select: {
              id: true,
              username: true,
              firstName: true,
              avatarUrl: true,
            },
          },
          participants: {
            include: {
              user: {
                select: userSelect,
              },
            },
          },
        },
      });
    }

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found or access denied');
    }

    // Debug logging to check isPublic value
    console.log(`🔍 [GET ROOM ${id}] Room from DB:`, {
      id: room.id,
      name: room.name,
      isPublic: room.isPublic,
      isPublicType: typeof room.isPublic,
      hasIsPublic: 'isPublic' in room,
      allKeys: Object.keys(room),
      rawRoom: JSON.stringify({ id: room.id, isPublic: room.isPublic }),
    });

    // Debug logging for creator field
    console.log(`👤 [GET ROOM ${id}] Creator info:`, {
      createdBy: room.createdBy,
      creatorExists: !!room.creator,
      creatorData: room.creator,
      participantCount: room.participants.length,
      participants: room.participants.map(p => ({
        userId: p.userId,
        username: p.user.username,
        isCreator: p.userId === room.createdBy,
      })),
    });

    // Fetch room reaction data
    const [reactionData, userReaction] = await Promise.all([
      // Get room reaction and comment count
      prisma.room.findUnique({
        where: { id: room.id },
        select: {
          reactionCount: true,
          lastReactionAt: true,
          commentCount: true,
          commentsUpdatedAt: true,
        },
      }),
      // Check if current user has reacted
      prisma.roomReaction.findUnique({
        where: {
          roomId_userId: {
            roomId: room.id,
            userId: req.user.id,
          },
        },
      }),
    ]);

    // Debug logging for reaction and comment data
    console.log(`\n❤️  [GET ROOM ${id}] Reaction & Comment data:`, {
      roomId: room.id,
      roomName: room.name,
      reactionCount: reactionData?.reactionCount || 0,
      lastReactionAt: reactionData?.lastReactionAt,
      commentCount: reactionData?.commentCount || 0,
      commentsUpdatedAt: reactionData?.commentsUpdatedAt,
      currentUserHasReacted: !!userReaction,
      currentUserReactionEmoji: userReaction?.emoji || null,
      currentUserId: req.user.id,
      currentUsername: req.user.username,
    });

    // Fetch elements with reactions
    const elements = await getElementsWithReactions(room.id, req.user.id);

    const response = {
      data: {
        ...room,
        elements,
        // Add reaction data to response
        reactionCount: reactionData?.reactionCount || 0,
        lastReactionAt: reactionData?.lastReactionAt,
        commentCount: reactionData?.commentCount || 0,
        commentsUpdatedAt: reactionData?.commentsUpdatedAt,
        userReaction: userReaction ? {
          hasReacted: true,
          emoji: userReaction.emoji,
        } : null,
      },
    };

    // Debug log the full response
    console.log(`\n📤 [GET ROOM ${id}] Full response:`, JSON.stringify({
      ...response.data,
      elements: `[${response.data.elements.length} elements]`, // Summarize elements to avoid clutter
      participants: `[${response.data.participants.length} participants]`, // Summarize participants
    }, null, 2));

    res.json(response);
  } catch (error) {
    throw error;
  }
};

export const joinRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const room = await prisma.room.findUnique({
      where: { id },
      include: {
        participants: true,
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    // Check if user is already a participant
    const existingParticipant = room.participants.find(p => p.userId === req.user!.id);
    
    if (!existingParticipant) {
      // For public rooms, allow non-participants to join
      if (!room.isPublic) {
        throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant in this room');
      }
      
      // Add user as a new participant to the public room
      const color = getAvailableColor(room.participants.map(p => p.color));
      await prisma.roomParticipant.create({
        data: {
          roomId: id,
          userId: req.user.id,
          color,
          isActive: true,
          lastVisitedAt: new Date(),
        },
      });
    } else {
      // Update existing participant to active and update last visit time
      await prisma.roomParticipant.update({
        where: {
          roomId_userId: {
            roomId: id,
            userId: req.user.id,
          },
        },
        data: {
          isActive: true,
          leftAt: null,
          lastVisitedAt: new Date(), // Update last visit timestamp
        },
      });
    }

    // Room updatedAt will be automatically updated by Prisma

    res.json({
      data: { message: 'Joined room successfully' },
    });
  } catch (error) {
    throw error;
  }
};

export const leaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Update participant status
    await prisma.roomParticipant.update({
      where: {
        roomId_userId: {
          roomId: id,
          userId: req.user.id,
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
        roomId: id,
        isActive: true,
      },
    });

    // If no active participants, mark room as inactive
    if (activeParticipants === 0) {
      await prisma.room.update({
        where: { id },
        data: {
          isActive: false,
        },
      });
    }

    res.json({
      data: { 
        message: 'Left room successfully',
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getRoomsGroupedByPerson = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Get all users that the current user has rooms with
    const usersWithRooms = await prisma.user.findMany({
      where: {
        id: {
          not: req.user.id,
        },
        roomParticipants: {
          some: {
            room: {
              participants: {
                some: {
                  userId: req.user.id,
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        username: true,
        firstName: true,
        email: true,
        avatarUrl: true,
        roomParticipants: {
          where: {
            room: {
              participants: {
                some: {
                  userId: req.user.id,
                },
              },
            },
          },
          select: {
            room: {
              select: {
                id: true,
                name: true,
                createdAt: true,
                updatedAt: true,
                isActive: true,
                _count: {
                  select: {
                    elements: {
                      where: {
                        deletedAt: null,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            room: {
              updatedAt: 'desc',
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    // Transform the data to group rooms by person
    const peopleWithRooms = usersWithRooms.map(user => ({
      id: user.id,
      username: user.username,
      firstName: user.firstName,
      email: user.email,
      avatarUrl: user.avatarUrl,
      rooms: user.roomParticipants.map(rp => ({
        id: rp.room.id,
        name: rp.room.name,
        createdAt: rp.room.createdAt,
        updatedAt: rp.room.updatedAt,
        isActive: rp.room.isActive,
        elementCount: rp.room._count.elements,
      })),
    }));

    res.json({
      data: peopleWithRooms,
    });
  } catch (error) {
    throw error;
  }
};

export const getRoomElements = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Check if user has access to room
    const room = await prisma.room.findFirst({
      where: {
        id,
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found or access denied');
    }

    const elements = await prisma.element.findMany({
      where: {
        roomId: id,
        deletedAt: null,
      },
      include: {
        creator: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    res.json({
      data: elements,
    });
  } catch (error) {
    throw error;
  }
};

export const updateRoomVisibility = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isPublic } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (typeof isPublic !== 'boolean') {
      throw new AppError(400, 'INVALID_REQUEST', 'isPublic must be a boolean value');
    }

    // Check if user is the creator of the room
    const room = await prisma.room.findFirst({
      where: {
        id,
        createdBy: req.user.id,
      },
    });

    if (!room) {
      throw new AppError(403, 'FORBIDDEN', 'Only the room creator can change visibility');
    }

    // Update room visibility
    const updatedRoom = await prisma.room.update({
      where: { id },
      data: { isPublic },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    // Emit socket event to all participants
    socketService.emitToRoom(id, 'room:visibility-changed', {
      roomId: id,
      isPublic,
      changedBy: req.user.id,
    });

    res.json({
      data: updatedRoom,
    });
  } catch (error) {
    throw error;
  }
};

export const updateRoomName = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    let { name } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Trim room name if provided
    if (name) {
      name = name.trim();
    }

    // Check if user has access to room
    const room = await prisma.room.findFirst({
      where: {
        id,
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found or access denied');
    }

    // Update room name
    const updatedRoom = await prisma.room.update({
      where: { id },
      data: { 
        name: name || null, // Allow clearing the name by passing empty string
        nameSetBy: name ? req.user.id : null, // Set nameSetBy only when name is provided
      },
      include: {
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Emit socket event to all participants in the room
    socketService.emitRoomUpdate(updatedRoom.id, updatedRoom);

    // Send response immediately
    res.json({
      data: updatedRoom,
    });

    // Send notification after response (non-blocking)
    if (name && req.user) {
      setImmediate(() => {
        const otherParticipants = updatedRoom.participants.filter(p => p.userId !== req.user!.id);
        otherParticipants.forEach(participant => {
          NotificationService.notifyRoomRenamed(
            req.user!.firstName || req.user!.username,
            participant.userId,
            updatedRoom.id,
            name
          ).catch(err => {
            console.error('❌ Failed to send room rename notification:', err);
          });
        });
      });
    }
  } catch (error) {
    throw error;
  }
};

export const deleteRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Check if user is the creator of the room
    const room = await prisma.room.findFirst({
      where: {
        id,
        createdBy: req.user.id,
      },
      include: {
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError(403, 'FORBIDDEN', 'Only the room creator can delete this room');
    }

    // Get all participants except creator for notifications
    const otherParticipants = room.participants.filter(p => p.userId !== req.user!.id);

    // Delete all elements associated with the room
    await prisma.element.deleteMany({
      where: { roomId: id },
    });

    // Delete all room participants
    await prisma.roomParticipant.deleteMany({
      where: { roomId: id },
    });

    // Delete the room
    await prisma.room.delete({
      where: { id },
    });

    // Send notifications to all other participants
    const creatorName = req.user.firstName || req.user.username;
    await Promise.all(
      otherParticipants.map(participant =>
        NotificationService.notifyRoomDeleted(
          creatorName,
          participant.userId,
          room.name
        )
      )
    );

    res.json({
      data: { 
        message: 'Room deleted successfully',
        roomId: id,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const deleteElement = async (req: AuthRequest, res: Response) => {
  const { roomId, elementId } = req.params;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  try {
    // Check if user is a participant in the room
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

    // Check if element exists and belongs to this room
    const element = await prisma.element.findFirst({
      where: {
        id: elementId,
        roomId: roomId,
        deletedAt: null,
      },
    });

    if (!element) {
      throw new AppError(404, 'NOT_FOUND', 'Element not found');
    }

    // Soft delete the element
    await prisma.element.update({
      where: { id: elementId },
      data: { deletedAt: new Date() },
    });

    // Update room's updatedAt timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: {}, // Empty update will trigger @updatedAt
    });

    res.json({
      data: {
        message: 'Element deleted successfully',
      },
    });
  } catch (error) {
    console.error('Error deleting element:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to delete element');
  }
};

export const permanentlyLeaveRoom = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Check if user is a participant but not the creator
    const room = await prisma.room.findFirst({
      where: {
        id,
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        creator: {
          select: userSelect,
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found or you are not a participant');
    }

    if (room.createdBy === req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Room creator cannot leave the room. Delete the room instead.');
    }

    // Remove the participant
    await prisma.roomParticipant.delete({
      where: {
        roomId_userId: {
          roomId: id,
          userId: req.user.id,
        },
      },
    });

    // Update room's updatedAt timestamp
    await prisma.room.update({
      where: { id },
      data: {}, // Empty update will trigger @updatedAt
    });

    // Send notification to room creator
    const leavingUserName = req.user.firstName || req.user.username;
    await NotificationService.notifyParticipantLeft(
      leavingUserName,
      room.createdBy,
      room.name
    );

    res.json({
      data: { 
        message: 'Successfully left the room',
        roomId: id,
      },
    });
  } catch (error) {
    throw error;
  }
};

export const getMyRooms = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    console.log('🏠 [GET MY ROOMS] Starting query for user:', req.user.id);
    
    // Debug: Check if user has any reactions
    const userReactions = await prisma.roomReaction.findMany({
      where: { userId: req.user.id },
      take: 5,
    });
    console.log('🏠 [GET MY ROOMS] User reactions found:', userReactions.length, userReactions);

    // Get all rooms with basic info in a single query
    const roomsData = await prisma.$queryRaw<Array<{
      id: string;
      name: string;
      created_at: Date;
      updated_at: Date;
      object_added_at: Date;
      created_by: string;
      name_set_by: string | null;
      is_public: boolean;
      is_creator: boolean;
      element_count: bigint;
      unread_elements: bigint;
      unread_messages: bigint;
      last_visited_at: Date;
      reaction_count: number;
      last_reaction_at: Date | null;
      comments_updated_at: Date | null;
      comment_count: number;
      has_user_reacted: boolean;
      user_reaction_emoji: string | null;
      participant_data: any; // JSON array of participants
      creator_data: any; // JSON object of creator
      name_set_by_user_data: any; // JSON object of name setter
      recent_elements: any; // JSON array of recent elements
    }>>`
      SELECT 
        r.id,
        r.name,
        r.created_at,
        r.updated_at,
        r.object_added_at,
        r.created_by,
        r.name_set_by,
        r.is_public,
        r.reaction_count,
        r.last_reaction_at,
        r.comment_count,
        r.comments_updated_at,
        (r.created_by = ${req.user.id}) as is_creator,
        COUNT(DISTINCT e.id) FILTER (WHERE e.deleted_at IS NULL) as element_count,
        COUNT(DISTINCT e.id) FILTER (WHERE e.deleted_at IS NULL AND e.created_at > rp.last_visited_at AND e.created_by != ${req.user.id}) as unread_elements,
        0 as unread_messages,
        rp.last_visited_at,
        EXISTS(SELECT 1 FROM room_reactions rr WHERE rr.room_id = r.id AND rr.user_id = ${req.user.id}) as has_user_reacted,
        (SELECT emoji FROM room_reactions rr WHERE rr.room_id = r.id AND rr.user_id = ${req.user.id}) as user_reaction_emoji,
        (
          SELECT json_agg(json_build_object(
            'id', u.id,
            'username', u.username,
            'firstName', u.first_name,
            'avatarUrl', u.avatar_url,
            'color', rp2.color,
            'isActive', rp2.is_active
          ))
          FROM room_participants rp2
          JOIN users u ON u.id = rp2.user_id
          WHERE rp2.room_id = r.id AND rp2.user_id != ${req.user.id}
        ) as participant_data,
        (
          SELECT json_build_object(
            'id', creator.id,
            'username', creator.username,
            'firstName', creator.first_name,
            'email', creator.email,
            'avatarUrl', creator.avatar_url
          )
          FROM users creator
          WHERE creator.id = r.created_by
        ) as creator_data,
        (
          SELECT json_build_object(
            'id', setter.id,
            'username', setter.username,
            'firstName', setter.first_name,
            'avatarUrl', setter.avatar_url
          )
          FROM users setter
          WHERE setter.id = r.name_set_by
        ) as name_set_by_user_data,
        (
          SELECT json_agg(elem_data ORDER BY elem_data->>'createdAt' DESC)
          FROM (
            SELECT json_build_object(
              'id', e2.id,
              'type', e2.type,
              'imageUrl', e2.image_url,
              'videoUrl', e2.video_url,
              'thumbnailUrl', e2.thumbnail_url,
              'smallThumbnailUrl', e2.small_thumbnail_url,
              'audioUrl', e2.audio_url,
              'createdAt', e2.created_at,
              'createdBy', json_build_object(
                'id', u2.id,
                'username', u2.username,
                'firstName', u2.first_name,
                'avatarUrl', u2.avatar_url
              )
            ) as elem_data
            FROM elements e2
            JOIN users u2 ON u2.id = e2.created_by
            WHERE e2.room_id = r.id 
              AND e2.deleted_at IS NULL
              AND e2.type IN ('PHOTO', 'VIDEO')
            ORDER BY e2.created_at DESC
            LIMIT 5
          ) sub
        ) as recent_elements
      FROM rooms r
      JOIN room_participants rp ON rp.room_id = r.id AND rp.user_id = ${req.user.id}
      LEFT JOIN elements e ON e.room_id = r.id
      GROUP BY r.id, r.name, r.created_at, r.updated_at, r.object_added_at, r.created_by, r.name_set_by, r.is_public, r.reaction_count, r.last_reaction_at, r.comments_updated_at, r.comment_count, rp.last_visited_at
      ORDER BY GREATEST(r.object_added_at, COALESCE(r.comments_updated_at, r.object_added_at)) DESC
    `;

    console.log('🏠 [GET MY ROOMS] Query executed, rooms found:', roomsData.length);
    
    // Debug: Log reaction and comment data for each room
    roomsData.forEach((room, index) => {
      console.log(`  Room ${index + 1}: ${room.name}`, {
        reactionCount: room.reaction_count,
        hasUserReacted: room.has_user_reacted,
        userEmoji: room.user_reaction_emoji,
        commentCount: room.comment_count,
        commentsUpdatedAt: room.comments_updated_at,
      });
    });

    // Debug logging for first room
    if (roomsData.length > 0) {
      console.log(`🔍 [GET MY ROOMS] First room raw data:`, {
        id: roomsData[0].id,
        name: roomsData[0].name,
        is_public: roomsData[0].is_public,
        is_public_type: typeof roomsData[0].is_public,
        all_keys: Object.keys(roomsData[0]),
      });
      
      console.log(`👤 [GET MY ROOMS] Creator data for first room:`, {
        created_by: roomsData[0].created_by,
        creator_data: roomsData[0].creator_data,
        creator_data_type: typeof roomsData[0].creator_data,
        is_creator: roomsData[0].is_creator,
      });

      console.log(`📸 [GET MY ROOMS] Recent elements for first room:`, {
        recent_elements_count: roomsData[0].recent_elements?.length || 0,
        recent_elements: roomsData[0].recent_elements,
      });
    }

    // Transform the raw data into the expected format
    const roomsWithUnreadCount = roomsData.map((room, index) => {
      const unreadCount = Number(room.unread_elements) + Number(room.unread_messages);
      
      // Process recent elements to ensure thumbnails
      const recentElements = room.recent_elements || [];
      const processedRecentElements = recentElements.map((elem: any) => {
        // If no smallThumbnailUrl exists, generate one on-the-fly
        if (!elem.smallThumbnailUrl) {
          if (elem.type === 'PHOTO' && elem.imageUrl) {
            elem.smallThumbnailUrl = getSmallThumbnailUrl(elem.imageUrl);
          } else if (elem.type === 'VIDEO' && (elem.thumbnailUrl || elem.videoUrl)) {
            elem.smallThumbnailUrl = getSmallThumbnailUrl(elem.thumbnailUrl || elem.videoUrl);
          }
        }
        return elem;
      });
      
      const roomData = {
        id: room.id,
        name: room.name,
        createdAt: room.created_at,
        updatedAt: room.updated_at,
        messagesUpdatedAt: null, // Messages no longer exist
        objectAddedAt: room.object_added_at,
        createdBy: room.created_by,
        nameSetBy: room.name_set_by,
        isPublic: room.is_public,
        creator: room.creator_data,
        nameSetByUser: room.name_set_by_user_data,
        isCreator: room.is_creator,
        participants: room.participant_data || [],
        elementCount: Number(room.element_count),
        unreadCount,
        hasUnread: unreadCount > 0,
        lastVisitedAt: room.last_visited_at,
        badges: {
          messages: Number(room.unread_messages),
          elements: Number(room.unread_elements),
        },
        recentElements: processedRecentElements,
        // Room-level interaction data
        reactionCount: room.reaction_count,
        lastReactionAt: room.last_reaction_at,
        commentCount: room.comment_count,
        commentsUpdatedAt: room.comments_updated_at,
        userReaction: room.has_user_reacted ? {
          hasReacted: true,
          emoji: room.user_reaction_emoji || '❤️',
        } : null,
      };
      
      // Debug log for comment data
      if (index === 0) {
        console.log(`💬 [GET MY ROOMS] First room comment data:`, {
          raw_comment_count: room.comment_count,
          transformed_commentCount: roomData.commentCount,
          roomName: room.name,
        });
      }
      
      return roomData;
    });

    const response = {
      data: roomsWithUnreadCount,
    };

    console.log('🏠 [GET MY ROOMS] Response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('❌ [GET MY ROOMS] Error:', error);
    throw error;
  }
};

export const addParticipants = async (req: AuthRequest, res: Response) => {
  const { id: roomId } = req.params;
  const { userIds } = req.body;
  
  console.log('🎯 [ADD PARTICIPANTS] Request received:', {
    roomId,
    userIds,
    requestedBy: req.user?.id,
  });

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  // Validate input
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    throw new AppError(400, 'INVALID_REQUEST', 'At least one user ID is required');
  }

  try {
    // Get room and verify creator
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          where: { isActive: true },
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    // Only room creator can add participants
    if (room.createdBy !== req.user.id) {
      throw new AppError(401, 'UNAUTHORIZED', 'Only the room creator can add participants');
    }

    // Check if participants exist
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: userIds,
        },
      },
    });

    const foundUserIds = users.map(u => u.id);
    const notFoundIds = userIds.filter(id => !foundUserIds.includes(id));

    // Categorize users
    const currentParticipantIds = room.participants.map(p => p.userId);
    const alreadyInRoom = userIds.filter(id => currentParticipantIds.includes(id));
    const toAdd = foundUserIds.filter(id => !currentParticipantIds.includes(id));
    
    console.log('🎯 [ADD PARTICIPANTS] User categorization:', {
      currentParticipants: currentParticipantIds,
      requestedUsers: userIds,
      foundUsers: foundUserIds,
      alreadyInRoom,
      toAdd,
      notFoundIds,
    });

    if (toAdd.length === 0 && notFoundIds.length === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'All specified users are already participants');
    }

    // Generate colors for new participants
    const existingColors = room.participants.map(p => p.color);
    const totalParticipants = currentParticipantIds.length + toAdd.length;
    const allColors = generateRoomColors(totalParticipants);
    const newColors = allColors.filter(color => !existingColors.includes(color));

    // Add new participants or reactivate existing ones
    const participantPromises = toAdd.map(async (userId, index) => {
      // Check if participant existed before (inactive)
      const existingParticipant = await prisma.roomParticipant.findUnique({
        where: {
          roomId_userId: {
            roomId,
            userId,
          },
        },
      });

      if (existingParticipant) {
        // Reactivate existing participant
        return prisma.roomParticipant.update({
          where: {
            roomId_userId: {
              roomId,
              userId,
            },
          },
          data: {
            isActive: true,
            leftAt: null,
            joinedAt: new Date(),
          },
        });
      } else {
        // Create new participant
        return prisma.roomParticipant.create({
          data: {
            roomId,
            userId,
            color: newColors[index] || generateRoomColors(1)[0],
            isActive: true,
          },
        });
      }
    });

    await Promise.all(participantPromises);
    
    console.log('🎯 [ADD PARTICIPANTS] Database operations completed');

    // NOTE: Do NOT update room timestamp when adding participants
    // Per product specs, only element and message changes should affect activity timestamp

    // Get updated room with all participants
    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          where: { isActive: true },
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    // Send notifications to newly added participants
    const addedParticipants = updatedRoom!.participants.filter(p => toAdd.includes(p.userId));
    
    console.log('🎯 [ADD PARTICIPANTS] Final state:', {
      updatedParticipantCount: updatedRoom!.participants.length,
      addedParticipants: addedParticipants.map(p => ({ id: p.userId, username: p.user.username })),
    });
    
    // Send push notifications after response
    setImmediate(() => {
      const adderName = req.user!.firstName || req.user!.username;
      addedParticipants.forEach(participant => {
        NotificationService.notifyAddedToRoom(
          adderName,
          participant.userId,
          roomId,
          updatedRoom!.name
        ).catch(err => {
          console.error('❌ Failed to send participant added notification:', err);
        });
      });
    });

    // Emit Socket.IO events for real-time updates
    addedParticipants.forEach(participant => {
      socketService.emitToRoom(roomId, 'participant:added', {
        roomId,
        participant: {
          ...participant.user,
          color: participant.color,
        },
        addedBy: {
          id: req.user!.id,
          username: req.user!.username,
          firstName: req.user!.firstName,
        },
      });
    });

    res.json({
      success: true,
      data: {
        added: toAdd,
        alreadyInRoom,
        notFound: notFoundIds,
        room: updatedRoom,
      },
    });
  } catch (error) {
    console.error('Error adding participants:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to add participants');
  }
};

export const removeParticipants = async (req: AuthRequest, res: Response) => {
  const { id: roomId, userId } = req.params;
  
  console.log('🎯 [REMOVE PARTICIPANT] Request received:', {
    roomId,
    userId,
    requestedBy: req.user?.id,
  });

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  // Validate input
  if (!userId) {
    throw new AppError(400, 'INVALID_REQUEST', 'User ID is required');
  }

  try {
    // Get room and verify permissions
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          // Don't filter by isActive - we need to see all participants
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    // Check permissions: Only room creator can remove participants
    if (room.createdBy !== req.user.id) {
      throw new AppError(401, 'UNAUTHORIZED', 'Only the room creator can remove participants');
    }

    // Cannot remove the creator
    if (userId === room.createdBy) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot remove the room creator');
    }

    // Verify participant exists in the room
    const participant = room.participants.find(p => p.userId === userId);
    if (!participant) {
      throw new AppError(404, 'NOT_FOUND', 'User is not a participant in this room');
    }

    // Check if participant is already inactive
    if (!participant.isActive) {
      // If already inactive, do a hard delete
      await prisma.roomParticipant.delete({
        where: {
          roomId_userId: {
            roomId,
            userId,
          },
        },
      });
      console.log(`🗑️ [REMOVE PARTICIPANT] Hard deleted inactive participant ${userId} from room ${roomId}`);
    } else {
      // If active, soft delete (mark as inactive)
      await prisma.roomParticipant.update({
        where: {
          roomId_userId: {
            roomId,
            userId,
          },
        },
        data: {
          isActive: false,
          leftAt: new Date(),
        },
      });
      console.log(`👋 [REMOVE PARTICIPANT] Soft deleted active participant ${userId} from room ${roomId}`);
    }

    // NOTE: Do NOT update room timestamp when removing participants
    // Per product specs, only element and message changes should affect activity timestamp

    // Get updated room with remaining participants
    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        creator: {
          select: userSelect,
        },
        nameSetByUser: {
          select: {
            id: true,
            username: true,
            firstName: true,
            avatarUrl: true,
          },
        },
        participants: {
          where: { isActive: true },
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    // Send notification to removed user
    setImmediate(() => {
      const removerName = req.user!.firstName || req.user!.username;
      NotificationService.notifyRemovedFromRoom(
        removerName,
        userId,
        room.name
      ).catch(err => {
        console.error('❌ Failed to send participant removed notification:', err);
      });
    });

    // Emit Socket.IO event for real-time updates
    socketService.emitToRoom(roomId, 'participant:removed', {
      roomId,
      userId,
      removedBy: {
        id: req.user!.id,
        username: req.user!.username,
        firstName: req.user!.firstName,
      },
    });

    res.json({
      success: true,
      data: {
        room: updatedRoom,
      },
    });
  } catch (error) {
    console.error('Error removing participants:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to remove participants');
  }
};