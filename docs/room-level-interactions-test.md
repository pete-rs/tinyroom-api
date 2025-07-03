# Room-Level Interactions Test Guide

## Phase 1 Implementation Complete

The room-level interactions system has been successfully implemented. Here's what changed:

### Database Changes
1. **Removed tables:**
   - `messages`
   - `message_reactions`
   - `message_reads`
   - `element_reactions`
   - `element_comments`
   - `comment_likes`

2. **Added tables:**
   - `comments` - Room-level comments with optional element references
   - `room_reactions` - Room-level reactions (one per user per room)

3. **Updated fields:**
   - Room: Added `reaction_count`, `last_reaction_at`, `comments_updated_at`
   - RoomParticipant: Removed `last_read_at` (no longer needed)

### API Endpoints

#### Room Reactions
```bash
# Toggle reaction (add/remove)
POST /api/rooms/:roomId/reaction
Body: { "emoji": "❤️" }  # Optional, defaults to ❤️

# Get all reactions for a room
GET /api/rooms/:roomId/reactions

# Remove reaction
DELETE /api/rooms/:roomId/reaction
```

#### Room Comments
```bash
# Get paginated comments
GET /api/rooms/:roomId/comments?page=1&limit=20

# Create comment (with optional element reference)
POST /api/rooms/:roomId/comments
Body: {
  "text": "Great photo!",
  "referencedElementId": "element-uuid"  # Optional
}

# Delete comment (soft delete)
DELETE /api/comments/:commentId
```

### Socket Events
The following events are emitted when actions occur:
- `room:reaction:toggled` - When reaction is added/removed
- `comment:new` - When new comment is created
- `comment:deleted` - When comment is deleted

### Updated Features
1. **getMyRooms** now includes:
   - `reactionCount` - Total reactions on the room
   - `lastReactionAt` - When the last reaction was added
   - `commentsUpdatedAt` - When comments were last added/deleted
   - `userReaction` - Current user's reaction status

2. **Elements** no longer have:
   - Individual reactions
   - Individual comments
   - The `reactions` and `comments` fields in element responses always return empty data

### Testing Steps

1. **Test Room Reactions:**
   ```bash
   # Add a reaction
   curl -X POST http://localhost:3000/api/rooms/ROOM_ID/reaction \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"emoji": "❤️"}'
   
   # Get reactions
   curl http://localhost:3000/api/rooms/ROOM_ID/reactions \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

2. **Test Room Comments:**
   ```bash
   # Add a comment
   curl -X POST http://localhost:3000/api/rooms/ROOM_ID/comments \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"text": "This room is awesome!"}'
   
   # Add a comment referencing an element
   curl -X POST http://localhost:3000/api/rooms/ROOM_ID/comments \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"text": "Love this photo!", "referencedElementId": "ELEMENT_ID"}'
   ```

3. **Verify in getMyRooms:**
   The room should now show updated reaction counts and timestamps.

### iOS Integration Notes

1. **Remove all element-level interaction UI**
   - No more reaction buttons on individual elements
   - No more comment buttons on individual elements

2. **Add room-level interaction UI**
   - Add a room reaction button (heart icon) in the room header or toolbar
   - Add a comments section accessible from the room (not per element)
   - Comments can optionally reference elements for context

3. **Socket Updates**
   - Listen for `room:reaction:toggled` to update reaction UI
   - Listen for `comment:new` and `comment:deleted` to update comments

### Migration Notes
- All existing element reactions and comments have been deleted
- This is a breaking change - iOS app must be updated before deploying
- The element response still includes empty `reactions` and `comments` fields for backward compatibility