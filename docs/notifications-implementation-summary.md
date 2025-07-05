# In-App Notifications Implementation Summary

## Overview

We've implemented a comprehensive in-app notifications system for the notifications tab with support for batching, deep linking, and efficient querying.

## Database Changes

### New Notification Model
- **Table**: `notifications`
- **Fields**:
  - `id`: UUID primary key
  - `userId`: Recipient of the notification
  - `type`: Enum (ROOM_RENAMED, ELEMENT_ADDED, PARTICIPANT_LEFT, etc.)
  - `actorId`: User who performed the action
  - `roomId`: Optional, for room-related notifications
  - `isRead`: Boolean, default false
  - `createdAt`: Timestamp
  - `data`: JSON field for flexible type-specific data
  - **Batching fields**:
    - `batchKey`: For grouping related notifications
    - `batchCount`: Number of items in batch
    - `batchWindowStart/End`: Time window for batching

### Indexes
- `[userId, isRead, createdAt DESC]` - Main query pattern
- `[userId, type, createdAt DESC]` - Filter by type
- `[batchKey, batchWindowEnd]` - For batch updates
- `[roomId]` - Room-based queries

## Services

### InAppNotificationService (`/src/services/inAppNotificationService.ts`)
- `createNotification()` - Creates notifications with automatic batching for ELEMENT_ADDED
- `markAsRead()` - Mark specific notifications as read
- `markAllAsRead()` - Mark all user's notifications as read
- `getUnreadCount()` - Get count for badge display
- Batching logic: 5-minute windows for element additions

## API Endpoints

### Routes (`/api/notifications/*`)
1. `GET /` - Get paginated notifications with full details
2. `GET /unread-count` - Get unread notification count
3. `PUT /read` - Mark specific notifications as read
4. `PUT /read-all` - Mark all notifications as read

All endpoints require authentication and complete profile.

## Notification Creation Points

### 1. Room Renamed
- **Location**: `roomController.updateRoomName()`
- **Recipients**: All participants except the actor
- **Data**: `{ oldName, newName, roomName }`
- **Not batched**

### 2. Element Added
- **Location**: `roomHandlers.ts` socket handler
- **Recipients**: All participants except the creator
- **Data**: `{ elementType, roomName, thumbnailUrl }`
- **Batched**: Within 5-minute windows by room and actor

### 3. Participant Left
- **Location**: `roomController.permanentlyLeaveRoom()`
- **Recipients**: Room owner only
- **Data**: `{ roomName }`
- **Not batched**

## Response Format

Each notification includes:
```json
{
  "id": "notification-id",
  "type": "ELEMENT_ADDED",
  "displayText": "Renee added 20 photos and 3 videos",
  "isRead": false,
  "createdAt": "2025-07-04T12:00:00Z",
  "actor": { /* user object */ },
  "deepLink": {
    "type": "room",  // or "profile"
    "roomId": "room-id",
    "actorId": "actor-id"
  },
  "roomName": "Room Name",
  "thumbnails": [/* up to 5 thumbnail objects */],
  "batchCount": 23
}
```

## Batching Logic

For ELEMENT_ADDED notifications:
1. Creates batch key: `element_added:{roomId}:{actorId}:{date}`
2. Checks for existing notification within 5-minute window
3. If exists: Updates count, adds thumbnails (max 5), extends window
4. If not: Creates new notification with batch fields

## Deep Linking Support

- **Room notifications**: Navigate to room with `roomId`
- **Profile notifications**: Navigate to user profile with `actorId`
- iOS app uses `deepLink.type` to determine navigation

## Performance Optimizations

1. **Efficient Indexes**: Optimized for common query patterns
2. **Pre-sized Thumbnails**: 180px thumbnails for fast loading
3. **Batching**: Reduces notification count for bulk operations
4. **Pagination**: 20 notifications per page by default
5. **Background Processing**: Notifications created asynchronously

## Testing

To test the implementation:

1. **Create notifications**:
   - Rename a room
   - Add elements to a room
   - Leave a room (as non-owner)

2. **Test batching**:
   - Add multiple elements within 5 minutes
   - Verify they batch into single notification

3. **Test API**:
   - Fetch notifications with pagination
   - Mark as read (individual and all)
   - Check unread count

## Future Enhancements

1. Add more notification types (follows, comments, mentions)
2. Implement notification preferences
3. Add WebSocket support for real-time updates
4. Implement notification deletion
5. Add notification grouping by day/week