import * as OneSignal from '@onesignal/node-onesignal';
import { config } from '../config';
import { prisma } from '../config/prisma';

// Initialize OneSignal configuration
const configuration = OneSignal.createConfiguration({
  restApiKey: config.oneSignal.apiKey,
});

const client = new OneSignal.DefaultApi(configuration);

interface NotificationData {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

export class NotificationService {
  /**
   * Send a push notification to a specific user
   */
  static async sendToUser({ userId, title, message, data }: NotificationData): Promise<void> {
    console.log('\n🔔 ========== ONESIGNAL PUSH NOTIFICATION ==========');
    console.log('📤 Attempting to send push notification:');
    console.log(`   User ID: ${userId}`);
    console.log(`   Title: "${title}"`);
    console.log(`   Message: "${message}"`);
    console.log(`   Data: ${JSON.stringify(data, null, 2)}`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    
    try {
      // First check if user has a OneSignal player ID
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { 
          id: true, 
          username: true,
          oneSignalPlayerId: true 
        },
      });

      if (!user) {
        console.log(`❌ PUSH FAILED: User ${userId} not found in database`);
        console.log('================================================\n');
        return;
      }

      console.log(`✅ User found: ${user.username}`);
      console.log(`   OneSignal Player ID: ${user.oneSignalPlayerId || 'NOT SET'}`);
      
      if (!user.oneSignalPlayerId) {
        console.log(`⚠️  PUSH SKIPPED: User has no OneSignal player ID registered`);
        console.log(`   The iOS app needs to call OneSignal.login("${userId}")`);
        console.log(`   Then update the backend with PUT /api/notifications/player-id`);
        console.log('================================================\n');
        return;
      }

      const notification = new OneSignal.Notification();
      notification.app_id = config.oneSignal.appId;
      
      // Target specific user by their ID
      notification.include_aliases = {
        external_id: [userId]
      };
      notification.target_channel = 'push';
      
      // Notification content
      notification.headings = { en: title };
      notification.contents = { en: message };
      
      // Additional data to send with notification
      if (data) {
        notification.data = data;
      }
      
      // iOS specific settings
      notification.ios_badge_type = 'Increase';
      notification.ios_badge_count = 1;
      
      console.log('📱 Sending to OneSignal:');
      console.log(`   App ID: ${config.oneSignal.appId}`);
      console.log(`   External ID (User ID): ${userId}`);
      console.log(`   Target Channel: push`);
      console.log(`   iOS Badge: Increase by 1`);
      
      const response = await client.createNotification(notification);
      
      console.log('✅ PUSH SENT SUCCESSFULLY!');
      console.log(`   OneSignal Notification ID: ${response.id}`);
      console.log(`   Recipients: ${(response as any).recipients || 'Unknown'}`);
      if (response.errors) {
        console.log(`   ⚠️  Errors: ${JSON.stringify(response.errors)}`);
      }
      if ((response as any).invalid_aliases) {
        console.log(`   ⚠️  Invalid Aliases: ${JSON.stringify((response as any).invalid_aliases)}`);
      }
      console.log('================================================\n');
    } catch (error: any) {
      console.error('❌ PUSH FAILED WITH ERROR:');
      console.error(`   Error Type: ${error.name || 'Unknown'}`);
      console.error(`   Error Message: ${error.message || 'No message'}`);
      if (error.response) {
        console.error(`   Response Status: ${error.response?.status}`);
        console.error(`   Response Data: ${JSON.stringify(error.response?.data)}`);
      }
      if (error.body) {
        console.error(`   Error Body: ${JSON.stringify(error.body)}`);
      }
      console.error(`   Stack: ${error.stack}`);
      console.error('================================================\n');
      // Don't throw - we don't want notification failures to break the app
    }
  }

  /**
   * Send notification when a room is created
   */
  static async notifyRoomCreated(creatorName: string, recipientId: string, roomId: string): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'New Room',
      message: `${creatorName} created a new room with you`,
      data: {
        type: 'room_created',
        roomId,
      },
    });
  }

  /**
   * Send notification when a room is renamed
   */
  static async notifyRoomRenamed(
    updaterName: string,
    recipientId: string,
    roomId: string,
    oldName: string,
    newName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Room Renamed',
      message: `${updaterName} renamed the room ${oldName} to ${newName}`,
      data: {
        type: 'room_renamed',
        roomId,
        roomName: newName,
      },
    });
  }

  /**
   * Send notification when an element is added to a room
   */
  static async notifyElementAdded(
    creatorName: string,
    recipientId: string,
    roomId: string,
    roomName: string | null,
    elementType: 'note' | 'photo' | 'audio' | 'horoscope' | 'video' | 'link'
  ): Promise<void> {
    const roomDisplay = roomName || 'a room';
    const elementDisplay = elementType === 'audio' ? 'voice note' : 
                          elementType === 'horoscope' ? 'horoscope reading' : 
                          elementType === 'video' ? 'video' :
                          elementType === 'link' ? 'link' :
                          elementType;
    
    await this.sendToUser({
      userId: recipientId,
      title: 'Object Added',
      message: `${creatorName} added a ${elementDisplay} in ${roomDisplay}`,
      data: {
        type: 'element_added',
        roomId,
        elementType,
      },
    });
  }

  /**
   * Send notification when a room is deleted
   */
  static async notifyRoomDeleted(
    creatorName: string,
    recipientId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Room Deleted',
      message: `${creatorName} deleted the room "${roomName}"`,
      data: {
        type: 'room_deleted',
        roomName,
      },
    });
  }

  /**
   * Send notification when a participant leaves a room
   * Note: This notification is only sent to the room owner
   */
  static async notifyParticipantLeft(
    participantName: string,
    creatorId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: creatorId,
      title: 'Participant Left',
      message: `${participantName} left the room ${roomName}`,
      data: {
        type: 'participant_left',
        roomName,
        participantName,
      },
    });
  }

  /**
   * Send notification when user is added to a room
   */
  static async notifyAddedToRoom(
    adderName: string,
    recipientId: string,
    roomId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Added to Room',
      message: `${adderName} added you to "${roomName}"`,
      data: {
        type: 'added_to_room',
        roomId,
        roomName,
        addedBy: adderName,
      },
    });
  }

  /**
   * Send notification when user is removed from a room
   */
  static async notifyRemovedFromRoom(
    removerName: string,
    recipientId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Removed from Room',
      message: `${removerName} removed you from "${roomName}"`,
      data: {
        type: 'removed_from_room',
        roomName,
        removedBy: removerName,
      },
    });
  }


  /**
   * Send notification when someone likes your comment
   */
  static async notifyCommentLike(
    likerName: string,
    commentAuthorId: string,
    roomId: string,
    roomName: string,
    commentText: string
  ): Promise<void> {
    await this.sendToUser({
      userId: commentAuthorId,
      title: 'Your comment was liked',
      message: `${likerName} liked your comment: ${commentText}`,
      data: {
        type: 'comment_like',
        roomId,
        roomName,
        likerName,
      },
    });
  }

  /**
   * Send notification when someone adds a comment to a room
   */
  static async notifyNewComment(
    recipientId: string,
    commenterName: string,
    roomName: string,
    commentPreview: string
  ): Promise<void> {
    const truncatedComment = commentPreview.length > 50 
      ? commentPreview.substring(0, 47) + '...' 
      : commentPreview;
    
    await this.sendToUser({
      userId: recipientId,
      title: `New comment in ${roomName}`,
      message: `${commenterName}: ${truncatedComment}`,
      data: {
        type: 'room_comment',
        roomName,
        commenterName,
      },
    });
  }


  /**
   * Send notification when someone follows you
   */
  static async notifyUserFollowed(
    followerName: string,
    recipientId: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'New Follower',
      message: `${followerName} started following you`,
      data: {
        type: 'user_followed',
        followerName,
      },
    });
  }

  /**
   * Send notification when someone likes your room
   */
  static async notifyRoomLike(
    likerName: string,
    roomOwnerId: string,
    roomId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: roomOwnerId,
      title: 'Your room was liked',
      message: `${likerName} liked your room: ${roomName}`,
      data: {
        type: 'room_like',
        roomId,
        roomName,
        likerName,
      },
    });
  }

  /**
   * Send notification when someone mentions you in a comment
   */
  static async notifyMentioned(
    mentionedUserId: string,
    mentionerName: string,
    roomName: string,
    commentPreview: string
  ): Promise<void> {
    const truncatedComment = commentPreview.length > 50 
      ? commentPreview.substring(0, 47) + '...' 
      : commentPreview;
    
    await this.sendToUser({
      userId: mentionedUserId,
      title: `${mentionerName} mentioned you`,
      message: `In ${roomName}: ${truncatedComment}`,
      data: {
        type: 'mention',
        roomName,
        mentionerName,
      },
    });
  }

  /**
   * Send notification when room background is changed
   */
  static async notifyBackgroundChanged(
    changerName: string,
    recipientId: string,
    roomId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Background Changed',
      message: `${changerName} changed the background in ${roomName}`,
      data: {
        type: 'background_changed',
        roomId,
        roomName,
      },
    });
  }
}