# iOS Room Interactions Integration Guide

This guide covers the new room-level reactions and comments system.

## Overview

All interactions (reactions and comments) are now at the room level, not individual elements. This simplifies the UI and provides a cleaner experience.

## Room Data Shape (GET /api/rooms/my-rooms)

Each room now includes interaction counts:

```json
{
  "id": "room-id",
  "name": "Room Name",
  // ... other room fields ...
  
  // Interaction data
  "reactionCount": 5,          // Total reactions on the room
  "lastReactionAt": "2025-07-03T...",  // When last reaction was added
  "commentCount": 12,          // Total comments in the room
  "commentsUpdatedAt": "2025-07-03T...", // When comments were last added/deleted
  "userReaction": {            // Current user's reaction (null if none)
    "hasReacted": true,
    "emoji": "❤️"
  }
}
```

## Room Reactions

### Toggle Reaction (Heart Button)
```
POST /api/rooms/:roomId/reaction
Authorization: Bearer <token>
Content-Type: application/json

Body (optional):
{
  "emoji": "❤️"  // Defaults to ❤️
}

Response:
{
  "data": {
    "action": "added" | "removed",
    "emoji": "❤️",  // Only present when action is "added"
    "reactionCount": 5
  }
}
```

### Get All Reactions
```
GET /api/rooms/:roomId/reactions
Authorization: Bearer <token>

Response:
{
  "data": {
    "reactions": [
      {
        "id": "reaction-id",
        "emoji": "❤️",
        "user": {
          "id": "user-id",
          "username": "username",
          "firstName": "First",
          "avatarUrl": "..."
        },
        "createdAt": "2025-07-03T..."
      }
    ],
    "totalCount": 5,
    "userReaction": {  // Current user's reaction or null
      "id": "reaction-id",
      "emoji": "❤️"
    }
  }
}
```

## Room Comments

### Get Comments (Paginated)
```
GET /api/rooms/:roomId/comments?page=1&limit=20
Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "id": "comment-id",
      "text": "Great room!",
      "user": {
        "id": "user-id",
        "username": "username",
        "firstName": "First",
        "avatarUrl": "..."
      },
      "parentId": null,  // null for top-level comments
      "replyCount": 3,   // Number of replies
      "hasMoreReplies": false,  // true if more than 3 replies
      "replies": [       // First 3 replies included
        {
          "id": "reply-id",
          "text": "@username I agree!",
          "parentId": "comment-id",
          "user": {
            "id": "user-2",
            "username": "user2",
            "firstName": "User",
            "avatarUrl": "..."
          },
          "createdAt": "2025-07-03T..."
        }
      ],
      "referencedElementId": null,  // Or element ID if referencing
      "referencedElementType": null, // PHOTO, VIDEO, etc if referencing
      "referencedElement": null,     // Element object if referencing
      "createdAt": "2025-07-03T...",
      "updatedAt": "2025-07-03T..."
    }
  ],
  "meta": {
    "page": 1,
    "totalPages": 3,
    "totalCount": 45  // Total top-level comments only
  }
}
```

### Get All Replies for a Comment
```
GET /api/comments/:commentId/replies?page=1&limit=20
Authorization: Bearer <token>

Response:
{
  "data": [
    {
      "id": "reply-id",
      "text": "@username Great point!",
      "parentId": "comment-id",
      "user": { /* user object */ },
      "replyCount": 0,  // Replies don't have nested replies
      "createdAt": "2025-07-03T..."
    }
  ],
  "meta": {
    "page": 1,
    "totalPages": 2,
    "totalCount": 25
  }
}
```

### Create Comment
```
POST /api/rooms/:roomId/comments
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "text": "This is a comment",
  "parentId": null,  // Optional - ID of comment to reply to
  "referencedElementId": null  // Optional - ID of element to reference
}

Response:
{
  "data": {
    "id": "comment-id",
    "text": "This is a comment",
    "parentId": null,
    "user": { /* user object */ },
    "referencedElement": null,
    "createdAt": "2025-07-03T..."
  }
}
```

### Create Reply
```
POST /api/rooms/:roomId/comments
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "text": "@username Great point!",
  "parentId": "parent-comment-id",  // Required for replies
  "referencedElementId": null
}

Response:
{
  "data": {
    "id": "reply-id",
    "text": "@username Great point!",
    "parentId": "parent-comment-id",
    "user": { /* user object */ },
    "createdAt": "2025-07-03T..."
  }
}
```

### Delete Comment
```
DELETE /api/comments/:commentId
Authorization: Bearer <token>

Response:
{
  "data": {
    "message": "Comment deleted successfully"
  }
}
```

## Socket Events

### Reaction Events
```javascript
// Listen for reaction toggles
socket.on('room:reaction:toggled', (data) => {
  // data = {
  //   roomId: "room-id",
  //   userId: "user-id",
  //   username: "username",
  //   emoji: "❤️" | undefined,  // undefined if removed
  //   action: "added" | "removed",
  //   reactionCount: 5
  // }
});
```

### Comment Events
```javascript
// Listen for new comments
socket.on('comment:new', (data) => {
  // data = {
  //   roomId: "room-id",
  //   comment: {
  //     id: "comment-id",
  //     text: "Comment text",
  //     user: { /* user object */ },
  //     referencedElement: null,
  //     createdAt: "..."
  //   }
  // }
});

// Listen for deleted comments
socket.on('comment:deleted', (data) => {
  // data = {
  //   roomId: "room-id",
  //   commentId: "comment-id"
  // }
});
```

## UI Implementation Tips

### Room List View
- Show reaction count with heart icon: `❤️ 5`
- Show comment count with bubble icon: `💬 12`
- Fill heart icon if `userReaction` is not null

### Room Detail View
- Add heart button in toolbar/header
- Toggle filled/unfilled based on `userReaction`
- Show reaction count next to heart
- Add comment button to open comments view
- Show comment count next to comment button

### Comments View
- Paginated list of comments
- Show user avatar, name, and timestamp
- If comment has `referencedElement`, show preview
- Allow deletion of own comments
- Real-time updates via socket events

## Referenced Elements in Comments

When a comment references an element, the response includes:

```json
{
  "referencedElementId": "element-id",
  "referencedElementType": "PHOTO",
  "referencedElement": {
    "id": "element-id",
    "type": "PHOTO",
    "content": null,
    "imageUrl": "https://...",
    "videoUrl": null,
    "thumbnailUrl": null,
    "audioUrl": null,
    "createdBy": "user-id"
  }
}
```

Display these as a small preview above the comment text.

## Migration Notes

1. Remove all element-level reaction/comment UI
2. Remove calls to old `/api/messages/*` endpoints
3. Update room models to include new fields
4. Ensure socket listeners are updated to new event names
5. Comments are no longer "messages" - update variable names

## Error Handling

All endpoints return errors in this format:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Missing or invalid token
- `FORBIDDEN` - User not in room
- `NOT_FOUND` - Room/comment not found
- `INVALID_INPUT` - Bad request data