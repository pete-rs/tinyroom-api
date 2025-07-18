import { Router } from 'express';
import { getMe, updateProfile, searchUsers, getAllUsers, getUsersWithoutRooms, getUser } from '../controllers/userController';
import { getMyProfile, getUserProfile } from '../controllers/profileController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// These routes don't require complete profile (used during onboarding)
router.get('/me', authMiddleware as any, asyncHandler(getMe));
router.put('/me', authMiddleware as any, asyncHandler(updateProfile));

// Profile routes (require complete profile)
router.get('/me/profile', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getMyProfile));
router.get('/:username/profile', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getUserProfile));

// These routes require complete profile
router.get('/search', authMiddleware as any, requireCompleteProfile as any, asyncHandler(searchUsers));
router.get('/all', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getAllUsers));
router.get('/without-rooms', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getUsersWithoutRooms));
router.get('/:userId', authMiddleware as any, requireCompleteProfile as any, asyncHandler(getUser));

export default router;