import { Router } from 'express';
import {
  followUser,
  unfollowUser,
  getFollowers,
  getFollowing,
  getFollowStatus,
  getFollowingFeed,
} from '../controllers/followController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Following feed
router.get('/following/feed', asyncHandler(getFollowingFeed));

// Follow management
router.post('/users/:userId/follow', asyncHandler(followUser));
router.delete('/users/:userId/follow', asyncHandler(unfollowUser));

// Follow lists
router.get('/users/:userId/followers', asyncHandler(getFollowers));
router.get('/users/:userId/following', asyncHandler(getFollowing));

// Follow status
router.get('/users/:userId/follow-status', asyncHandler(getFollowStatus));

export default router;