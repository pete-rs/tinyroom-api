import { Router } from 'express';
import { updateOneSignalPlayerId } from '../controllers/userController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Update OneSignal player ID for push notifications
router.put('/player-id', authMiddleware as any, asyncHandler(updateOneSignalPlayerId));

export default router;