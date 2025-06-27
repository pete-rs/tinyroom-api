import { Router } from 'express';
import { addComment, getElementComments, deleteComment, toggleCommentLike } from '../controllers/commentController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Add comment to element
router.post('/comments/elements/:elementId', asyncHandler(addComment));

// Get comments for element (paginated)
router.get('/comments/elements/:elementId', asyncHandler(getElementComments));

// Delete comment (creator only)
router.delete('/comments/:commentId', asyncHandler(deleteComment));

// Like/unlike comment
router.post('/comments/:commentId/like', asyncHandler(toggleCommentLike));

export default router;