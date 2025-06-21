# Room Creator Field - iOS Troubleshooting Guide

## Issue: Creator field appears null

The backend is correctly populating the creator field. Here's how to debug and use it properly.

## Quick Summary

Both endpoints now return full creator data:
- `GET /api/rooms/:id` - Returns `creator` object with full user details
- `GET /api/rooms/my-rooms` - Returns `creator` object with full user details (recently added!)

The backend has debug logging enabled that will show:
```
👤 [GET ROOM room-123] Creator info: {
  createdBy: "user-456",
  creatorExists: true,
  creatorData: { id: "user-456", username: "johndoe", ... }
}
```

Check your server logs to see what's actually being returned.

## What the Backend Returns

### 1. For `GET /api/rooms/:id` - Full room details:

```json
{
  "data": {
    "id": "room-123",
    "name": "Design Team",
    "createdBy": "user-456",      // User ID of creator
    "creator": {                   // Full creator details
      "id": "user-456",
      "username": "johndoe",
      "firstName": "John",
      "email": "john@example.com",
      "avatarUrl": "https://..."
    },
    "participants": [
      {
        "userId": "user-456",
        "user": {
          "id": "user-456",
          "username": "johndoe",
          "firstName": "John",
          "email": "john@example.com",
          "avatarUrl": "https://..."
        },
        "color": "#FF6B6B",
        "isActive": true
      },
      {
        "userId": "user-789",
        "user": {
          "id": "user-789",
          "username": "janedoe",
          "firstName": "Jane",
          "email": "jane@example.com",
          "avatarUrl": "https://..."
        },
        "color": "#4ECDC4",
        "isActive": true
      }
    ],
    // ... other fields
  }
}
```

### 2. For `GET /api/rooms/my-rooms` - Room list:

```json
{
  "data": [
    {
      "id": "room-123",
      "name": "Design Team",
      "createdBy": "user-456",      // User ID of creator
      "creator": {                   // Full creator details (NEW!)
        "id": "user-456",
        "username": "johndoe",
        "firstName": "John",
        "email": "john@example.com",
        "avatarUrl": "https://..."
      },
      "isCreator": true,            // Is current user the creator?
      "participants": [             // Other participants (excludes current user)
        {
          "id": "user-789",
          "username": "janedoe",
          "firstName": "Jane",
          "avatarUrl": "https://...",
          "color": "#4ECDC4",
          "isActive": true
        }
      ],
      // ... other fields
    }
  ]
}
```

**Note**: In My Rooms response, the `participants` array only includes OTHER participants (not the current user) for efficiency.

## Debug Steps

### 1. Check Raw Response

First, log the raw JSON response to see what you're actually receiving:

```swift
// Log the raw response
if let data = responseData,
   let json = try? JSONSerialization.jsonObject(with: data) {
    print("Raw room response: \(json)")
}
```

### 2. Check Your Room Model

Make sure your Room model includes the creator fields:

```swift
struct Room: Codable {
    let id: String
    let name: String
    let createdBy: String          // User ID
    let creator: User?             // Full user object
    let createdAt: Date
    let updatedAt: Date
    let isPublic: Bool
    let participants: [RoomParticipant]
    // ... other fields
}

struct User: Codable {
    let id: String
    let username: String
    let firstName: String
    let email: String
    let avatarUrl: String?
}
```

### 3. Debug Logging Added

The backend now logs creator information for every room request:

```
👤 [GET ROOM room-123] Creator info: {
  createdBy: "user-456",
  creatorExists: true,
  creatorData: { id: "user-456", username: "johndoe", ... },
  participantCount: 2,
  participants: [
    { userId: "user-456", username: "johndoe", isCreator: true },
    { userId: "user-789", username: "janedoe", isCreator: false }
  ]
}
```

Check your server logs to see what's being returned.

## Building the Collaborators List

### For GET /api/rooms/:id (Full room details)

```swift
extension Room {
    // Get all collaborators (creator + all participants)
    var collaborators: [User] {
        return participants.compactMap { $0.user }
    }
    
    // Check if a user is the creator
    func isCreator(userId: String) -> Bool {
        return createdBy == userId
    }
}

// Display collaborators with creator indicator
func displayCollaborators() {
    for participant in room.participants {
        let user = participant.user
        let isCreator = participant.userId == room.createdBy
        
        // Show user with creator badge if applicable
        if isCreator {
            print("\(user.firstName) (Creator)")
        } else {
            print(user.firstName)
        }
    }
}
```

### For GET /api/rooms/my-rooms (Room list)

```swift
extension MyRoomResponse {
    // Get all collaborators including yourself
    var allCollaborators: [User] {
        var users: [User] = []
        
        // Add creator (could be you or someone else)
        if let creator = creator {
            users.append(creator)
        }
        
        // Add other participants
        users.append(contentsOf: participants)
        
        // Remove duplicates if creator is also in participants
        return users.uniqued(by: { $0.id })
    }
    
    // Alternative: Build from current user + participants
    func getAllCollaborators(currentUser: User) -> [User] {
        if isCreator {
            // You're the creator, so add yourself + participants
            return [currentUser] + participants
        } else {
            // Someone else is creator, they should be in the creator field
            var users: [User] = []
            if let creator = creator {
                users.append(creator)
            }
            users.append(contentsOf: participants)
            return users
        }
    }
}
```

## Common Issues

### 1. Creator field is null but createdBy has value

This suggests the User relation isn't being loaded. The backend should always include this, but you can use `createdBy` to find the creator in the participants list:

```swift
let creator = room.participants.first { $0.userId == room.createdBy }?.user
```

### 2. Decoding errors

If the creator field isn't decoding properly, check for:
- Mismatched property names (should be `creator`, not `createdBy` for the full object)
- Missing CodingKeys if using custom names
- Optional vs non-optional mismatches

### 3. Using My Rooms endpoint

**UPDATE**: The `/api/rooms/my-rooms` endpoint NOW includes the full creator object! It was recently updated to include:
- `creator`: Full user object with id, username, firstName, email, avatarUrl
- `isCreator`: Boolean indicating if current user is the creator
- `participants`: Array of OTHER participants (excludes current user)

```swift
// In MyRooms response
if room.isCreator {
    // Current user is the creator
    print("You created this room")
} else {
    // Someone else created it, check room.creator
    if let creator = room.creator {
        print("Created by \(creator.firstName)")
    }
}
```

## Test with cURL

Test the endpoint directly to verify the response:

```bash
curl -X GET http://localhost:3000/api/rooms/ROOM_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  | jq '.data.creator'
```

This should show the creator object if it exists in the response.

## Next Steps

1. Check the raw JSON response to see if `creator` is present
2. Verify your Room model includes the `creator` field
3. Check server logs for the debug output
4. Use `createdBy` + participants as a fallback if needed

The backend is confirmed to be sending the creator data, so the issue is likely in the iOS parsing or model definition.