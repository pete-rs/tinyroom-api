# Push Notification Updates Summary

## Changes Made

### 1. Room Renamed Notification
**Updated:**
- Title: "Room Renamed" (unchanged)
- Message: Changed from `"{updaterName} renamed your room to {newName}"` to `"{updaterName} renamed the room {oldName} to {newName}"`
- **Access Control**: Now only room owners can rename rooms (previously any participant could)
- **Implementation**:
  - Modified `updateRoomName` in `roomController.ts` to check `createdBy` instead of just being a participant
  - Updated `notifyRoomRenamed` to accept both old and new room names
  - Error message now returns 403 FORBIDDEN with "Only the room owner can update the room name"

### 2. Element Added Notification
**Updated:**
- Title: Changed from "New Content" to "Object Added"
- Message: `"{creatorName} added a {elementType} in {roomName}"` (unchanged)

### 3. Participant Left Notification
**Updated:**
- Title: "Participant Left" (unchanged)
- Message: Changed from `"{participantName} left the room \"{roomName}\""` to `"{participantName} left the room {roomName}"` (removed quotes)
- **Already Implemented**: This notification is already only sent to the room owner (createdBy)

## Technical Details

### Files Modified:
1. `/src/services/notificationService.ts`:
   - Updated `notifyRoomRenamed` to accept `oldName` parameter
   - Changed "New Content" to "Object Added" in `notifyElementAdded`
   - Updated comment for `notifyParticipantLeft` to clarify it's owner-only
   - Removed quotes from room name in participant left message

2. `/src/controllers/roomController.ts`:
   - Modified `updateRoomName` to restrict access to room owner only
   - Added logic to capture old room name before update
   - Updated notification call to pass both old and new names

### API Impact:
- `PUT /api/rooms/:id/name` now returns 403 FORBIDDEN if a non-owner tries to rename
- All other API behavior remains the same

### Testing Notes:
- TypeScript compilation passes without errors
- Room renaming is now owner-only (breaking change for any clients allowing non-owners to rename)
- Notifications will now show both old and new room names for better context