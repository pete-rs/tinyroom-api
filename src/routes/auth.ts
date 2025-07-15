import { Router } from 'express';
import { verifyAuth, completeProfile, checkUsername } from '../controllers/authController';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/verify', authMiddleware as any, asyncHandler(verifyAuth));
router.post('/complete-profile', authMiddleware as any, asyncHandler(completeProfile));
router.get('/check-username', authMiddleware as any, asyncHandler(checkUsername));

export default router;