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
  try {
    const { name, participantIds } = req.body;
    
    console.log('📥 Create room request:', {
      body: req.body,
      participantIds: participantIds,
      participantIdsType: typeof participantIds,
      participantIdsIsArray: Array.isArray(participantIds),
      participantIdsLength: participantIds?.length
    });

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Validate required fields
    if (!name || !name.trim()) {
      throw new AppError(400, 'INVALID_REQUEST', 'Room name is required');
    }

    if (!participantIds || !Array.isArray(participantIds)) {
      throw new AppError(400, 'INVALID_REQUEST', 'participantIds must be an array');
    }

    // Ensure creator is not in participant list
    if (participantIds.includes(req.user.id)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Creator should not be in participant list');
    }

    // Check if all participants exist (only if there are participants)
    if (participantIds.length > 0) {
      const participants = await prisma.user.findMany({
        where: {
          id: {
            in: participantIds,
          },
        },
      });

      if (participants.length !== participantIds.length) {
        throw new AppError(404, 'USER_NOT_FOUND', 'One or more participants not found');
      }
    }

    // Generate colors for all participants (including creator)
    const colors = generateRoomColors(participantIds.length + 1);
    
    console.log('🔍 Creating room with:', {
      creatorId: req.user.id,
      participantIds,
      totalParticipants: participantIds.length + 1,
      colors: colors.length
    });
    
    // Prepare participant data
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
    
    console.log('👥 Participant data to create:', participantData);
    
    // Create room with all participants
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
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
      },
    });

    console.log('✅ Room created with participants:', {
      roomId: room.id,
      totalParticipants: room.participants.length,
      participantDetails: room.participants.map(p => ({
        userId: p.userId,
        color: p.color
      }))
    });

    // Send notifications to all participants (except creator)
    const creator = req.user;
    const otherParticipants = room.participants.filter(p => p.userId !== req.user!.id);
    
    // Send notifications in parallel
    await Promise.all(
      otherParticipants.map(participant =>
        NotificationService.notifyRoomCreated(
          creator.firstName || creator.username,
          participant.userId,
          room.id
        )
      )
    );

    res.status(201).json({
      data: room,
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
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
        elements: {
          where: {
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
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found or access denied');
    }

    res.json({
      data: room,
    });
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

    // Room can always be joined by participants

    // Check if user is already a participant
    const existingParticipant = room.participants.find(p => p.userId === req.user!.id);
    if (!existingParticipant) {
      throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant in this room');
    }

    // Update participant to active and update last visit time
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
                snapshotUrl: true,
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
        snapshotUrl: rp.room.snapshotUrl,
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

    // Send notification to the other user if name was set (not cleared)
    if (name && req.user) {
      const otherParticipant = updatedRoom.participants.find(p => p.userId !== req.user!.id);
      if (otherParticipant) {
        await NotificationService.notifyRoomRenamed(
          req.user.firstName || req.user.username,
          otherParticipant.userId,
          updatedRoom.id,
          name
        );
      }
    }

    // Emit socket event to all participants in the room
    socketService.emitRoomUpdate(updatedRoom.id, updatedRoom);

    res.json({
      data: updatedRoom,
    });
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

    // Get all rooms where user is a participant with room details
    const rooms = await prisma.room.findMany({
      where: {
        participants: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        participants: {
          include: {
            user: {
              select: userSelect,
            },
          },
        },
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
      orderBy: {
        updatedAt: 'desc', // Most recently updated first
      },
    });

    // Get the user's last visit time for each room and calculate unread counts
    const roomsWithUnreadCount = await Promise.all(
      rooms.map(async (room) => {
        // Find the current user's participant record
        const currentUserParticipant = room.participants.find(
          p => p.userId === req.user!.id
        );

        if (!currentUserParticipant) {
          throw new AppError(500, 'DATA_INCONSISTENCY', 'User participant record not found');
        }

        // Count elements created after user's last visit
        const unreadElementsCount = await prisma.element.count({
          where: {
            roomId: room.id,
            deletedAt: null,
            createdAt: {
              gt: currentUserParticipant.lastVisitedAt,
            },
            // Don't count elements created by the current user
            createdBy: {
              not: req.user!.id,
            },
          },
        });

        // Count messages sent after user's last read
        const unreadMessagesCount = await prisma.message.count({
          where: {
            roomId: room.id,
            deletedAt: null,
            createdAt: {
              gt: currentUserParticipant.lastReadAt,
            },
            // Don't count messages sent by the current user
            senderId: {
              not: req.user!.id,
            },
          },
        });

        // Total unread count (elements + messages)
        const unreadCount = unreadElementsCount + unreadMessagesCount;

        // Format participants for response (exclude current user)
        const otherParticipants = room.participants
          .filter(p => p.userId !== req.user!.id)
          .map(p => ({
            id: p.user.id,
            username: p.user.username,
            firstName: p.user.firstName,
            avatarUrl: p.user.avatarUrl,
            color: p.color,
          }));

        return {
          id: room.id,
          name: room.name,
          snapshotUrl: room.snapshotUrl,
          createdAt: room.createdAt,
          updatedAt: room.updatedAt,
          createdBy: room.createdBy,
          isCreator: room.createdBy === req.user!.id,
          participants: otherParticipants,
          elementCount: room._count.elements,
          unreadCount,
          hasUnread: unreadCount > 0,
          lastVisitedAt: currentUserParticipant.lastVisitedAt,
        };
      })
    );

    res.json({
      data: roomsWithUnreadCount,
    });
  } catch (error) {
    throw error;
  }
};

export const addParticipants = async (req: AuthRequest, res: Response) => {
  const { id: roomId } = req.params;
  const { participantIds } = req.body;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  // Validate input
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    throw new AppError(400, 'INVALID_REQUEST', 'At least one participant ID is required');
  }

  try {
    // Get room and verify creator
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { isActive: true },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    // Only room creator can add participants
    if (room.createdBy !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Only the room creator can add participants');
    }

    // Check if participants exist
    const users = await prisma.user.findMany({
      where: {
        id: {
          in: participantIds,
        },
      },
    });

    if (users.length !== participantIds.length) {
      throw new AppError(404, 'USER_NOT_FOUND', 'One or more users not found');
    }

    // Filter out already active participants
    const currentParticipantIds = room.participants.map(p => p.userId);
    const newParticipantIds = participantIds.filter(id => !currentParticipantIds.includes(id));

    if (newParticipantIds.length === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'All specified users are already participants');
    }

    // Generate colors for new participants
    const existingColors = room.participants.map(p => p.color);
    const totalParticipants = currentParticipantIds.length + newParticipantIds.length;
    const allColors = generateRoomColors(totalParticipants);
    const newColors = allColors.filter(color => !existingColors.includes(color));

    // Add new participants or reactivate existing ones
    const participantPromises = newParticipantIds.map(async (userId, index) => {
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

    // Update room timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: {},
    });

    // Get updated room with all participants
    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { isActive: true },
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
        },
      },
    });

    res.json({
      data: {
        room: updatedRoom,
        addedCount: newParticipantIds.length,
        message: `Successfully added ${newParticipantIds.length} participant(s)`,
      },
    });
  } catch (error) {
    console.error('Error adding participants:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to add participants');
  }
};

export const removeParticipants = async (req: AuthRequest, res: Response) => {
  const { id: roomId } = req.params;
  const { participantIds } = req.body;

  if (!req.user) {
    throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
  }

  // Validate input
  if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
    throw new AppError(400, 'INVALID_REQUEST', 'At least one participant ID is required');
  }

  try {
    // Get room and verify creator
    const room = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { isActive: true },
        },
      },
    });

    if (!room) {
      throw new AppError(404, 'ROOM_NOT_FOUND', 'Room not found');
    }

    // Only room creator can remove participants
    if (room.createdBy !== req.user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Only the room creator can remove participants');
    }

    // Cannot remove the creator
    if (participantIds.includes(req.user.id)) {
      throw new AppError(400, 'INVALID_REQUEST', 'Cannot remove the room creator');
    }

    // Verify all participants exist in the room
    const currentParticipantIds = room.participants.map(p => p.userId);
    const validParticipantIds = participantIds.filter(id => currentParticipantIds.includes(id));

    if (validParticipantIds.length === 0) {
      throw new AppError(400, 'INVALID_REQUEST', 'None of the specified users are active participants');
    }

    // Soft delete participants (mark as inactive)
    await prisma.roomParticipant.updateMany({
      where: {
        roomId,
        userId: {
          in: validParticipantIds,
        },
      },
      data: {
        isActive: false,
        leftAt: new Date(),
      },
    });

    // Update room timestamp
    await prisma.room.update({
      where: { id: roomId },
      data: {},
    });

    // Get updated room with remaining participants
    const updatedRoom = await prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          where: { isActive: true },
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
        },
      },
    });

    res.json({
      data: {
        room: updatedRoom,
        removedCount: validParticipantIds.length,
        message: `Successfully removed ${validParticipantIds.length} participant(s)`,
      },
    });
  } catch (error) {
    console.error('Error removing participants:', error);
    if (error instanceof AppError) throw error;
    throw new AppError(500, 'INTERNAL_ERROR', 'Failed to remove participants');
  }
};