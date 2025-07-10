import { prisma } from '../config/prisma';
import { NotificationType, Prisma } from '@prisma/client';
import { socketService } from './socketService';

interface NotificationData {
  [key: string]: any;
}

interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  actorId: string;
  roomId?: string;
  data: NotificationData;
}

export class InAppNotificationService {
  // Batch window in milliseconds (5 minutes)
  private static readonly BATCH_WINDOW_MS = 5 * 60 * 1000;

  /**
   * Create or update a notification, handling batching for supported types
   */
  static async createNotification(params: CreateNotificationParams): Promise<void> {
    const { userId, type, actorId, roomId, data } = params;

    console.log(`🔔 [CREATE NOTIFICATION] Attempting to create notification:`, {
      userId,
      type,
      actorId,
      roomId,
      dataKeys: Object.keys(data || {})
    });

    // Skip if actor is the same as recipient (no self-notifications)
    if (userId === actorId) {
      console.log(`🔔 [CREATE NOTIFICATION] Skipping self-notification`);
      return;
    }

    try {
      // Handle batched notification types
      if (type === NotificationType.ELEMENT_ADDED && roomId) {
        console.log(`🔔 [CREATE NOTIFICATION] Creating batched element notification`);
        await this.createBatchedElementNotification(userId, actorId, roomId, data);
      } else {
        // Create regular notification
        console.log(`🔔 [CREATE NOTIFICATION] Creating regular notification`);
        const notification = await prisma.notification.create({
          data: {
            userId,
            type,
            actorId,
            roomId,
            data,
          },
        });
        console.log(`🔔 [CREATE NOTIFICATION] Created notification with ID: ${notification.id}`);
      }

      // Emit unread count update via Socket.IO
      try {
        const unreadCount = await this.getUnreadCount(userId);
        socketService.emitToUser(userId, 'notification:unread-count', {
          unreadCount
        });
        console.log(`🔔 [SOCKET] Emitted unread count (${unreadCount}) to user ${userId}`);
      } catch (error) {
        console.error('❌ Failed to emit notification count:', error);
      }
    } catch (error) {
      console.error('❌ Failed to create in-app notification:', error);
      // Don't throw - notifications shouldn't break the main flow
    }
  }

  /**
   * Handle batched element notifications
   */
  private static async createBatchedElementNotification(
    userId: string,
    actorId: string,
    roomId: string,
    data: NotificationData
  ): Promise<void> {
    const now = new Date();
    const batchWindowStart = new Date(now.getTime() - this.BATCH_WINDOW_MS);
    
    // Create batch key for this specific combination
    const dateKey = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const batchKey = `element_added:${roomId}:${actorId}:${dateKey}`;

    // Look for existing batch notification
    const existingNotification = await prisma.notification.findFirst({
      where: {
        userId,
        type: NotificationType.ELEMENT_ADDED,
        actorId,
        roomId,
        batchKey,
        batchWindowEnd: {
          gte: now,
        },
      },
    });

    if (existingNotification) {
      // Update existing batch
      const currentData = existingNotification.data as any;
      const elementType = data.elementType as string;
      const thumbnails = currentData.thumbnails || [];
      
      // Add new thumbnail if provided and we have less than 5
      if (data.thumbnailUrl && thumbnails.length < 5) {
        thumbnails.push({
          url: data.thumbnailUrl,
          type: elementType,
        });
        console.log(`🔔 [BATCH UPDATE] Added thumbnail to existing batch. Total thumbnails: ${thumbnails.length}`);
      } else {
        console.log(`🔔 [BATCH UPDATE] No thumbnail added. thumbnailUrl: ${data.thumbnailUrl}, current count: ${thumbnails.length}`);
      }

      // Update element type counts
      const elementCounts = currentData.elementCounts || {};
      elementCounts[elementType] = (elementCounts[elementType] || 0) + 1;

      await prisma.notification.update({
        where: { id: existingNotification.id },
        data: {
          batchCount: existingNotification.batchCount + 1,
          batchWindowEnd: new Date(now.getTime() + this.BATCH_WINDOW_MS),
          isRead: false, // Reset read status when batch is updated
          data: {
            ...currentData,
            elementCounts,
            thumbnails,
            lastElementType: elementType,
            roomName: data.roomName || currentData.roomName,
          },
        },
      });
    } else {
      // Create new batch notification
      const thumbnails = [];
      if (data.thumbnailUrl) {
        thumbnails.push({
          url: data.thumbnailUrl,
          type: data.elementType,
        });
        console.log(`🔔 [NEW BATCH] Created new batch with thumbnail: ${data.thumbnailUrl}`);
      } else {
        console.log(`🔔 [NEW BATCH] No thumbnail provided for new batch. data:`, JSON.stringify(data));
      }

      await prisma.notification.create({
        data: {
          userId,
          type: NotificationType.ELEMENT_ADDED,
          actorId,
          roomId,
          batchKey,
          batchCount: 1,
          batchWindowStart: now,
          batchWindowEnd: new Date(now.getTime() + this.BATCH_WINDOW_MS),
          data: {
            elementCounts: {
              [data.elementType as string]: 1,
            },
            thumbnails,
            roomName: data.roomName,
            lastElementType: data.elementType,
          },
        },
      });
    }
  }

  /**
   * Mark notifications as read
   */
  static async markAsRead(notificationIds: string[], userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        id: {
          in: notificationIds,
        },
        userId, // Ensure user owns these notifications
      },
      data: {
        isRead: true,
      },
    });

    // Emit updated unread count
    try {
      const unreadCount = await this.getUnreadCount(userId);
      socketService.emitToUser(userId, 'notification:unread-count', {
        unreadCount
      });
      console.log(`🔔 [SOCKET] Emitted unread count (${unreadCount}) to user ${userId} after marking as read`);
    } catch (error) {
      console.error('❌ Failed to emit notification count:', error);
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false,
      },
      data: {
        isRead: true,
      },
    });

    // Emit updated unread count (should be 0)
    try {
      socketService.emitToUser(userId, 'notification:unread-count', {
        unreadCount: 0
      });
      console.log(`🔔 [SOCKET] Emitted unread count (0) to user ${userId} after marking all as read`);
    } catch (error) {
      console.error('❌ Failed to emit notification count:', error);
    }
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    return await prisma.notification.count({
      where: {
        userId,
        isRead: false,
      },
    });
  }

  /**
   * Delete old notifications (e.g., older than 30 days)
   */
  static async cleanupOldNotifications(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });
  }
}