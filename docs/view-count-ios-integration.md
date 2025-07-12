# Room View Count - iOS Integration Guide

## Overview

This guide covers the integration of the new room view count feature. View counts track how many times a room has been entered/opened by users.

## Feature Behavior

### What counts as a view:
- When a user enters a room (calls the join room API)
- Each new session of entering the room increments the count
- Opening the room from the rooms list
- Rejoining after the app crashes or is terminated

### What does NOT count as a view:
- Navigating within the room
- Pushing/presenting other view controllers and returning
- Background/foreground app transitions while in the room
- Receiving real-time updates while already in the room

## API Changes

### 1. POST `/api/rooms/:id/join`

**Behavior Change:**
- Now increments the room's view count by 1 on each successful call
- Call this endpoint when the user enters/opens a room
- Do NOT call this when returning from a pushed view controller

**Response:** (unchanged)
```json
{
  "data": {
    "message": "Joined room successfully"
  }
}
```

### 2. GET `/api/rooms/:id`

**Response Changes:**
The room object now includes a `viewCount` field:

```json
{
  "data": {
    "id": "room-uuid",
    "name": "Room Name",
    "createdAt": "2025-01-12T...",
    "updatedAt": "2025-01-12T...",
    // ... other existing fields ...
    "reactionCount": 5,
    "commentCount": 12,
    "viewCount": 47,  // NEW FIELD
    "userReaction": {
      "hasReacted": true,
      "emoji": "❤️"
    },
    // ... rest of response ...
  }
}
```

### 3. GET `/api/rooms/my-rooms`

**Response Changes:**
Each room object in the array now includes `viewCount`:

```json
{
  "data": [
    {
      "id": "room-uuid",
      "name": "Room Name",
      "createdAt": "2025-01-12T...",
      // ... other existing fields ...
      "elementCount": 25,
      "unreadCount": 3,
      "hasUnread": true,
      "reactionCount": 5,
      "commentCount": 12,
      "viewCount": 47,  // NEW FIELD
      "userReaction": {
        "hasReacted": true,
        "emoji": "❤️"
      },
      // ... rest of room data ...
    }
  ]
}
```

## iOS Implementation Guidelines

### 1. Update Room Model

Add the view count property to your Room model:

```swift
struct Room: Codable {
    let id: String
    let name: String
    // ... existing properties ...
    let reactionCount: Int
    let commentCount: Int
    let viewCount: Int  // NEW PROPERTY
    // ... rest of properties ...
}
```

### 2. Joining Room Logic

Only call the join room endpoint when actually entering the room:

```swift
class RoomViewController: UIViewController {
    private var hasJoinedRoom = false
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        
        // Only join if we haven't already in this session
        if !hasJoinedRoom {
            joinRoom()
            hasJoinedRoom = true
        }
    }
    
    private func joinRoom() {
        // POST /api/rooms/{roomId}/join
        // This increments the view count
    }
    
    // When leaving the room completely
    private func leaveRoom() {
        hasJoinedRoom = false
        // Reset flag so next entry counts as a new view
    }
}
```

**⚠️ Common Issue: Double View Count**

If you notice view counts increasing by 2 instead of 1, check for:
- Multiple calls to joinRoom in your view lifecycle (e.g., both `viewDidLoad` and `viewDidAppear`)
- Race conditions where joinRoom is called before previous call completes
- Navigation logic that triggers joinRoom multiple times

**Recommended pattern to prevent double calls:**
```swift
private var isJoiningRoom = false

private func joinRoomIfNeeded() {
    guard !hasJoinedRoom && !isJoiningRoom else { return }
    
    isJoiningRoom = true
    
    apiClient.joinRoom(roomId: roomId) { [weak self] result in
        self?.isJoiningRoom = false
        self?.hasJoinedRoom = true
        // Handle result...
    }
}
```

### 3. Displaying View Count

You can now display view counts in your UI:

```swift
// In room list
cell.viewCountLabel.text = "\(room.viewCount) views"

// In room detail
roomDetailView.statsLabel.text = "\(room.viewCount) views • \(room.commentCount) comments"
```

### 4. Socket.io Events

**Note:** View counts are NOT updated via Socket.io events. The count only updates when someone joins the room via the REST API. To get the latest view count:
- Refresh the room data when returning to the rooms list
- Poll the room endpoint periodically if needed
- The view count in the room detail view will be current as of when the user entered

## Best Practices

1. **Cache Management**: Update your cached room objects with the new viewCount field
2. **Offline Support**: View counts should be treated as read-only data
3. **UI Updates**: Consider using number formatting for large view counts (e.g., "1.2K views")
4. **Performance**: The view count increment happens server-side; there's no additional client work needed

## Migration Notes

- Existing rooms will have a `viewCount` of 0 initially
- The field is always present in API responses (not nullable)
- No breaking changes - the field is additive only

## Testing

1. Enter a room and verify the view count increments
2. Navigate away and back within the room - count should NOT increment
3. Leave the room completely and re-enter - count SHOULD increment
4. Verify view counts display correctly in room lists and detail views