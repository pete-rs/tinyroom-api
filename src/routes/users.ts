import { Router } from 'express';
import { getMe, updateProfile, searchUsers, getAllUsers, getUsersWithoutRooms } from '../controllers/userController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// These routes don't require complete profile (used during onboarding)
router.get('/me', authMiddleware as any, asyncHandler(getMe));
router.put('/me', authMiddleware as any, asyncHandler(updateProfile));

// These routes require complete profile
router.get('/search', authMiddleware as any, requireCompleteProfile as any, asyncHandler(searchUsers));
router.get('/all', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getAllUsers));
router.get('/without-rooms', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getUsersWithoutRooms));

export default router;