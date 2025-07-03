import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  toggleReaction,
  getRoomReactions,
  removeReaction,
} from '../controllers/roomReactionController';

const router = Router();

// All routes require authentication
router.use(authMiddleware as any);

// Room reaction routes
router.post('/rooms/:roomId/reaction', asyncHandler(toggleReaction));
router.get('/rooms/:roomId/reactions', asyncHandler(getRoomReactions));
router.delete('/rooms/:roomId/reaction', asyncHandler(removeReaction));

export default router;