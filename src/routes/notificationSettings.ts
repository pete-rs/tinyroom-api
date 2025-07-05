import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { updateOneSignalPlayerId } from '../controllers/userController';

const router = Router();

// Player ID update doesn't require complete profile
router.put('/player-id', authMiddleware as any, asyncHandler(updateOneSignalPlayerId));

export default router;