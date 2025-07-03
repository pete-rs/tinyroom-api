import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getRoomComments,
  createComment,
  deleteComment,
} from '../controllers/roomCommentController';

const router = Router();

// All routes require authentication
router.use(authMiddleware as any);

// Room comment routes
router.get('/rooms/:roomId/comments', asyncHandler(getRoomComments));
router.post('/rooms/:roomId/comments', asyncHandler(createComment));
router.delete('/comments/:commentId', asyncHandler(deleteComment));

export default router;