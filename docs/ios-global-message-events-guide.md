# iOS Global Message Events Implementation Guide

## Overview
The backend now broadcasts global message events to support real-time message indicators in MyRooms without requiring users to join all rooms.

## New Global Events

### 1. `message:new:global`
Broadcast to ALL connected sockets when a new message is created.

```javascript
// Backend emits:
socket.on('message:new:global', {
  roomId: "room-123",
  senderId: "user-456", 
  senderName: "John",
  timestamp: "2024-12-17T12:00:00.000Z"
  // Note: No message content for privacy
})
```

### 2. `message:deleted:global`
Broadcast to ALL connected sockets when a message is deleted.

```javascript
// Backend emits:
socket.on('message:deleted:global', {
  roomId: "room-123",
  messageId: "msg-789",
  deletedBy: "user-456"
})
```

## iOS Implementation

### 1. Update SocketManager Global Listeners

```swift
private func setupGlobalListeners() {
    // Listen for global message events
    socket.on("message:new:global") { [weak self] data, _ in
        guard let payload = data[0] as? [String: Any],
              let roomId = payload["roomId"] as? String,
              let senderId = payload["senderId"] as? String else { return }
        
        // Skip if it's our own message
        if senderId == AuthManager.shared.currentUserId { return }
        
        print("🌐 [Global] New message in room: \(roomId)")
        
        // Update unread count for this room
        self?.incrementUnreadCount(for: roomId)
        
        // Post notification for MyRooms to update
        NotificationCenter.default.post(
            name: .globalMessageReceived,
            object: nil,
            userInfo: [
                "roomId": roomId,
                "senderId": senderId,
                "senderName": payload["senderName"] as? String ?? "Unknown"
            ]
        )
    }
    
    socket.on("message:deleted:global") { [weak self] data, _ in
        guard let payload = data[0] as? [String: Any],
              let roomId = payload["roomId"] as? String else { return }
        
        print("🌐 [Global] Message deleted in room: \(roomId)")
        
        // Decrement unread count for this room
        self?.decrementUnreadCount(for: roomId)
        
        // Post notification for MyRooms to update
        NotificationCenter.default.post(
            name: .globalMessageDeleted,
            object: nil,
            userInfo: ["roomId": roomId]
        )
    }
}
```

### 2. Room-Specific Events (Existing)
Continue using these when user is actively in a room:

```swift
// When in MessagesViewController
socket.on("message:new") { data, _ in
    // Full message data for display
}

socket.on("message:deleted") { data, _ in
    // Handle message removal from UI
}
```

## Architecture Benefits

1. **Scalability**: Users don't need to join all rooms on app launch
2. **Privacy**: Global events don't include message content
3. **Performance**: Minimal data sent globally
4. **Compatibility**: Existing room-specific events continue to work

## Testing the Implementation

1. **User A and B in same room**:
   - User A sends message
   - User B (in MyRooms) sees unread indicator immediately
   - User B (in room) sees full message

2. **Multiple rooms**:
   - User has 10 rooms
   - Messages in any room update indicators without joining

3. **Message deletion**:
   - Deleted messages properly decrement unread counts

## Migration Notes

- The backend emits BOTH events:
  - `message:new` → Room participants (existing)
  - `message:new:global` → Everyone (new)
- No breaking changes to existing functionality
- iOS can implement gradually:
  1. Add global listeners
  2. Test in MyRooms
  3. Remove any room auto-join logic

## Event Flow Diagram

```
User A sends message in Room X
            ↓
    Backend receives message
            ↓
    ┌───────┴───────┐
    ↓               ↓
message:new    message:new:global
(to Room X)     (to everyone)
    ↓               ↓
User B in      User C in MyRooms
Room X sees    sees indicator
full message   update
```