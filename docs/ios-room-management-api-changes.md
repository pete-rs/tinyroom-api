# iOS Room Management API Changes

## Overview
Two new endpoints have been added for room management: Delete Room (creator only) and Permanently Leave Room (non-creators only).

## New API Endpoints

### 1. Delete Room (Creator Only)
**Endpoint**: `DELETE /api/rooms/:roomId`

**Authorization**: Requires authentication token

**Permissions**: Only the room creator can delete a room

**What it does**:
- Permanently deletes the room and all associated data
- Deletes all elements in the room
- Removes all participants
- Sends push notifications to all participants (except creator)

**Response**:
```json
{
  "data": {
    "message": "Room deleted successfully",
    "roomId": "room-uuid"
  }
}
```

**Error Cases**:
- `403 FORBIDDEN`: If the user is not the room creator
- `404 NOT_FOUND`: If the room doesn't exist

**Push Notification**:
All participants (except creator) receive:
- Title: "Room Deleted"
- Message: "{creatorName} deleted the room \"{roomName}\""
- Data: `{ type: "room_deleted", roomName: "..." }`

### 2. Permanently Leave Room (Non-Creator Only)
**Endpoint**: `DELETE /api/rooms/:roomId/leave`

**Authorization**: Requires authentication token

**Permissions**: Only non-creator participants can leave

**What it does**:
- Permanently removes the user from the room
- User will no longer see the room in their "My Rooms" list
- Room creator receives a push notification

**Response**:
```json
{
  "data": {
    "message": "Successfully left the room",
    "roomId": "room-uuid"
  }
}
```

**Error Cases**:
- `403 FORBIDDEN`: If the user is the room creator (creators must delete, not leave)
- `404 NOT_FOUND`: If the room doesn't exist or user is not a participant

**Push Notification**:
Room creator receives:
- Title: "Participant Left"
- Message: "{participantName} left the room \"{roomName}\""
- Data: `{ type: "participant_left", roomName: "...", participantName: "..." }`

## Updated Room Response Format

The `/api/rooms/my-rooms` endpoint now includes two new fields:

```json
{
  "data": [
    {
      "id": "room-uuid",
      "name": "Italian Vacation Planning",
      "createdBy": "creator-user-id",      // NEW: Creator's user ID
      "isCreator": true,                   // NEW: Boolean flag
      "participants": [...],
      "elementCount": 15,
      "unreadCount": 3,
      "hasUnread": true,
      // ... other fields
    }
  ]
}
```

## UI/UX Recommendations

### 1. Room Options Menu
For each room, show different options based on `isCreator`:

**If Creator (`isCreator: true`)**:
- ✏️ Rename Room
- 🗑️ Delete Room (show confirmation dialog)
- 🧹 Clear Canvas

**If Participant (`isCreator: false`)**:
- 🚪 Leave Room (show confirmation dialog)

### 2. Confirmation Dialogs

**Delete Room (Creator)**:
```
Delete Room?
This will permanently delete "{roomName}" and all its contents. 
All participants will be notified.

[Cancel] [Delete]
```

**Leave Room (Participant)**:
```
Leave Room?
You will no longer have access to "{roomName}".
The room creator will be notified.

[Cancel] [Leave]
```

### 3. Handling Push Notifications

**Room Deleted Notification**:
- Remove the room from local storage/cache
- If user is currently in the room, navigate back to room list
- Show alert: "The room \"{roomName}\" has been deleted by {creatorName}"

**Participant Left Notification**:
- Update participant list if viewing the room
- Show in-app notification if desired

## Important Notes

1. **Existing Leave Endpoint**: The `POST /api/rooms/:roomId/leave` endpoint still exists but only marks the user as "inactive" temporarily. Use the new `DELETE` endpoint for permanent leaving.

2. **Creator Cannot Leave**: The room creator cannot use the leave endpoint. They must delete the room if they want to remove it.

3. **Multi-Participant Rooms**: When a participant leaves a multi-participant room (3+ people), the room continues to exist for remaining participants.

4. **Real-time Updates**: Consider using Socket.IO events to notify active users when:
   - A room is deleted (emit to all participants)
   - A participant leaves (emit to remaining participants)

## Migration Checklist

- [ ] Update room model to include `createdBy` and `isCreator` fields
- [ ] Add delete room functionality with confirmation
- [ ] Add leave room functionality with confirmation
- [ ] Handle push notifications for room deletion
- [ ] Handle push notifications for participant leaving
- [ ] Update UI to show appropriate options based on creator status
- [ ] Test error cases (non-creator trying to delete, creator trying to leave)
- [ ] Update local room cache when rooms are deleted/left