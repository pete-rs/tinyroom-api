# Participant Management API

## Overview
Room creators can dynamically manage participants after room creation. Only the user who created the room has permission to add or remove participants.

## Endpoints

### Add Participants
`POST /api/rooms/:id/participants`

Adds one or more users to an existing room. Only the room creator can perform this action.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "participantIds": ["user-id-1", "user-id-2", "user-id-3"]
}
```

**Response:**
```json
{
  "data": {
    "room": {
      "id": "room-id",
      "name": "Room Name",
      "participants": [
        {
          "userId": "creator-id",
          "user": { ... },
          "color": "#FF5733",
          "isActive": true
        },
        {
          "userId": "user-id-1",
          "user": { ... },
          "color": "#33FF57",
          "isActive": true
        }
      ]
    },
    "addedCount": 2,
    "message": "Successfully added 2 participant(s)"
  }
}
```

**Behavior:**
- Validates all user IDs exist in the system
- Skips users who are already active participants
- Reactivates users who previously left (were marked inactive)
- Assigns unique colors to new participants
- Updates room timestamp

**Errors:**
- `401 UNAUTHORIZED` - User not authenticated
- `403 FORBIDDEN` - Only room creator can add participants
- `404 ROOM_NOT_FOUND` - Room doesn't exist
- `404 USER_NOT_FOUND` - One or more user IDs don't exist
- `400 INVALID_REQUEST` - Invalid input or all users already participants

### Remove Participants
`DELETE /api/rooms/:id/participants`

Removes one or more participants from a room. Only the room creator can perform this action.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "participantIds": ["user-id-1", "user-id-2"]
}
```

**Response:**
```json
{
  "data": {
    "room": {
      "id": "room-id",
      "name": "Room Name",
      "participants": [
        {
          "userId": "creator-id",
          "user": { ... },
          "color": "#FF5733",
          "isActive": true
        }
      ]
    },
    "removedCount": 2,
    "message": "Successfully removed 2 participant(s)"
  }
}
```

**Behavior:**
- Soft deletes participants (marks as inactive with `leftAt` timestamp)
- Cannot remove the room creator
- Only removes users who are active participants
- Updates room timestamp
- Removed users can be re-added later

**Errors:**
- `401 UNAUTHORIZED` - User not authenticated
- `403 FORBIDDEN` - Only room creator can remove participants
- `404 ROOM_NOT_FOUND` - Room doesn't exist
- `400 INVALID_REQUEST` - Invalid input, trying to remove creator, or no valid participants

## Usage Examples

### Adding Multiple Participants
```bash
curl -X POST https://api.example.com/api/rooms/room-123/participants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "participantIds": ["user-456", "user-789", "user-012"]
  }'
```

### Removing a Single Participant
```bash
curl -X DELETE https://api.example.com/api/rooms/room-123/participants \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "participantIds": ["user-456"]
  }'
```

## Notes

1. **Creator Permissions**: Only the user who created the room can manage participants
2. **Soft Delete**: Removed participants are marked inactive but not deleted from database
3. **Reactivation**: Previously removed participants can be added back
4. **Color Assignment**: New participants receive unique colors that don't conflict with existing ones
5. **Real-time Updates**: Consider implementing socket events for participant changes
6. **Notifications**: Consider sending push notifications when participants are added/removed