import { Router } from 'express';
import {
  getRooms,
  createRoom,
  getRoom,
  joinRoom,
  leaveRoom,
  getRoomElements,
  getRoomsGroupedByPerson,
  updateRoomName,
  getMyRooms,
  deleteRoom,
  permanentlyLeaveRoom,
  deleteElement,
  addParticipants,
  removeParticipants,
} from '../controllers/roomController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Primary endpoints
router.get('/my-rooms', asyncHandler(getMyRooms)); // New: My Rooms with unread indicators

// Legacy person-based navigation endpoints
router.get('/grouped-by-person', asyncHandler(getRoomsGroupedByPerson));

// Legacy endpoints (kept for compatibility)
router.get('/', asyncHandler(getRooms));
router.post('/', asyncHandler(createRoom));

// Room-specific endpoints
router.get('/:id', asyncHandler(getRoom));
router.put('/:id/name', asyncHandler(updateRoomName));
router.post('/:id/join', asyncHandler(joinRoom));
router.post('/:id/leave', asyncHandler(leaveRoom)); // Temporary leave (mark as inactive)
router.delete('/:id/leave', asyncHandler(permanentlyLeaveRoom)); // Permanent leave (remove participant)
router.delete('/:id', asyncHandler(deleteRoom)); // Delete room (creator only)
router.get('/:id/elements', asyncHandler(getRoomElements));
router.delete('/:roomId/elements/:elementId', asyncHandler(deleteElement)); // Delete element

// Participant management (creator only)
router.post('/:id/participants', asyncHandler(addParticipants)); // Add participants to room
router.delete('/:id/participants/:userId', asyncHandler(removeParticipants)); // Remove single participant from room

export default router;