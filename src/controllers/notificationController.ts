import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { getPagination, getPaginationMeta } from '../utils/pagination';
import { InAppNotificationService } from '../services/inAppNotificationService';
import { NotificationType } from '@prisma/client';

export const getNotifications = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const { skip, take } = getPagination({ page, limit });

    console.log(`🔔 [GET NOTIFICATIONS] User ${req.user.id} requesting page ${page}, limit ${limit}`);

    // Get notifications with actor and room data
    const [notifications, totalCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: req.user.id,
        },
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              firstName: true,
              avatarUrl: true,
            },
          },
          room: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take,
      }),
      prisma.notification.count({
        where: {
          userId: req.user.id,
        },
      }),
    ]);

    // Get follow status for USER_FOLLOWED notifications
    const followedNotifications = notifications.filter(n => n.type === NotificationType.USER_FOLLOWED);
    const followStatuses = new Map<string, boolean>();
    
    if (followedNotifications.length > 0) {
      const actorIds = followedNotifications.map(n => n.actorId);
      const follows = await prisma.follow.findMany({
        where: {
          followerId: req.user.id,
          followingId: {
            in: actorIds,
          },
        },
        select: {
          followingId: true,
        },
      });
      
      follows.forEach(f => followStatuses.set(f.followingId, true));
    }

    // Transform notifications into consistent format
    const transformedNotifications = notifications.map(notification => {
      const data = notification.data as any;
      
      // Build display text based on notification type
      let displayText = '';
      let thumbnails: any[] = [];

      switch (notification.type) {
        case NotificationType.ROOM_RENAMED:
          displayText = `${notification.actor.firstName || notification.actor.username} renamed the room "${data.oldName}" to "${data.newName}"`;
          break;

        case NotificationType.ELEMENT_ADDED:
          const roomNameForElement = data.roomName || notification.room?.name || 'Unknown';
          if (notification.batchCount > 1) {
            // Batched notification
            const counts = data.elementCounts || {};
            const parts: string[] = [];
            
            // Build count string (e.g., "3 photos and 2 videos")
            Object.entries(counts).forEach(([type, count]) => {
              if (count as number > 0) {
                const typeDisplay = type.toLowerCase();
                const plural = (count as number) > 1 ? 's' : '';
                parts.push(`${count} ${typeDisplay}${plural}`);
              }
            });

            const countString = parts.length > 2 
              ? parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1]
              : parts.join(' and ');

            displayText = `${notification.actor.firstName || notification.actor.username} added ${countString} to ${roomNameForElement}`;
            thumbnails = data.thumbnails || [];
          } else {
            // Single element
            const elementType = (data.lastElementType || data.elementType || 'object').toLowerCase();
            displayText = `${notification.actor.firstName || notification.actor.username} added a ${elementType} to ${roomNameForElement}`;
            if (data.thumbnailUrl || (data.thumbnails && data.thumbnails.length > 0)) {
              thumbnails = data.thumbnailUrl 
                ? [{ url: data.thumbnailUrl, type: elementType }]
                : data.thumbnails;
            }
          }
          break;

        case NotificationType.PARTICIPANT_LEFT:
          displayText = `${notification.actor.firstName || notification.actor.username} left the room ${data.roomName || notification.room?.name || 'Unknown'}`;
          break;

        case NotificationType.ROOM_DELETED:
          displayText = `${notification.actor.firstName || notification.actor.username} deleted the room ${data.roomName}`;
          break;

        case NotificationType.ADDED_TO_ROOM:
          displayText = `${notification.actor.firstName || notification.actor.username} added you to the room: ${data.roomName || notification.room?.name || 'Unknown'}`;
          break;

        case NotificationType.REMOVED_FROM_ROOM:
          displayText = `${notification.actor.firstName || notification.actor.username} removed you from the room: ${data.roomName}`;
          break;

        case NotificationType.COMMENT_ADDED:
          const commentPreview = data.commentPreview ? `: ${data.commentPreview}` : '';
          const roomName = data.roomName || notification.room?.name || 'Unknown';
          displayText = `${notification.actor.firstName || notification.actor.username} added a comment in ${roomName}${commentPreview}`;
          break;

        case NotificationType.MENTION:
          const mentionPreview = data.commentPreview ? `: ${data.commentPreview}` : '';
          displayText = `${notification.actor.firstName || notification.actor.username} mentioned you${mentionPreview}`;
          break;

        case NotificationType.USER_FOLLOWED:
          displayText = `${notification.actor.firstName || notification.actor.username} started following you`;
          break;

        case NotificationType.COMMENT_LIKE:
          const likePreview = data.commentPreview ? `: ${data.commentPreview}` : '';
          displayText = `${notification.actor.firstName || notification.actor.username} liked your comment${likePreview}`;
          break;

        case NotificationType.ROOM_LIKE:
          displayText = `${notification.actor.firstName || notification.actor.username} liked your room: ${data.roomName || notification.room?.name || 'Unknown'}`;
          break;
      }

      return {
        id: notification.id,
        type: notification.type,
        displayText,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        actor: notification.actor,
        
        // Deep linking data
        deepLink: {
          type: getDeepLinkType(notification.type),
          roomId: notification.roomId,
          actorId: notification.actorId,
        },
        
        // Type-specific data
        roomName: notification.room?.name || data.roomName,
        thumbnails: thumbnails.slice(0, 5), // Max 5 thumbnails
        batchCount: notification.batchCount,
        
        // For USER_FOLLOWED notifications, include follow status
        ...(notification.type === NotificationType.USER_FOLLOWED ? {
          isFollowingBack: followStatuses.get(notification.actorId) || false,
        } : {}),
        
        // Raw data for debugging
        _rawData: data,
      };
    });

    const meta = getPaginationMeta(totalCount, page, limit);

    console.log(`🔔 [GET NOTIFICATIONS] Returning ${transformedNotifications.length} notifications`);
    
    // Debug: Log the exact response being sent
    const response = {
      data: transformedNotifications,
      meta,
    };
    
    console.log('🔔 [GET NOTIFICATIONS] Full response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('❌ [GET NOTIFICATIONS] Error:', error);
    throw error;
  }
};

/**
 * Get deep link type for iOS navigation
 */
function getDeepLinkType(notificationType: NotificationType): string {
  switch (notificationType) {
    case NotificationType.ROOM_RENAMED:
    case NotificationType.ELEMENT_ADDED:
    case NotificationType.PARTICIPANT_LEFT:
    case NotificationType.ADDED_TO_ROOM:
    case NotificationType.COMMENT_ADDED:
    case NotificationType.MENTION:
    case NotificationType.COMMENT_LIKE:
    case NotificationType.ROOM_LIKE:
      return 'room';
    
    case NotificationType.USER_FOLLOWED:
      return 'profile';
    
    case NotificationType.REMOVED_FROM_ROOM:
    case NotificationType.ROOM_DELETED:
      return 'none'; // No deep link for removed from room or deleted room
    
    default:
      return 'unknown';
  }
}

export const markNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      throw new AppError(400, 'INVALID_INPUT', 'notificationIds must be a non-empty array');
    }

    console.log(`🔔 [MARK AS READ] User ${req.user.id} marking ${notificationIds.length} notifications as read`);

    await InAppNotificationService.markAsRead(notificationIds, req.user.id);

    res.json({
      data: {
        message: 'Notifications marked as read',
        count: notificationIds.length,
      },
    });
  } catch (error) {
    console.error('❌ [MARK AS READ] Error:', error);
    throw error;
  }
};

export const markAllNotificationsAsRead = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    console.log(`🔔 [MARK ALL AS READ] User ${req.user.id} marking all notifications as read`);

    await InAppNotificationService.markAllAsRead(req.user.id);

    res.json({
      data: {
        message: 'All notifications marked as read',
      },
    });
  } catch (error) {
    console.error('❌ [MARK ALL AS READ] Error:', error);
    throw error;
  }
};

export const getUnreadCount = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const count = await InAppNotificationService.getUnreadCount(req.user.id);

    console.log(`🔔 [UNREAD COUNT] User ${req.user.id} has ${count} unread notifications`);
    
    // Debug: Log the exact response being sent
    const response = {
      data: {
        unreadCount: count,
      },
    };
    
    console.log('🔔 [UNREAD COUNT] Full response:', JSON.stringify(response, null, 2));

    res.json(response);
  } catch (error) {
    console.error('❌ [UNREAD COUNT] Error:', error);
    throw error;
  }
};