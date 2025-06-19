# iOS Messages Updated At Sorting Guide

## Overview
The backend now separates message activity from room content updates, allowing iOS to sort rooms by the most recent activity of either type.

## New Database Field

### `messagesUpdatedAt`
- **Type**: DateTime (nullable)
- **Purpose**: Tracks when messages were last sent or deleted in a room
- **Independent from**: `updatedAt` which tracks room content changes (elements, name, etc.)

## What Updates Each Timestamp

### `updatedAt` (existing) - Room content changes:
- Elements created, updated, or deleted
- Room name changed
- Room properties modified
- Does NOT change when messages are sent

### `messagesUpdatedAt` (new) - Message activity:
- New message sent
- Message deleted
- Does NOT change for element or room updates

## API Response Changes

### GET /api/rooms/my-rooms
```json
{
  "data": [{
    "id": "room-123",
    "name": "Design Team",
    "createdAt": "2024-12-01T10:00:00Z",
    "updatedAt": "2024-12-15T14:30:00Z",         // Last element/room change
    "messagesUpdatedAt": "2024-12-17T09:45:00Z", // Last message activity
    "elementCount": 45,
    "badges": {
      "messages": 3,
      "elements": 7
    },
    // ... other fields
  }]
}
```

## iOS Sorting Implementation

### Sort by Most Recent Activity

```swift
// Sort rooms by the most recent of either updatedAt or messagesUpdatedAt
let sortedRooms = rooms.sorted { room1, room2 in
    let room1Latest = max(
        room1.updatedAt, 
        room1.messagesUpdatedAt ?? room1.updatedAt
    )
    let room2Latest = max(
        room2.updatedAt,
        room2.messagesUpdatedAt ?? room2.updatedAt
    )
    
    return room1Latest > room2Latest  // Descending order
}
```

### Room Model Update

```swift
struct Room: Codable {
    let id: String
    let name: String
    let createdAt: Date
    let updatedAt: Date              // Room content updates
    let messagesUpdatedAt: Date?     // Message activity (new field)
    
    // Computed property for sorting
    var lastActivityDate: Date {
        if let messagesDate = messagesUpdatedAt {
            return max(updatedAt, messagesDate)
        }
        return updatedAt
    }
    
    // Helper for UI display
    var lastActivityType: ActivityType {
        guard let messagesDate = messagesUpdatedAt else {
            return .roomUpdate
        }
        return messagesDate > updatedAt ? .message : .roomUpdate
    }
}

enum ActivityType {
    case message
    case roomUpdate
}
```

### MyRooms View Implementation

```swift
class MyRoomsViewController {
    func sortRooms() {
        rooms.sort { $0.lastActivityDate > $1.lastActivityDate }
        tableView.reloadData()
    }
    
    func configureCell(_ cell: RoomCell, with room: Room) {
        cell.nameLabel.text = room.name
        
        // Show last activity time
        let formatter = RelativeDateTimeFormatter()
        cell.lastActivityLabel.text = formatter.localizedString(
            for: room.lastActivityDate,
            relativeTo: Date()
        )
        
        // Optional: Show activity type indicator
        if room.lastActivityType == .message {
            cell.activityIcon.image = UIImage(systemName: "message.fill")
        } else {
            cell.activityIcon.image = UIImage(systemName: "square.and.pencil")
        }
    }
}
```

## Backend Behavior

### When Messages Are Sent/Deleted
- Updates `messagesUpdatedAt` to current timestamp
- Does NOT touch `updatedAt`
- Broadcasts `message:new:global` or `message:deleted:global`

### When Elements Are Created/Updated/Deleted
- Updates `updatedAt` automatically (Prisma @updatedAt)
- Does NOT touch `messagesUpdatedAt`
- Broadcasts `element:created:global`, etc.

### When Room Name Changes
- Updates `updatedAt` automatically
- Does NOT touch `messagesUpdatedAt`

## Benefits

1. **Accurate Activity Tracking**: Know exactly what type of activity happened last
2. **Better UX**: Users see rooms with recent messages at the top, even if elements haven't changed
3. **Flexible Sorting**: iOS can implement different sort options:
   - By any activity (default)
   - By messages only
   - By content changes only
4. **Performance**: No need to query messages table to determine last activity

## Migration Notes

- Existing rooms will have `messagesUpdatedAt` as `null` initially
- First message sent after deployment will set the timestamp
- iOS should handle null values by falling back to `updatedAt`

## Example Timeline

```
Timeline:
10:00 - Room created (updatedAt: 10:00, messagesUpdatedAt: null)
10:30 - Element added (updatedAt: 10:30, messagesUpdatedAt: null)
11:00 - Message sent (updatedAt: 10:30, messagesUpdatedAt: 11:00) ← Most recent
11:15 - Element added (updatedAt: 11:15, messagesUpdatedAt: 11:00)
11:30 - Message sent (updatedAt: 11:15, messagesUpdatedAt: 11:30) ← Most recent
```

Room appears at top of list because messagesUpdatedAt (11:30) is the most recent activity.