# Comment System Debug Logs

All comment-related endpoints and socket events now include comprehensive console logging for debugging.

## API Endpoints

### 1. GET /api/rooms/:roomId/comments
**Logs:**
- `💬 [GET ROOM COMMENTS] Request for room {roomId}, page {page}, limit {limit}, user {userId}`
- `💬 [GET ROOM COMMENTS] Found {X} comments out of {total} total`
- `💬 [GET ROOM COMMENTS] Comments: {full JSON of transformed comments}`
- `💬 [GET ROOM COMMENTS] Full response: {full JSON response}`

### 2. POST /api/rooms/:roomId/comments
**Logs:**
- `💬 [CREATE COMMENT] Creating comment in room {roomId} by user {userId}`
- `💬 [CREATE COMMENT] Text: "{text}", Parent: {parentId or 'none'}, Referenced element: {elementId or 'none'}`
- `💬 [CREATE COMMENT] Created comment: {full JSON}`
- `💬 [CREATE COMMENT] Emitting comment:new for top-level comment` OR
- `💬 [CREATE COMMENT] Emitting comment:reply:new for reply to comment {parentId}`
- `💬 [CREATE COMMENT] Response sent: {summary with id, parentId, text preview, userId, likeCount}`

### 3. GET /api/comments/:commentId/replies
**Logs:**
- `💬 [GET COMMENT REPLIES] Request for comment {commentId}, page {page}, limit {limit}, user {userId}`
- `💬 [GET COMMENT REPLIES] Found {X} replies out of {total} total for comment {commentId}`
- `💬 [GET COMMENT REPLIES] Transformed replies: {full JSON}`

### 4. POST /api/comments/:commentId/like
**Logs:**
- `👍 [TOGGLE COMMENT LIKE] User {username} {liked|unliked} comment {commentId}, new count: {count}`
- `👍 [TOGGLE COMMENT LIKE] Response: {action, likeCount}`

### 5. DELETE /api/comments/:commentId
**Logs:**
- `🗑️ [DELETE COMMENT] Request to delete comment {commentId} by user {userId}`
- `🗑️ [DELETE COMMENT] Successfully deleted comment {commentId} from room {roomId}`
- `🗑️ [DELETE COMMENT] Comment had {parent info or 'no parent (top-level)'}`

## Socket Events

All comment-related socket events log:
- `💬📤 [SOCKET] Emitting {event} to room {roomId}`
- `💬📤 [SOCKET] Event data: {full JSON of event data}`

Events include:
- `comment:new` - New top-level comment
- `comment:reply:new` - New reply to a comment
- `comment:deleted` - Comment was deleted

## Like Count Tracking

Like counts are logged in:
- Comment creation responses (`likeCount` field)
- GET comments responses (shows `likeCount` and `userHasLiked` for each comment/reply)
- Like toggle responses (shows new `likeCount` after like/unlike)

## Debugging Tips

1. **Missing likes**: Check if `likeCount` is 0 in the response
2. **Wrong user liked status**: Check `userHasLiked` field in comment data
3. **Socket events not received**: Check for `[SOCKET] Emitting` logs
4. **Comment hierarchy issues**: Check `parentId` field in logs
5. **Reply count mismatch**: Check `replyCount` and `hasMoreReplies` fields

All logs use emoji prefixes for easy filtering:
- 💬 = Comment operations
- 👍 = Like operations
- 🗑️ = Delete operations
- 📤 = Socket emissions