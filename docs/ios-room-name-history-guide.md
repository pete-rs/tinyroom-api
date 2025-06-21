# Room Name History - iOS Integration Guide

## Good News: We Already Track This!

The backend already provides complete information about who changed the room name and when. iOS just needs to use the existing fields.

## Available Fields

In every room response, you get:

```json
{
  "id": "room-123",
  "name": "Italian Vacation 2024",
  "updatedAt": "2024-01-20T15:30:00Z",  // When room was last modified
  
  // WHO changed the name:
  "nameSetBy": "user-456",              // User ID (can be null)
  "nameSetByUser": {                    // Full user details
    "id": "user-456",
    "username": "johndoe",
    "firstName": "John",
    "avatarUrl": "https://..."
  }
}
```

## Important Notes

1. **`nameSetBy` can be null** - This means the room still has its original system-generated name (usually the creation date/time)

2. **`nameSetByUser` will be null when `nameSetBy` is null**

3. **`updatedAt` reflects ANY room update** (elements, participants, etc.), not just name changes

## iOS Implementation

### 1. Update Room Model

```swift
struct Room: Codable {
    // ... existing fields ...
    
    // Add these fields:
    let nameSetBy: String?          // User ID who set the name
    let nameSetByUser: User?        // Full user details
}

struct User: Codable {
    let id: String
    let username: String
    let firstName: String
    let avatarUrl: String?
}
```

### 2. Display Name History

```swift
// In room info/settings screen
if let nameSetByUser = room.nameSetByUser {
    // Show who changed the name
    nameHistoryLabel.text = "Named by \(nameSetByUser.firstName)"
    avatarImageView.load(url: nameSetByUser.avatarUrl)
    
    // You could also show when (using updatedAt)
    let formatter = RelativeDateTimeFormatter()
    timeLabel.text = formatter.localizedString(for: room.updatedAt, relativeTo: Date())
} else {
    // System-generated name, never changed by a user
    nameHistoryLabel.text = "System generated name"
}
```

### 3. Example UI Displays

**Scenario 1: User-set name**
```
Room: "Italian Vacation 2024"
📝 Named by John 3 days ago
```

**Scenario 2: System-generated name**
```
Room: "Dec 17, 2024 at 3:30 PM"
🤖 System generated name
```

### 4. In Room List (Optional)

You could show a small indicator for rooms with custom names:

```swift
// In MyRoomsCell
if room.nameSetBy != nil {
    customNameIndicator.isHidden = false  // Show a pencil icon or similar
}
```

## API Endpoints That Include This Data

All of these already return `nameSetBy` and `nameSetByUser`:

- `GET /api/rooms/my-rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms` (create response)
- `PUT /api/rooms/:id/name` (update response)

## Real-time Updates

When someone changes a room name, all participants receive:

```javascript
socket.on('room:updated', {
  room: {
    // Full room object including nameSetBy and nameSetByUser
  }
})
```

## Testing

1. Create a new room → `nameSetBy` will be null
2. Change the room name → `nameSetBy` and `nameSetByUser` will be populated
3. Check room details → Should show who changed the name

## No Backend Changes Needed!

The backend already tracks and provides all this information. iOS just needs to:
1. Add the fields to their Room model
2. Display the information in the UI

The data has been there all along! 🎉