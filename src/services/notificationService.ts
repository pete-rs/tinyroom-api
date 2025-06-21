import * as OneSignal from '@onesignal/node-onesignal';
import { config } from '../config';

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
    try {
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
      
      const response = await client.createNotification(notification);
      console.log('📱 Notification sent:', { 
        userId, 
        title, 
        notificationId: response.id,
        external_id: notification.include_aliases?.external_id
      });
    } catch (error) {
      console.error('❌ Failed to send notification:', error);
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
    newName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: 'Room Renamed',
      message: `${updaterName} renamed your room to ${newName}`,
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
      title: 'New Content',
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
   */
  static async notifyParticipantLeft(
    participantName: string,
    creatorId: string,
    roomName: string
  ): Promise<void> {
    await this.sendToUser({
      userId: creatorId,
      title: 'Participant Left',
      message: `${participantName} left the room "${roomName}"`,
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
   * Send notification when a new message is sent
   */
  static async notifyNewMessage(
    senderName: string,
    recipientId: string,
    roomId: string,
    roomName: string,
    messagePreview: string
  ): Promise<void> {
    await this.sendToUser({
      userId: recipientId,
      title: roomName,
      message: `${senderName}: ${messagePreview}`,
      data: {
        type: 'new_message',
        roomId,
        roomName,
        senderName,
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
}