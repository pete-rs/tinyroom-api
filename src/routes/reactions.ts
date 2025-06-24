import { Router } from 'express';
import { toggleReaction, getElementReactions } from '../controllers/reactionController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Toggle reaction (add/remove)
router.post('/rooms/:roomId/elements/:elementId/reactions/toggle', asyncHandler(toggleReaction));

// Get all reactions for an element (optional endpoint)
router.get('/rooms/:roomId/elements/:elementId/reactions', asyncHandler(getElementReactions));

export default router;