import { Router } from 'express';
import { authMiddleware, requireCompleteProfile } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import {
  getNotifications,
  markNotificationsAsRead,
  markAllNotificationsAsRead,
  getUnreadCount,
} from '../controllers/notificationController';

const router = Router();

// All notification routes require authentication and complete profile
router.use(authMiddleware as any);
router.use(requireCompleteProfile as any);

// Get paginated notifications
router.get('/', asyncHandler(getNotifications));

// Get unread count
router.get('/unread-count', asyncHandler(getUnreadCount));

// Mark specific notifications as read
router.put('/read', asyncHandler(markNotificationsAsRead));

// Mark all notifications as read
router.put('/read-all', asyncHandler(markAllNotificationsAsRead));

export default router;