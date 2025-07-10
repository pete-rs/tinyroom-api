# Notification Socket Events - iOS Implementation Guide

## Overview
This document describes the Socket.IO events for real-time notification count updates, eliminating the need for polling the `/api/notifications/unread-count` endpoint.

## Socket Connection
Ensure your socket connection includes authentication:
```swift
let manager = SocketManager(socketURL: URL(string: "https://your-api-url")!, 
                           config: [.log(true), .compress])
let socket = manager.defaultSocket

// Add auth token
manager.config = SocketIOClientConfiguration([
    .connectParams(["auth": ["token": "Bearer \(authToken)"]])
])
```

## Socket Events

### Receiving Unread Count Updates

**Event:** `notification:unread-count`

The server emits this event whenever the notification count changes for a user:

```swift
socket.on("notification:unread-count") { data, ack in
    guard let response = data[0] as? [String: Any],
          let unreadCount = response["unreadCount"] as? Int else {
        return
    }
    
    // Update badge on main thread
    DispatchQueue.main.async {
        self.updateNotificationBadge(count: unreadCount)
    }
}
```

**Event Data:**
```json
{
  "unreadCount": 5
}
```

### When Events Are Emitted

The server automatically emits `notification:unread-count` when:

1. **New notification created** - Count increases
2. **Notifications marked as read** - Count decreases
3. **All notifications marked as read** - Count becomes 0

## Migration Strategy

### Current Implementation (Remove This)
```swift
// MainTabBarController.swift
private var notificationTimer: Timer?

private func startNotificationPolling() {
    notificationTimer = Timer.scheduledTimer(withTimeInterval: 30.0, repeats: true) { _ in
        self.fetchUnreadNotificationCount()
    }
}

private func fetchUnreadNotificationCount() {
    // API call to /api/notifications/unread-count
}
```

### New Implementation (Add This)
```swift
// MainTabBarController.swift
override func viewDidLoad() {
    super.viewDidLoad()
    
    // Set up socket listener for notification updates
    setupNotificationSocketListener()
    
    // Fetch initial count once
    fetchUnreadNotificationCount()
}

private func setupNotificationSocketListener() {
    SocketManager.shared.socket.on("notification:unread-count") { [weak self] data, _ in
        guard let self = self,
              let response = data[0] as? [String: Any],
              let unreadCount = response["unreadCount"] as? Int else {
            return
        }
        
        DispatchQueue.main.async {
            self.updateNotificationBadge(count: unreadCount)
        }
    }
}

deinit {
    // Remove socket listener
    SocketManager.shared.socket.off("notification:unread-count")
}
```

## Benefits

1. **Real-time Updates** - Badge updates immediately when notifications arrive
2. **Battery Efficient** - No polling every 30 seconds
3. **Reduced Server Load** - No unnecessary API calls
4. **Better UX** - Users see updates instantly

## Fallback Strategy

Keep minimal polling for edge cases:
```swift
// Only poll when returning to foreground after being backgrounded for >5 minutes
func applicationDidBecomeActive() {
    let lastBackgroundTime = UserDefaults.standard.object(forKey: "lastBackgroundTime") as? Date ?? Date()
    let timeSinceBackground = Date().timeIntervalSince(lastBackgroundTime)
    
    if timeSinceBackground > 300 { // 5 minutes
        fetchUnreadNotificationCount()
    }
}
```

## Testing

1. **Connect to Socket** - Verify authentication works
2. **Create Notification** - Check if count event is received
3. **Mark as Read** - Verify count decreases
4. **Multiple Devices** - Test with same user on multiple devices
5. **Disconnect/Reconnect** - Ensure events resume after reconnection

## Error Handling

```swift
// Handle socket connection errors
socket.on(clientEvent: .error) { data, _ in
    print("Socket error: \(data)")
    // Fall back to polling temporarily
    self.startTemporaryPolling()
}

// Handle disconnection
socket.on(clientEvent: .disconnect) { data, _ in
    print("Socket disconnected")
    // You might want to show offline indicator
}
```

## Debug Logging

The server logs all notification count emissions:
```
🔔 [SOCKET] Emitted unread count (5) to user userId
🔔 [SOCKET] Notification data: { "unreadCount": 5 }
```

## Notes

- Each user can only have one active socket connection
- If user has multiple devices, only the most recent connection receives events
- Consider implementing device-specific connections in the future if needed