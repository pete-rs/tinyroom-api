# iOS Implementation Guide: Person-Based Room Navigation

## Overview

We've transitioned from a flat room list to a person-based navigation system. Rooms are now organized under the people you share them with, allowing multiple rooms between the same users.

## Key Changes

### 1. Room Model Updates

**Room Properties**:
- **Added**: `name: String?` - Optional room name
- **Added**: `updatedAt: Date` - Tracks last activity
- **Removed**: `isLocked: Bool` - Rooms are always accessible
- **Removed**: `lastActivity: Date` - Replaced by updatedAt

```swift
struct Room {
    let id: String
    let name: String?  // New: optional room name
    let createdBy: String
    let createdAt: Date
    let updatedAt: Date  // New: replaces lastActivity
    let isActive: Bool
    // isLocked removed - rooms always accessible
    let participants: [RoomParticipant]
    let elementCount: Int?
}
```

### 2. New API Endpoints

#### Get Users Without Rooms (for + button)
```
GET /api/users/without-rooms
Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "id": "user-uuid",
      "username": "johndoe",
      "firstName": "John",
      "email": "john@example.com"
    }
  ]
}
```

#### Get Rooms Grouped by Person (main navigation)
```
GET /api/rooms/grouped-by-person
Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "id": "user-uuid",
      "username": "johndoe",
      "firstName": "John",
      "email": "john@example.com",
      "rooms": [
        {
          "id": "room-uuid",
          "name": "Italian engagement 2025",  // null if unnamed
          "createdAt": "2024-01-01T00:00:00Z",
          "updatedAt": "2024-01-15T12:30:00Z",
          "isActive": false,
          "elementCount": 12
        },
        {
          "id": "room-uuid-2",
          "name": null,  // Unnamed room
          "createdAt": "2024-01-10T00:00:00Z",
          "updatedAt": "2024-01-10T15:45:00Z",
          "isActive": false,
          "elementCount": 3
        }
      ]
    }
  ]
}
```

#### Update Room Name
```
PUT /api/rooms/:roomId/name
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "name": "Italian engagement 2025"  // or "" to clear name
}

Response: Updated room object
```

### 3. UI/UX Implementation

#### Main List View
- Show list of people (not rooms)
- Each person shows their name/username
- Tap person → show all rooms with that person
- "+" button → show users WITHOUT existing rooms

#### Person → Rooms View
- Shows all rooms shared with selected person
- Rooms sorted by `updatedAt` (most recent first)
- Each room shows:
  - Room name (or "Unnamed room" placeholder)
  - Created date/time
  - Last updated date/time
  - Element count

#### Room View Updates
- Top-left: Room name (or "Name this room" placeholder)
- Below name: "User A & User B" in smaller text
- Tap name area → show text input alert to set/change name

### 4. Navigation Flow Example

```swift
// 1. Main screen - fetch people with rooms
APIClient.getRoomsGroupedByPerson { result in
    // Display list of people
}

// 2. Tap "+" button - fetch users without rooms
APIClient.getUsersWithoutRooms { result in
    // Show list of users to create room with
}

// 3. Select user to create room with
APIClient.createRoom(otherUserId: selectedUser.id) { result in
    // Navigate to new room
}

// 4. Tap person in main list
// Show rooms array from getRoomsGroupedByPerson response

// 5. In room view - update room name
APIClient.updateRoomName(roomId: room.id, name: newName) { result in
    // Update UI with new name
}
```

### 5. Important Implementation Notes

#### Room State Changes
- Remove ALL `isLocked` checks - rooms are always accessible
- Remove "room is locked" UI states
- Users can always enter and modify rooms

#### Socket.io Updates
- No changes to Socket.io events
- Still emit `room:join` when entering
- All element operations work the same

#### Sorting & Display
- Rooms within a person are sorted by `updatedAt` DESC
- Show relative times (e.g., "Updated 2 hours ago")
- `updatedAt` changes when:
  - Elements are added/modified/deleted
  - Room name is changed

### 6. Migration Checklist

- [ ] Update Room model - add `name`, `updatedAt`, remove `isLocked`
- [ ] Remove all locked room UI and logic
- [ ] Implement person list view (main screen)
- [ ] Implement person → rooms detail view
- [ ] Update room creation flow (always create new)
- [ ] Add room naming UI in room view
- [ ] Update "+" button to use `/api/users/without-rooms`
- [ ] Switch main navigation to `/api/rooms/grouped-by-person`
- [ ] Add room name update functionality

### 7. Example SwiftUI Implementation

```swift
// Main list showing people
struct PeopleListView: View {
    @State private var peopleWithRooms: [PersonWithRooms] = []
    
    var body: some View {
        List(peopleWithRooms) { person in
            NavigationLink(destination: PersonRoomsView(person: person)) {
                HStack {
                    Text(person.firstName ?? person.username)
                    Spacer()
                    Text("\(person.rooms.count) rooms")
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle("Rooms")
        .toolbar {
            Button(action: showUsersWithoutRooms) {
                Image(systemName: "plus")
            }
        }
    }
}

// Room list for a specific person
struct PersonRoomsView: View {
    let person: PersonWithRooms
    
    var body: some View {
        List(person.rooms) { room in
            NavigationLink(destination: RoomView(room: room)) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(room.name ?? "Unnamed room")
                        .font(.headline)
                    Text("Updated \(room.updatedAt.relativeTime)")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
        .navigationTitle(person.firstName ?? person.username)
    }
}
```

### 8. Error Handling

- Room is always accessible - remove "room locked" error handling
- No need to check room state before operations
- Simplify error messages

## Summary

The key change is thinking of rooms as conversations grouped by person, similar to messaging apps. Users can have multiple "conversations" (rooms) with the same person, each with its own optional name and content. This creates a more intuitive navigation structure and removes the complexity of room locking.