import { Router } from 'express';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  searchUsersForMentions,
  validateMentionedUsers,
} from '../controllers/userSearchController';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Search users for @mentions
router.get('/search/mentions', asyncHandler(searchUsersForMentions));

// Validate mentioned usernames exist
router.post('/validate-mentions', asyncHandler(validateMentionedUsers));

export default router;