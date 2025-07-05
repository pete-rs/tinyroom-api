# iOS Notifications Tab Implementation Guide

## Overview

The notifications tab displays in-app notifications with deep linking support. Notifications are batched for certain types (like multiple element additions) and provide navigation to the appropriate screen when tapped.

## API Endpoints

### 1. Get Notifications (Paginated)

```
GET /api/notifications?page=1&limit=20
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": [
    {
      "id": "notif-123",
      "type": "ELEMENT_ADDED",
      "displayText": "Renee added 20 photos and 3 videos to Awesome Fun",
      "isRead": false,
      "createdAt": "2025-07-04T12:00:00Z",
      "actor": {
        "id": "user-456",
        "username": "renee",
        "firstName": "Renee",
        "avatarUrl": "https://..."
      },
      "deepLink": {
        "type": "room",
        "roomId": "room-789",
        "actorId": "user-456"
      },
      "roomName": "Awesome Fun",
      "thumbnails": [
        {
          "url": "https://cloudinary.com/thumbnail1_180px.jpg",
          "type": "PHOTO"
        },
        {
          "url": "https://cloudinary.com/thumbnail2_180px.jpg",
          "type": "PHOTO"
        }
        // ... up to 5 thumbnails
      ],
      "batchCount": 23
    },
    {
      "id": "notif-124",
      "type": "ROOM_RENAMED",
      "displayText": "Pete renamed the room \"Summer Vacation\" to \"Italy Trip 2025\"",
      "isRead": true,
      "createdAt": "2025-07-04T11:00:00Z",
      "actor": {
        "id": "user-789",
        "username": "pete",
        "firstName": "Pete",
        "avatarUrl": null
      },
      "deepLink": {
        "type": "room",
        "roomId": "room-789",
        "actorId": "user-789"
      },
      "roomName": "Italy Trip 2025",
      "thumbnails": [],
      "batchCount": 1
    },
    {
      "id": "notif-125",
      "type": "USER_FOLLOWED",
      "displayText": "Sarah started following you",
      "isRead": false,
      "createdAt": "2025-07-04T10:00:00Z",
      "actor": {
        "id": "user-999",
        "username": "sarah",
        "firstName": "Sarah",
        "avatarUrl": "https://..."
      },
      "deepLink": {
        "type": "profile",
        "roomId": null,
        "actorId": "user-999"
      },
      "isFollowingBack": false,  // Important: Shows if current user follows them back
      "thumbnails": [],
      "batchCount": 1
    }
  ],
  "meta": {
    "totalCount": 42,
    "page": 1,
    "limit": 20,
    "totalPages": 3,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

### 2. Get Unread Count

```
GET /api/notifications/unread-count
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "unreadCount": 5
  }
}
```

### 3. Mark Notifications as Read

```
PUT /api/notifications/read
Content-Type: application/json
Authorization: Bearer {token}

{
  "notificationIds": ["notif-123", "notif-124"]
}
```

**Response:**
```json
{
  "data": {
    "message": "Notifications marked as read",
    "count": 2
  }
}
```

### 4. Mark All Notifications as Read

```
PUT /api/notifications/read-all
Authorization: Bearer {token}
```

**Response:**
```json
{
  "data": {
    "message": "All notifications marked as read"
  }
}
```

## Notification Types

### ROOM NOTIFICATIONS

#### 1. **ADDED_TO_ROOM**
- **Scenario**: Someone adds you to an existing room
- **Display**: {actor} added you to the room: {roomName}
- **Deep link**: Opens room
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-001",
  "type": "ADDED_TO_ROOM",
  "displayText": "pete added you to the room: Italy Trip 2025",
  "isRead": false,
  "createdAt": "2025-07-04T15:02:44.161Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-789",
    "actorId": "user-123"
  },
  "roomName": "Italy Trip 2025",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 2. **ROOM_RENAMED**
- **Scenario**: Room owner changes the room name
- **Display**: {actor} renamed the room "{oldName}" to "{newName}"
- **Deep link**: Opens room
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-002",
  "type": "ROOM_RENAMED",
  "displayText": "pete renamed the room \"Summer Vacation\" to \"Italy Trip 2025\"",
  "isRead": false,
  "createdAt": "2025-07-04T15:03:31.950Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-789",
    "actorId": "user-123"
  },
  "roomName": "Italy Trip 2025",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 3. **ELEMENT_ADDED**
- **Scenario**: Someone adds photos, videos, or notes to a room you're in
- **Single**: {actor} added a photo to {roomName}
- **Batched**: {actor} added 20 photos and 3 videos to {roomName}
- **Deep link**: Opens room
- **Shows up to 5 thumbnails** (180px pre-sized)
- **Batched within 5-minute windows**

**Sample Response (Batched):**
```json
{
  "id": "notif-003",
  "type": "ELEMENT_ADDED",
  "displayText": "renee added 20 photos and 3 videos to Awesome Fun",
  "isRead": false,
  "createdAt": "2025-07-04T16:06:19.544Z",
  "actor": {
    "id": "user-456",
    "username": "renee",
    "firstName": "Renee",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-789",
    "actorId": "user-456"
  },
  "roomName": "Awesome Fun",
  "thumbnails": [
    {
      "url": "https://res.cloudinary.com/.../w_180,h_180,c_limit,q_auto/image1.jpg",
      "type": "PHOTO"
    },
    {
      "url": "https://res.cloudinary.com/.../w_180,h_180,c_limit,q_auto/image2.jpg",
      "type": "PHOTO"
    },
    {
      "url": "https://res.cloudinary.com/.../w_180,h_180,c_limit,q_auto/video1_thumb.jpg",
      "type": "VIDEO"
    }
  ],
  "batchCount": 23
}
```

#### 4. **REMOVED_FROM_ROOM**
- **Scenario**: Room owner removes you from a room
- **Display**: {actor} removed you from the room: {roomName}
- **Deep link**: None (stays on notifications tab)
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-004",
  "type": "REMOVED_FROM_ROOM",
  "displayText": "pete removed you from the room: Old Project",
  "isRead": false,
  "createdAt": "2025-07-04T17:00:00.000Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "none",
    "roomId": null,
    "actorId": "user-123"
  },
  "roomName": "Old Project",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 5. **ROOM_DELETED**
- **Scenario**: Room owner permanently deletes a room you were in
- **Display**: {actor} deleted the room {roomName}
- **Deep link**: None (stays on notifications tab)
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-005",
  "type": "ROOM_DELETED",
  "displayText": "pete deleted the room July 4, 2025 12:58PM",
  "isRead": false,
  "createdAt": "2025-07-04T16:59:00.589Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "none",
    "roomId": null,
    "actorId": "user-123"
  },
  "roomName": "July 4, 2025 12:58PM",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 6. **PARTICIPANT_LEFT**
- **Scenario**: Someone leaves a room you own
- **Display**: {actor} left the room {roomName}
- **Deep link**: Opens room
- **Only sent to room owner**
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-006",
  "type": "PARTICIPANT_LEFT",
  "displayText": "sarah left the room Beach House Plans",
  "isRead": false,
  "createdAt": "2025-07-04T18:00:00.000Z",
  "actor": {
    "id": "user-789",
    "username": "sarah",
    "firstName": "Sarah",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-123",
    "actorId": "user-789"
  },
  "roomName": "Beach House Plans",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 7. **ROOM_LIKE**
- **Scenario**: Someone likes/reacts to your room (room owners only)
- **Display**: {actor} liked your room: {roomName}
- **Deep link**: Opens room
- **Only sent to room owner**
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-007",
  "type": "ROOM_LIKE",
  "displayText": "sarah liked your room: Vacation Planning",
  "isRead": false,
  "createdAt": "2025-07-04T19:00:00.000Z",
  "actor": {
    "id": "user-789",
    "username": "sarah",
    "firstName": "Sarah",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-456",
    "actorId": "user-789"
  },
  "roomName": "Vacation Planning",
  "thumbnails": [],
  "batchCount": 1
}
```

### COMMENT NOTIFICATIONS

#### 8. **COMMENT_ADDED**
- **Scenario**: Someone comments in a room you're in
- **Display**: {actor} added a comment in {roomName}: {commentPreview}
- **Deep link**: Opens room
- **Shows comment preview** (up to 100 chars)
- **Sent to all room participants except the commenter**
- **Not batched**
- **Note**: If a participant is mentioned, they receive MENTION notification instead

**Sample Response:**
```json
{
  "id": "notif-008",
  "type": "COMMENT_ADDED",
  "displayText": "pete added a comment in Italy Trip: This looks amazing! Can't wait to visit the...",
  "isRead": false,
  "createdAt": "2025-07-04T20:00:00.000Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-789",
    "actorId": "user-123"
  },
  "roomName": "Italy Trip",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 9. **MENTION**
- **Scenario**: Someone @mentions you in a comment
- **Display**: {actor} mentioned you: {commentPreview}
- **Deep link**: Opens room
- **Shows comment preview** (up to 100 chars)
- **Not batched**
- **Note**: Replaces COMMENT_ADDED notification for mentioned users

**Sample Response:**
```json
{
  "id": "notif-009",
  "type": "MENTION",
  "displayText": "pete mentioned you: @sarah what do you think about this location for dinner?",
  "isRead": false,
  "createdAt": "2025-07-04T20:30:00.000Z",
  "actor": {
    "id": "user-123",
    "username": "pete",
    "firstName": "Pete",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-789",
    "actorId": "user-123"
  },
  "roomName": "Italy Trip",
  "thumbnails": [],
  "batchCount": 1
}
```

#### 10. **COMMENT_LIKE**
- **Scenario**: Someone likes your comment
- **Display**: {actor} liked your comment: {commentPreview}
- **Deep link**: Opens room
- **Shows comment preview** (up to 100 chars)
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-010",
  "type": "COMMENT_LIKE",
  "displayText": "sarah liked your comment: Great idea! Let's meet at 7pm",
  "isRead": false,
  "createdAt": "2025-07-04T21:00:00.000Z",
  "actor": {
    "id": "user-789",
    "username": "sarah",
    "firstName": "Sarah",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "room",
    "roomId": "room-456",
    "actorId": "user-789"
  },
  "roomName": "Dinner Plans",
  "thumbnails": [],
  "batchCount": 1
}
```

### FOLLOW NOTIFICATIONS

#### 11. **USER_FOLLOWED**
- **Scenario**: Someone starts following you
- **Display**: {actor} started following you
- **Deep link**: Opens actor's profile
- **Includes `isFollowingBack` field** for follow button state
- **Not batched**

**Sample Response:**
```json
{
  "id": "notif-011",
  "type": "USER_FOLLOWED",
  "displayText": "sarah started following you",
  "isRead": false,
  "createdAt": "2025-07-04T10:00:00.000Z",
  "actor": {
    "id": "user-999",
    "username": "sarah",
    "firstName": "Sarah",
    "avatarUrl": "https://..."
  },
  "deepLink": {
    "type": "profile",
    "roomId": null,
    "actorId": "user-999"
  },
  "isFollowingBack": false,
  "thumbnails": [],
  "batchCount": 1
}
```

## Deep Linking

Each notification includes a `deepLink` object:

```swift
struct NotificationDeepLink {
    let type: String       // "room" or "profile"
    let roomId: String?    // For room notifications
    let actorId: String    // Who performed the action
}
```

### Navigation Logic:

```swift
func handleNotificationTap(_ notification: Notification) {
    switch notification.deepLink.type {
    case "room":
        if let roomId = notification.deepLink.roomId {
            navigateToRoom(roomId: roomId)
        }
    case "profile":
        navigateToProfile(userId: notification.deepLink.actorId)
    case "none":
        // No navigation - stay on notifications tab
        break
    default:
        // Stay on notifications tab
        break
    }
}
```

## UI Implementation

### Notification Cell Design:

1. **Avatar**: Actor's profile image (40x40)
2. **Text**: Display text with actor name in semibold
3. **Thumbnails**: For ELEMENT_ADDED, show up to 5 thumbnails in a row (60x60 each)
4. **Timestamp**: Relative time (e.g., "2h ago", "Yesterday")
5. **Unread Indicator**: Blue dot or background tint for unread

### Batched Notifications:

For ELEMENT_ADDED notifications:
- Show thumbnail strip below text (max 5 thumbnails)
- Display count if more than 5 items: "... and 15 more"
- Thumbnails are 180px pre-sized for performance

### Follow Button for USER_FOLLOWED:

For USER_FOLLOWED notifications:
- Check the `isFollowingBack` field to determine button state
- If `false`: Show "Follow" button (blue, filled)
- If `true`: Show "Following" button (gray, outlined)
- Tapping notification opens profile (deep link)
- Tapping follow button calls `POST /api/users/{actorId}/follow`

```swift
if notification.type == .userFollowed {
    followButton.isHidden = false
    if notification.isFollowingBack {
        followButton.setTitle("Following", for: .normal)
        followButton.backgroundColor = .systemGray5
    } else {
        followButton.setTitle("Follow", for: .normal)
        followButton.backgroundColor = .systemBlue
    }
}
```

### List Management:

1. **Pull to Refresh**: Reload first page
2. **Infinite Scroll**: Load next page when near bottom
3. **Mark as Read**: 
   - Automatically when tapped
   - Optionally when visible for 2+ seconds
4. **Swipe Actions**: Delete (future) or mark as read

## Badge Management

Update tab bar badge with unread count:

```swift
// Poll every 30 seconds when app is active
Timer.scheduledTimer(withTimeInterval: 30, repeats: true) { _ in
    API.getUnreadNotificationCount { count in
        notificationsTabItem.badgeValue = count > 0 ? "\(count)" : nil
    }
}

// Also update after marking notifications as read
```

## Performance Considerations

1. **Thumbnails**: All thumbnails are pre-sized to 180px on the server
2. **Batching**: ELEMENT_ADDED notifications are batched server-side within 5-minute windows
3. **Pagination**: Load 20 notifications at a time
4. **Caching**: Cache actor avatars and thumbnails
5. **Read Status**: Batch mark-as-read operations

## Testing Scenarios

1. **Single Notifications**: Create room, rename room, leave room
2. **Batched Notifications**: Upload multiple photos/videos within 5 minutes
3. **Mixed Content Batch**: Upload photos and videos together
4. **Deep Linking**: Tap each notification type and verify navigation
5. **Read/Unread**: Verify visual states and badge updates
6. **Pagination**: Create 50+ notifications and test scrolling

## Future Enhancements

1. **Push Notification Integration**: Sync with push notification tap actions
2. **Notification Settings**: Allow users to customize which types they see
3. **Sound/Vibration**: Optional feedback for new notifications
4. **Rich Previews**: Show comment text or reaction emojis
5. **Quick Actions**: 3D touch to preview room without navigating