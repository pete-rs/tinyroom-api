import { Router } from 'express';
import { addReaction, removeReaction, getElementReactions } from '../controllers/reactionController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Add or update reaction
router.post('/reactions/elements/:elementId', asyncHandler(addReaction));

// Remove reaction
router.delete('/reactions/elements/:elementId', asyncHandler(removeReaction));

// Get all reactions for an element
router.get('/reactions/elements/:elementId', asyncHandler(getElementReactions));

export default router;