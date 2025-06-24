# iOS Integration Guide: Element Reactions

## Overview
This guide explains how to integrate the new element reactions feature into your iOS app. Users can double-tap elements to add/remove heart reactions.

## API Endpoints

### 1. Toggle Reaction (Add/Remove)
```
POST /api/rooms/:roomId/elements/:elementId/reactions/toggle
Authorization: Bearer <token>

Response:
{
  "data": {
    "action": "added" | "removed",
    "reaction": {
      "id": "reaction-uuid",
      "elementId": "element-uuid", 
      "userId": "user-uuid",
      "type": "heart",
      "createdAt": "2024-01-15T10:00:00Z",
      "user": {
        "id": "user-uuid",
        "username": "johndoe",
        "firstName": "John",
        "avatarUrl": "https://..."
      }
    },
    "elementStats": {
      "totalReactions": 5,
      "hasReacted": true,
      "topReactors": [
        {
          "id": "user-uuid",
          "username": "johndoe", 
          "firstName": "John",
          "avatarUrl": "https://..."
        }
        // ... up to 3 users
      ]
    }
  }
}
```

### 2. Get All Reactions (Optional)
```
GET /api/rooms/:roomId/elements/:elementId/reactions
Authorization: Bearer <token>

Response:
{
  "data": {
    "reactions": [...],
    "total": 15,
    "hasReacted": true
  }
}
```

## Socket.io Events

### Client Events (Send)
```swift
// Toggle reaction on double tap
socket.emit("element:reaction:toggle", [
    "roomId": roomId,
    "elementId": elementId
])
```

### Server Events (Listen)
```swift
// When someone adds a reaction
socket.on("element:reaction:added") { data in
    let elementId = data["elementId"] as? String
    let reaction = data["reaction"] as? [String: Any]
    let stats = data["stats"] as? [String: Any]
    
    // Update UI: show heart with avatars
}

// When someone removes a reaction
socket.on("element:reaction:removed") { data in
    let elementId = data["elementId"] as? String
    let userId = data["userId"] as? String
    let stats = data["stats"] as? [String: Any]
    
    // Update UI: update heart count/avatars
}
```

## Element Data Structure

When fetching rooms or joining a room, elements now include reaction data:

```json
{
  "id": "element-uuid",
  "type": "photo",
  // ... other fields ...
  "reactions": {
    "count": 5,
    "hasReacted": false,
    "userReaction": null,
    "topReactors": [
      {
        "id": "user-uuid",
        "username": "alice",
        "firstName": "Alice", 
        "avatarUrl": "https://..."
      }
      // ... up to 3 users
    ]
  }
}
```

## Important: Choose ONE approach

You should use EITHER Socket.io OR REST API for toggling reactions, not both:

### Option A: Socket.io Only (Recommended for real-time)
- Use `socket.emit("element:reaction:toggle")` 
- Server handles persistence and broadcasts to all users
- No need for separate API call

### Option B: REST API Only
- Use `POST /api/rooms/:roomId/elements/:elementId/reactions/toggle`
- Server handles persistence and emits socket events to other users
- Better for offline support

## Implementation Steps

### 1. Update Element Model
```swift
struct ElementReactions: Codable {
    let count: Int
    let hasReacted: Bool
    let userReaction: String?
    let topReactors: [User]
}

struct Element: Codable {
    // ... existing fields ...
    let reactions: ElementReactions?
}
```

### 2. Add Double Tap Gesture
```swift
let doubleTap = UITapGestureRecognizer(target: self, action: #selector(handleDoubleTap))
doubleTap.numberOfTapsRequired = 2
elementView.addGestureRecognizer(doubleTap)

@objc func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
    socket.emit("element:reaction:toggle", [
        "roomId": currentRoomId,
        "elementId": element.id
    ])
    
    // Optimistic UI update
    updateReactionUI(animated: true)
}
```

### 3. Display Reactions UI
```swift
func updateReactionUI(for element: Element) {
    guard let reactions = element.reactions else { return }
    
    if reactions.count == 0 {
        // Hide reaction UI
        reactionContainer.isHidden = true
        return
    }
    
    reactionContainer.isHidden = false
    
    // Show heart icon
    heartIcon.image = reactions.hasReacted ? 
        UIImage(named: "heart-filled") : 
        UIImage(named: "heart-outline")
    
    // Show avatars (up to 3)
    avatarStack.arrangedSubviews.forEach { $0.removeFromSuperview() }
    
    for (index, reactor) in reactions.topReactors.prefix(3).enumerated() {
        let avatarView = UIImageView()
        avatarView.setImage(from: reactor.avatarUrl)
        avatarView.layer.cornerRadius = 12
        avatarView.clipsToBounds = true
        avatarStack.addArrangedSubview(avatarView)
    }
    
    // Show count if more than 3
    if reactions.count > 3 {
        countLabel.text = "+\(reactions.count - 3)"
        countLabel.isHidden = false
    } else {
        countLabel.isHidden = true
    }
}
```

### 4. Handle Socket Events
```swift
// In your socket setup
socket.on("element:reaction:added") { data, _ in
    guard let elementId = data[0]["elementId"] as? String,
          let stats = data[0]["stats"] as? [String: Any] else { return }
    
    // Update the element in your local data
    if let element = self.findElement(by: elementId) {
        element.updateReactions(from: stats)
        self.updateReactionUI(for: element)
    }
}

socket.on("element:reaction:removed") { data, _ in
    guard let elementId = data[0]["elementId"] as? String,
          let stats = data[0]["stats"] as? [String: Any] else { return }
    
    // Update the element in your local data
    if let element = self.findElement(by: elementId) {
        element.updateReactions(from: stats)
        self.updateReactionUI(for: element)
    }
}
```

### 5. Handle Push Notifications
```swift
func handleNotification(_ userInfo: [String: Any]) {
    guard let type = userInfo["type"] as? String else { return }
    
    switch type {
    case "element_reaction":
        if let roomId = userInfo["roomId"] as? String {
            // Navigate to the room
            navigateToRoom(roomId)
        }
    default:
        break
    }
}
```

## Best Practices

1. **Optimistic Updates**: Update UI immediately on double tap, then sync with server response
2. **Debouncing**: Prevent rapid double taps from sending multiple requests
3. **Caching**: Cache reaction data to reduce API calls
4. **Animation**: Add heart animation when reactions are added/removed
5. **Accessibility**: Ensure double tap is accessible with VoiceOver

## Testing

1. Test reaction toggle on various element types (photos, notes, audio)
2. Test with poor network conditions
3. Test with multiple users reacting simultaneously
4. Verify push notifications are received
5. Test reaction count updates in real-time

## Migration Notes

- Existing elements will have `reactions: null` until first reaction
- The `reactions` field is included in all element responses
- Socket events for reactions are separate from element updates