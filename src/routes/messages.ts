import { Router } from 'express';
import { sendMessage, getMessages, deleteMessage, markMessagesAsRead, toggleReaction } from '../controllers/messageController';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// All routes require authentication and complete profile
router.use(authMiddleware as any, requireCompleteProfile as any);

// Message endpoints
router.post('/rooms/:roomId/messages', asyncHandler(sendMessage));
router.get('/rooms/:roomId/messages', asyncHandler(getMessages));
router.delete('/rooms/:roomId/messages/:messageId', asyncHandler(deleteMessage));
router.post('/rooms/:roomId/messages/read', asyncHandler(markMessagesAsRead));
router.post('/rooms/:roomId/messages/:messageId/reaction', asyncHandler(toggleReaction));

export default router;