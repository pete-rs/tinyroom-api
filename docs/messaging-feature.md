# Messaging Feature Documentation

## Overview
Room-based messaging system that allows participants to send text messages within rooms. Features include real-time delivery, heart reactions, read receipts, typing indicators, push notifications, and unread tracking. Messages are scoped to specific rooms and limited to 1000 characters.

## Database Schema

### Message Model
```prisma
model Message {
  id         String    @id @default(uuid())
  roomId     String    @map("room_id")
  room       Room      @relation(fields: [roomId], references: [id])
  senderId   String    @map("sender_id")
  sender     User      @relation(fields: [senderId], references: [id])
  text       String    @db.Text // Max 1000 characters enforced in API
  createdAt  DateTime  @default(now()) @map("created_at")
  updatedAt  DateTime  @updatedAt @map("updated_at")
  deletedAt  DateTime? @map("deleted_at") // Soft delete
  
  reactions  MessageReaction[]
  readBy     MessageRead[]
  
  @@index([roomId, createdAt]) // For efficient pagination
  @@map("messages")
}
```

### Heart Reactions
```prisma
model MessageReaction {
  messageId  String   @map("message_id")
  message    Message  @relation(fields: [messageId], references: [id])
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id])
  createdAt  DateTime @default(now()) @map("created_at")
  
  @@id([messageId, userId]) // One reaction per user per message
  @@map("message_reactions")
}
```

### Read Receipts
```prisma
model MessageRead {
  messageId  String   @map("message_id")
  message    Message  @relation(fields: [messageId], references: [id])
  userId     String   @map("user_id")
  user       User     @relation(fields: [userId], references: [id])
  readAt     DateTime @default(now()) @map("read_at")
  
  @@id([messageId, userId])
  @@index([messageId]) // For efficient read receipt queries
  @@map("message_reads")
}
```

### Unread Tracking
Using Option A strategy - timestamp-based tracking:
```prisma
model RoomParticipant {
  // ... existing fields ...
  lastReadAt DateTime @default(now()) @map("last_read_at") // When user last read messages
}
```

## REST API Endpoints

### Send Message
`POST /api/rooms/:roomId/messages`

**Headers**:
- `Authorization: Bearer <token>`

**Body**:
```json
{
  "text": "Hello everyone!"
}
```

**Response**:
```json
{
  "data": {
    "id": "message-id",
    "roomId": "room-id",
    "senderId": "user-id",
    "text": "Hello everyone!",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "sender": {
      "id": "user-id",
      "username": "johndoe",
      "firstName": "John",
      "avatarUrl": "https://..."
    },
    "reactions": [],
    "readBy": []
  }
}
```

**Validation**:
- Text is required and must be a string
- Text is trimmed of leading/trailing whitespace
- Empty messages (after trimming) are rejected
- Maximum 1000 characters
- User must be a participant in the room

**Behavior**:
- Updates room's `updatedAt` timestamp
- Sends push notifications to all other participants
- Does NOT automatically mark as read for sender

### Get Messages (Paginated)
`GET /api/rooms/:roomId/messages?page=1`

**Headers**:
- `Authorization: Bearer <token>`

**Query Parameters**:
- `page` (optional, default: 1) - Page number for pagination

**Response**:
```json
{
  "data": {
    "messages": [
      {
        "id": "message-id",
        "roomId": "room-id",
        "senderId": "user-id",
        "text": "Hello!",
        "createdAt": "2024-01-15T10:00:00Z",
        "updatedAt": "2024-01-15T10:00:00Z",
        "sender": {
          "id": "user-id",
          "username": "johndoe",
          "firstName": "John",
          "avatarUrl": "https://..."
        },
        "reactions": [
          {
            "userId": "user-id-2",
            "createdAt": "2024-01-15T10:01:00Z"
          }
        ],
        "readBy": [
          {
            "userId": "user-id-2",
            "readAt": "2024-01-15T10:02:00Z"
          }
        ]
      }
    ],
    "pagination": {
      "page": 1,
      "totalPages": 5,
      "totalCount": 150,
      "hasMore": true
    }
  }
}
```

**Behavior**:
- Returns 30 messages per page
- Messages ordered newest first in response (reverse chronological)
- Messages in array are then reversed to show oldest first for display
- Automatically updates `lastReadAt` for the requesting user
- Only returns non-deleted messages
- User must be a participant in the room

### Delete Message
`DELETE /api/rooms/:roomId/messages/:messageId`

**Headers**:
- `Authorization: Bearer <token>`

**Response**:
```json
{
  "data": {
    "message": "Message deleted successfully"
  }
}
```

**Validation**:
- Only the message sender can delete their own messages
- Message must exist and not already be deleted
- User must be the sender of the message

**Behavior**:
- Soft delete (sets `deletedAt` timestamp)
- Updates room's `updatedAt` timestamp
- Message is excluded from future queries but data is retained

### Toggle Heart Reaction
`POST /api/rooms/:roomId/messages/:messageId/reaction`

**Headers**:
- `Authorization: Bearer <token>`

**Response (when adding)**:
```json
{
  "data": {
    "reacted": true,
    "message": "Reaction added"
  }
}
```

**Response (when removing)**:
```json
{
  "data": {
    "reacted": false,
    "message": "Reaction removed"
  }
}
```

**Behavior**:
- Toggles reaction on/off
- One reaction per user per message
- User must be a participant in the room
- Message must exist and not be deleted

### Mark All Messages as Read
`POST /api/rooms/:roomId/messages/read`

**Headers**:
- `Authorization: Bearer <token>`

**Response**:
```json
{
  "data": {
    "message": "Messages marked as read"
  }
}
```

**Behavior**:
- Updates user's `lastReadAt` timestamp to current time
- Used for bulk marking all messages as read
- Does not create individual read receipts

## Socket.IO Events

### Send Message
```javascript
// Client → Server
socket.emit('message:send', {
  roomId: 'room-id',
  text: 'Hello everyone!'
});

// Server → All clients in room (including sender)
socket.on('message:new', {
  message: {
    id: 'message-id',
    roomId: 'room-id',
    senderId: 'user-id',
    text: 'Hello everyone!',
    createdAt: '2024-01-15T10:00:00Z',
    sender: {
      id: 'user-id',
      username: 'johndoe',
      firstName: 'John',
      avatarUrl: 'https://...'
    },
    reactions: [],
    readBy: []
  }
});
```

### Delete Message
```javascript
// Client → Server
socket.emit('message:delete', {
  roomId: 'room-id',
  messageId: 'message-id'
});

// Server → All clients in room
socket.on('message:deleted', {
  messageId: 'message-id'
});
```

### Typing Indicator
```javascript
// Client → Server
socket.emit('message:typing', {
  roomId: 'room-id',
  isTyping: true  // or false when stopped typing
});

// Server → Other clients in room (not sender)
socket.on('message:typing', {
  userId: 'user-id',
  username: 'johndoe',
  firstName: 'John',
  isTyping: true
});
```

### Toggle Heart Reaction
```javascript
// Client → Server
socket.emit('message:reaction:toggle', {
  roomId: 'room-id',
  messageId: 'message-id'
});

// Server → All clients in room (including sender)
// When adding reaction:
socket.on('message:reaction:added', {
  messageId: 'message-id',
  userId: 'user-id'
});

// When removing reaction:
socket.on('message:reaction:removed', {
  messageId: 'message-id',
  userId: 'user-id'
});
```

### Mark Messages as Read (with Read Receipts)
```javascript
// Client → Server
socket.emit('messages:mark-read', {
  roomId: 'room-id',
  messageIds: ['msg-1', 'msg-2', 'msg-3']
});

// Server → All clients in room
socket.on('messages:read-receipts', {
  userId: 'user-id',
  messageIds: ['msg-1', 'msg-2', 'msg-3']
});
```

**Behavior**:
- Creates individual read receipts for each message
- Updates user's `lastReadAt` timestamp
- Broadcasts to all participants for UI updates
- Skips duplicates if already marked as read

### Mark All Messages as Read (Legacy)
```javascript
// Client → Server
socket.emit('messages:read', {
  roomId: 'room-id'
});

// Server → Same client only
socket.on('messages:read:success', {
  roomId: 'room-id'
});
```

**Behavior**:
- Updates `lastReadAt` timestamp only
- Does not create individual read receipts
- Confirmation sent only to requesting client

## Push Notifications

When a message is sent, all other participants receive:
- **Title**: Room name
- **Body**: "{firstName}: {first 30 chars of message}..."
- **Data**: 
  ```json
  {
    "type": "new_message",
    "roomId": "room-id",
    "roomName": "Room Name",
    "senderName": "John"
  }
  ```

Example: 
- Title: "Team Room"
- Body: "John: Hey everyone, how's the project..."

## Unread Tracking

### How It Works
1. **lastReadAt**: Timestamp on RoomParticipant tracks when user last read messages
2. **Unread Count Calculation**: 
   ```sql
   SELECT COUNT(*) FROM messages 
   WHERE roomId = ? 
   AND createdAt > lastReadAt 
   AND senderId != currentUserId 
   AND deletedAt IS NULL
   ```
3. **Combined Unread Count**: In my-rooms endpoint, total unread = unread elements + unread messages

### When Read Status Updates
- **Automatically**: When fetching messages via GET endpoint
- **Manually**: Via REST endpoint or Socket.IO events
- **NOT automatically** when sending a message (sender must explicitly mark as read)

### Unread Count in My Rooms
The `/api/rooms/my-rooms` endpoint returns:
```json
{
  "unreadCount": 5,  // Total of unread elements + messages
  // ... other room data
}
```

## iOS Implementation Guidelines

### Message Display
1. **Chronological Order**: Display oldest messages at top, newest at bottom
2. **Message Grouping**: Group consecutive messages from same sender
3. **Timestamps**: 
   - Show relative times for recent messages ("2m ago", "1h ago")
   - Show absolute times for older messages ("Jan 15, 10:30 AM")
4. **Sender Info**: Show avatar and name for first message in a group

### Heart Reactions
1. **Display**: Show heart icon with count below each message
2. **Interaction**: Tap to toggle reaction
3. **Animation**: Animate heart when added/removed
4. **Real-time**: Update immediately via socket events

### Read Receipts
1. **Display**: Show small avatars or initials of users who have read
2. **Position**: Below message, right-aligned
3. **Grouping**: For grouped messages, show on last message only
4. **Real-time**: Update via `messages:read-receipts` event

### Typing Indicators
1. **Display**: Show "{name} is typing..." below message list
2. **Multiple Users**: "John and Jane are typing..."
3. **Timeout**: Clear after 5 seconds of no typing events
4. **Debounce**: Send typing event every 2-3 seconds while typing

### Performance Optimizations
1. **Lazy Loading**: Load messages as user scrolls
2. **Message Caching**: Cache recent messages locally
3. **Optimistic Updates**: 
   - Show sent message immediately
   - Show reaction immediately
   - Update with server response
4. **Pagination**: 
   - Preload next page when user is 5 messages from end
   - Show loading indicator at top when loading older messages

### Real-time Sync
1. **Socket Connection**: Use existing room socket connection
2. **Message Queue**: Queue messages if sent while offline
3. **Reconnection**: Fetch missed messages on reconnect
4. **Conflict Resolution**: Server response is source of truth

## Security & Validation

### Access Control
- Only room participants can send/read messages
- Only message sender can delete their messages
- Reactions and read receipts require room participation

### Input Validation
- Message text: Required, max 1000 characters after trimming
- Empty messages rejected
- HTML/script tags should be escaped on display

### Rate Limiting
- Consider implementing per-user message rate limits
- Typing indicators should be throttled client-side

## Error Handling

### Common Error Responses
- `401 UNAUTHORIZED`: User not authenticated
- `403 FORBIDDEN`: User not a participant in room
- `404 NOT_FOUND`: Message or room not found
- `400 INVALID_INPUT`: Invalid message format
- `500 INTERNAL_ERROR`: Server error

### Client Error Handling
1. **Retry Logic**: Retry failed message sends with exponential backoff
2. **Offline Queue**: Store messages locally when offline
3. **User Feedback**: Show clear error messages
4. **Fallback**: Use REST API if socket connection fails

## Future Considerations

### Planned Features
- **Image Messages**: Support for inline images (mentioned as possible future feature)

### Not Planned
- **Message Editing**: Messages are immutable
- **Message Threading/Replies**: Flat conversation structure
- **Multiple Reaction Types**: Only heart reactions
- **Voice/Video Messages**: Text only for now

## Testing Checklist

### Functionality
- [ ] Send message (text validation, max length)
- [ ] Receive real-time messages
- [ ] Delete own messages
- [ ] Cannot delete others' messages
- [ ] Add/remove heart reactions
- [ ] See others' reactions in real-time
- [ ] Mark messages as read
- [ ] See read receipts
- [ ] Typing indicators work
- [ ] Push notifications received
- [ ] Pagination works correctly
- [ ] Unread counts update properly

### Edge Cases
- [ ] Empty message rejection
- [ ] 1000+ character message truncation
- [ ] Offline message queuing
- [ ] Concurrent reaction toggles
- [ ] Rapid message sending
- [ ] Large room with many messages
- [ ] User leaves/rejoins room

### Performance
- [ ] Message list scrolling smooth
- [ ] Pagination loads quickly
- [ ] Reactions update instantly
- [ ] No memory leaks with long conversations