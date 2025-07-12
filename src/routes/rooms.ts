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
  updateRoomVisibility,
  updateRoomBackground,
  getMyRooms,
  deleteRoom,
  permanentlyLeaveRoom,
  deleteElement,
  updateElementPhotoStyle,
  updateElementLinkStyle,
  addParticipants,
  removeParticipants,
  testRoomPublicStatus,
  setRoomSticker,
  removeRoomSticker,
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
router.get('/:id/test-public', asyncHandler(testRoomPublicStatus)); // Debug endpoint
router.put('/:id/name', asyncHandler(updateRoomName));
router.put('/:id/visibility', asyncHandler(updateRoomVisibility)); // Toggle public/private
router.put('/:id/background', asyncHandler(updateRoomBackground)); // Update background color/image
router.post('/:id/join', asyncHandler(joinRoom));
router.post('/:id/leave', asyncHandler(leaveRoom)); // Temporary leave (mark as inactive)
router.delete('/:id/leave', asyncHandler(permanentlyLeaveRoom)); // Permanent leave (remove participant)
router.delete('/:id', asyncHandler(deleteRoom)); // Delete room (creator only)
router.get('/:id/elements', asyncHandler(getRoomElements));
router.delete('/:roomId/elements/:elementId', asyncHandler(deleteElement)); // Delete element
router.put('/:roomId/elements/:elementId/photo-style', asyncHandler(updateElementPhotoStyle)); // Update photo style
router.put('/:roomId/elements/:elementId/link-style', asyncHandler(updateElementLinkStyle)); // Update link style

// Participant management (creator only)
router.post('/:id/participants', asyncHandler(addParticipants)); // Add participants to room
router.delete('/:id/participants/:userId', asyncHandler(removeParticipants)); // Remove single participant from room

// Sticker management (creator only)
router.put('/:roomId/sticker', asyncHandler(setRoomSticker)); // Set room sticker
router.delete('/:roomId/sticker', asyncHandler(removeRoomSticker)); // Remove room sticker

export default router;