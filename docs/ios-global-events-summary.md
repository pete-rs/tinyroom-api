# iOS Global Events Summary - Complete Guide

## Overview
The backend now broadcasts both message and element events globally to support real-time indicators in MyRooms without requiring users to join all rooms.

## Architecture

### Dual Event System
For each action, the backend emits TWO events:
1. **Room-specific event** - Full data to users in the room (existing)
2. **Global event** - Minimal data to ALL connected users (new)

## Global Events Reference

### Message Events

#### `message:new:global`
```javascript
socket.on('message:new:global', {
  roomId: "room-123",
  senderId: "user-456",
  senderName: "John",
  timestamp: "2024-12-17T12:00:00.000Z"
})
```

#### `message:deleted:global`
```javascript
socket.on('message:deleted:global', {
  roomId: "room-123",
  messageId: "msg-789",
  deletedBy: "user-456"
})
```

### Element Events

#### `element:created:global`
```javascript
socket.on('element:created:global', {
  roomId: "room-456",
  elementId: "elem-123",
  createdBy: "user-789",
  type: "note"  // "note", "photo", "audio", etc.
})
```

#### `element:deleted:global`
```javascript
socket.on('element:deleted:global', {
  roomId: "room-456",
  elementId: "elem-123",
  deletedBy: "user-789"
})
```

#### `room:cleared:global`
```javascript
socket.on('room:cleared:global', {
  roomId: "room-456",
  clearedBy: "user-789"
})
```

## iOS Implementation Pattern

### 1. Global Socket Listener Setup

```swift
class SocketManager {
    // Set up global listeners on socket connection
    private func setupGlobalListeners() {
        // Message events
        socket.on("message:new:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String,
                  let senderId = payload["senderId"] as? String else { return }
            
            // Skip own messages
            if senderId == AuthManager.shared.currentUserId { return }
            
            // Update unread count
            MessageCountManager.shared.incrementUnreadCount(for: roomId)
        }
        
        socket.on("message:deleted:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String else { return }
            
            MessageCountManager.shared.decrementUnreadCount(for: roomId)
        }
        
        // Element events
        socket.on("element:created:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String,
                  let createdBy = payload["createdBy"] as? String else { return }
            
            let isUnseen = createdBy != AuthManager.shared.currentUserId
            ElementCountManager.shared.incrementCount(for: roomId, isUnseen: isUnseen)
        }
        
        socket.on("element:deleted:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String else { return }
            
            ElementCountManager.shared.decrementCount(for: roomId)
        }
        
        socket.on("room:cleared:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String else { return }
            
            ElementCountManager.shared.clearCount(for: roomId)
        }
    }
}
```

### 2. MyRooms Integration

```swift
class MyRoomsViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        
        // Listen for count updates
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleCountUpdate),
            name: .roomCountsChanged,
            object: nil
        )
    }
    
    @objc private func handleCountUpdate(_ notification: Notification) {
        guard let roomId = notification.userInfo?["roomId"] as? String,
              let index = rooms.firstIndex(where: { $0.id == roomId }) else { return }
        
        // Update specific cell efficiently
        let indexPath = IndexPath(row: index, section: 0)
        if let cell = tableView.cellForRow(at: indexPath) as? RoomCell {
            cell.updateBadges()
        }
    }
}
```

## Benefits

1. **Scalability**: No need to join all rooms on app launch
2. **Privacy**: Global events contain minimal data
3. **Performance**: Small payload size for global broadcasts
4. **Real-time**: Instant updates across all screens
5. **Compatibility**: Existing room events continue to work

## Testing Checklist

- [ ] User A sends message → User B in MyRooms sees indicator
- [ ] User A creates element → User B in MyRooms sees count update
- [ ] User A deletes element → Count decrements properly
- [ ] User A clears room → All elements count goes to 0
- [ ] Multiple rapid updates → UI remains responsive
- [ ] Socket disconnect/reconnect → Counts remain accurate
- [ ] Own actions don't increment unseen counts

## Migration Path

1. **Phase 1**: Add global listeners alongside existing code
2. **Phase 2**: Test in MyRooms view
3. **Phase 3**: Remove any room auto-join logic
4. **Phase 4**: Optimize UI updates for performance

## Event Flow Comparison

### Before (Room-join required)
```
User must join room → Receive events → Update UI
```

### After (Global events)
```
User connects → Receive global events → Update MyRooms indicators
User joins room → Receive detailed events → Show full content
```

## Important Notes

1. **Global events are additive** - They don't replace room events
2. **Filter own actions** - Check senderId/createdBy to avoid counting own items
3. **Privacy by design** - Global events never include message content
4. **Efficient updates** - Update only affected UI cells, not entire table