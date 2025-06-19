# iOS Migration Guide: My Rooms Refactor

## Overview
Major refactor to change the app flow from person-based navigation to room-based navigation with required room names and multi-participant support.

## Breaking Changes ⚠️

### 1. Room Creation API Changed
**Old**: Create room with single participant
```
POST /api/rooms
{
  "otherUserId": "user-id"
}
```

**New**: Create room with name and multiple participants
```
POST /api/rooms
{
  "name": "Italian Vacation Planning", // REQUIRED
  "participantIds": ["user-id-1", "user-id-2", "user-id-3"] // Array, creator NOT included
}
```

**Key Changes**:
- `name` is now REQUIRED (no longer optional)
- `participantIds` is an array (can have 1 or more participants)
- Creator should NOT be included in `participantIds`
- Room is created immediately with the name (no separate naming step)

### 2. Database Schema Changes
- `Room.name` is now required (not nullable)
- Added `RoomParticipant.lastVisitedAt` to track when users last visited rooms
- All existing data has been purged

## New API Endpoints

### 1. Get My Rooms (Primary Navigation)
```
GET /api/rooms/my-rooms

Response:
{
  "data": [
    {
      "id": "room-uuid",
      "name": "Italian Vacation Planning",
      "createdAt": "2025-06-14T...",
      "updatedAt": "2025-06-14T...",
      "participants": [
        {
          "id": "user-id",
          "username": "john_doe",
          "firstName": "John",
          "avatarUrl": "https://...", // or null
          "color": "#FF6B6B" // Their touch color in this room
        }
      ],
      "elementCount": 15, // Total elements in room
      "unreadCount": 3, // Elements added since last visit
      "hasUnread": true, // Quick boolean check
      "lastVisitedAt": "2025-06-14T..." // When current user last visited
    }
  ]
}
```

**Notes**:
- Rooms are sorted by `updatedAt` (most recent first)
- `participants` excludes the current user
- `unreadCount` only counts elements created by others after your last visit
- `hasUnread` is a convenience boolean for showing indicators

### 2. Get All Users (Unchanged)
```
GET /api/users/all

Response: Same as before
```

Use this when creating a room to show the user picker.

## Updated Room Flow

### Old Flow
1. Tap person → See rooms with that person
2. Create room (no name required)
3. Optionally set room name later

### New Flow
1. See "My Rooms" list with all rooms
2. Tap "Create New Room"
3. Select participants (multi-select)
4. Enter room name (required)
5. Create room

## Implementation Guide

### 1. Update Room Model
```swift
struct Room: Codable {
    let id: String
    let name: String // No longer optional!
    let createdAt: Date
    let updatedAt: Date
    let participants: [Participant]
    let elementCount: Int
    let unreadCount: Int
    let hasUnread: Bool
    let lastVisitedAt: Date
}

struct Participant: Codable {
    let id: String
    let username: String
    let firstName: String
    let avatarUrl: String?
    let color: String
}
```

### 2. Update Room Creation
```swift
struct CreateRoomRequest: Codable {
    let name: String
    let participantIds: [String]
}

func createRoom(name: String, participantIds: [String], completion: @escaping (Result<Room, Error>) -> Void) {
    let request = CreateRoomRequest(name: name, participantIds: participantIds)
    // POST to /api/rooms with new structure
}
```

### 3. My Rooms View Controller
```swift
class MyRoomsViewController: UIViewController {
    func loadMyRooms() {
        APIClient.shared.getMyRooms { result in
            switch result {
            case .success(let rooms):
                self.updateUI(with: rooms)
            case .failure(let error):
                // Handle error
            }
        }
    }
    
    func configureCell(for room: Room) {
        cell.nameLabel.text = room.name
        cell.participantsLabel.text = room.participants.map { $0.firstName }.joined(separator: ", ")
        cell.timestampLabel.text = formatRelativeTime(room.updatedAt)
        cell.elementCountLabel.text = "\(room.elementCount) items"
        
        // Show unread indicator
        cell.unreadIndicator.isHidden = !room.hasUnread
        if room.hasUnread {
            cell.unreadCountLabel.text = "\(room.unreadCount)"
        }
        
        // Snapshot
        // Snapshots removed - show placeholder or room initials
        cell.snapshotImageView.backgroundColor = .systemGray6
    }
}
```

### 4. Create Room Flow
```swift
class CreateRoomViewController: UIViewController {
    var selectedParticipants: [User] = []
    
    // Step 1: User picker (multi-select)
    func showUserPicker() {
        // Allow multiple selection
        // Ensure at least 1 participant selected
    }
    
    // Step 2: Name entry
    func showNameEntry() {
        // Required field
        // Show keyboard immediately
        // Validate non-empty
    }
    
    // Step 3: Create room
    func createRoom() {
        let participantIds = selectedParticipants.map { $0.id }
        
        APIClient.shared.createRoom(
            name: roomNameField.text!,
            participantIds: participantIds
        ) { result in
            switch result {
            case .success(let room):
                // Navigate to room
                self.navigateToRoom(room)
            case .failure(let error):
                // Show error
            }
        }
    }
}
```

### 5. Update Last Visit Tracking
When entering a room, the backend automatically updates `lastVisitedAt` when you call:
```
POST /api/rooms/:roomId/join
```

This clears the unread indicator for that user.

## Visual Changes

### My Rooms List
- Show room name (always present now)
- Show participant names/avatars
- Show element count
- Show last updated time
- Show unread indicator (red dot with count)

### Create Room Modal
1. Full screen modal slides up
2. Navigation bar with "Cancel" and "Next"
3. User list with checkboxes (multi-select)
4. After selecting users, slide to name entry
5. Text field for room name (required)
6. "Create" button (disabled until name entered)

## Testing Checklist

- [ ] My Rooms loads and displays all rooms
- [ ] Unread indicators show correctly
- [ ] Unread indicators clear when entering room
- [ ] Create room with 1 participant works
- [ ] Create room with multiple participants works
- [ ] Room name is required (can't create without)
- [ ] Rooms sort by most recent activity
- [ ] Pull to refresh works on My Rooms
- [ ] Error handling for all edge cases

## Migration Steps

1. Update all API calls to new endpoints
2. Update Room model (name no longer optional)
3. Replace person-based navigation with My Rooms
4. Update room creation flow
5. Add unread indicator UI
6. Test thoroughly with fresh data

## Notes

- The `/api/rooms/grouped-by-person` endpoint still exists but is now legacy
- All existing room data has been deleted
- Room names cannot be null anymore
- Multi-participant rooms (3+ people) are now supported with proper color assignment