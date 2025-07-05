# iOS Comment System Integration Guide

This guide covers the complete comment system including comments, replies, and likes.

## Overview

The comment system supports:
- Top-level comments on rooms
- Replies to comments (1 level deep only)
- Likes on both comments and replies
- Pagination for large comment lists
- Real-time updates via Socket.io

## Comment Data Structure

### Comment Object
```typescript
{
  id: string;
  text: string;
  parentId: string | null;      // null = top-level, string = reply
  user: {
    id: string;
    username: string;
    firstName: string;
    avatarUrl: string | null;
  };
  
  // Like data
  likeCount: number;            // Total likes on this comment
  userHasLiked: boolean;        // Did current user like this?
  
  // Reply data (top-level comments only)
  replyCount: number;           // Total number of replies
  hasMoreReplies: boolean;      // More than 3 replies exist?
  replies: Comment[];           // First 3 replies included
  
  // Optional element reference
  referencedElementId: string | null;
  referencedElementType: "PHOTO" | "VIDEO" | etc;
  referencedElement: Element | null;
  
  createdAt: string;
  updatedAt: string;
}
```

## API Endpoints

### 1. Get Comments for a Room

```
GET /api/rooms/:roomId/comments?page=1&limit=20
```

**Returns:** Top-level comments with first 3 replies nested inside each comment

**Example Response:**
```json
{
  "data": [
    {
      "id": "comment-1",
      "text": "Love this room!",
      "parentId": null,
      "user": {
        "id": "user-1",
        "username": "sarah",
        "firstName": "Sarah",
        "avatarUrl": "https://..."
      },
      "likeCount": 5,
      "userHasLiked": true,
      "replyCount": 7,
      "hasMoreReplies": true,  // More than 3 replies
      "replies": [
        {
          "id": "reply-1",
          "text": "@sarah Me too!",
          "parentId": "comment-1",
          "user": { /* user object */ },
          "likeCount": 2,
          "userHasLiked": false,
          "createdAt": "2025-01-03T10:15:00Z"
        },
        // ... up to 3 replies
      ],
      "referencedElement": null,
      "createdAt": "2025-01-03T10:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "totalPages": 5,
    "totalCount": 87  // Total TOP-LEVEL comments only
  }
}
```

### 2. Load More Replies

When `hasMoreReplies` is true, load additional replies:

```
GET /api/comments/:commentId/replies?page=1&limit=20
```

**Example Response:**
```json
{
  "data": [
    {
      "id": "reply-4",
      "text": "@sarah Absolutely!",
      "parentId": "comment-1",
      "user": { /* user object */ },
      "likeCount": 0,
      "userHasLiked": false,
      "replyCount": 0,  // Always 0 for replies
      "createdAt": "2025-01-03T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "totalPages": 2,
    "totalCount": 7  // Total replies to this comment
  }
}
```

### 3. Create a Comment

```
POST /api/rooms/:roomId/comments
Content-Type: application/json

{
  "text": "This is amazing!",
  "parentId": null,              // null for top-level comment
  "referencedElementId": null    // Optional element reference
}
```

### 4. Create a Reply

```
POST /api/rooms/:roomId/comments
Content-Type: application/json

{
  "text": "@sarah I agree!",
  "parentId": "comment-1",       // ID of comment to reply to
  "referencedElementId": null
}
```

### 5. Toggle Like on Comment/Reply

```
POST /api/comments/:commentId/like
```

**Response:**
```json
{
  "data": {
    "action": "liked",    // or "unliked"
    "likeCount": 6        // New total count
  }
}
```

### 6. Delete Comment

```
DELETE /api/comments/:commentId
```

Only comment author or room creator can delete comments.

## Socket Events

### Listen for New Comments
```javascript
socket.on('comment:new', (data) => {
  // data = {
  //   roomId: "room-id",
  //   comment: { /* full comment object */ }
  // }
  
  // Add to top of comment list
});
```

### Listen for New Replies
```javascript
socket.on('comment:reply:new', (data) => {
  // data = {
  //   roomId: "room-id",
  //   parentCommentId: "comment-1",
  //   reply: { /* full reply object */ }
  // }
  
  // Add to replies of parentCommentId
});
```

### Listen for Deleted Comments
```javascript
socket.on('comment:deleted', (data) => {
  // data = {
  //   roomId: "room-id",
  //   commentId: "comment-id"
  // }
  
  // Remove from UI
});
```

## UI Implementation

### Comment List Structure
```
┌─────────────────────────────────────┐
│ Sarah (@sarah) · 5 ❤️               │
│ Love this room!                     │
│ 10:00 AM · Reply · Like            │
│                                     │
│   ├─ John (@john) · 2 ❤️           │
│   │  @sarah Me too!                │
│   │  10:15 AM · Reply · Like      │
│   │                                │
│   ├─ Emma (@emma) · 0 ❤️           │
│   │  @sarah Same here!             │
│   │  10:20 AM · Reply · Like      │
│   │                                │
│   └─ View 4 more replies...        │
│                                     │
├─────────────────────────────────────┤
│ Mike (@mike) · 12 ❤️                │
│ Check out this photo!               │
│ [Photo Preview]                     │
│ 11:00 AM · Reply · Like            │
└─────────────────────────────────────┘
```

### Implementation Tips

1. **Initial Load**
   - Call `GET /api/rooms/:roomId/comments` when opening comments
   - This returns top-level comments with first 3 replies included

2. **Reply Threading**
   - Indent replies 40-50px from left
   - Show "View X more replies" when `hasMoreReplies` is true
   - Clicking loads more via `GET /api/comments/:commentId/replies`

3. **Like Button**
   - Show filled heart if `userHasLiked` is true
   - Show empty heart if false
   - Display `likeCount` next to heart
   - Tap calls `POST /api/comments/:commentId/like`
   - Update UI optimistically, then sync with response

4. **Creating Comments**
   - New comments: `parentId: null`
   - Replies: `parentId: "comment-id"`
   - Auto-prepend @username when replying
   - Add to UI optimistically on success

5. **Real-time Updates**
   - New comments appear at top of list
   - New replies appear under parent comment
   - Deleted comments removed from UI
   - Like counts DO NOT update in real-time (refresh on re-open)

6. **Pagination**
   - Load more top-level comments when scrolling to bottom
   - Track current page in state
   - Show loading indicator while fetching

## Best Practices

1. **Optimistic Updates**
   - Update like count immediately on tap
   - Add new comments/replies to UI before server confirms
   - Revert on error

2. **Error Handling**
   - Show toast/alert on network errors
   - Retry failed requests
   - Handle deleted parent comments gracefully

3. **Performance**
   - Cache comment data in memory
   - Lazy load replies (don't fetch until expanded)
   - Virtualize long comment lists

4. **State Management**
   ```swift
   struct CommentState {
     var comments: [Comment] = []
     var isLoading = false
     var currentPage = 1
     var hasMorePages = true
     var replyPages: [String: Int] = [:]  // commentId -> page
   }
   ```

## Common Scenarios

### Scenario 1: User Opens Comments
1. Show loading spinner
2. Call `GET /api/rooms/:roomId/comments?page=1`
3. Render comments with nested replies
4. Listen for socket events

### Scenario 2: User Likes a Comment
1. Toggle heart UI immediately
2. Update count optimistically
3. Call `POST /api/comments/:commentId/like`
4. Update with server response

### Scenario 3: User Writes a Reply
1. Tap "Reply" on a comment
2. Prepopulate with @username
3. User types message
4. Send with `parentId` of original comment
5. Add to replies array on success

### Scenario 4: Load More Replies
1. User taps "View X more replies"
2. Call `GET /api/comments/:commentId/replies`
3. Append to existing replies
4. Update "View more" button or hide if no more

## Room Model Updates

When fetching rooms, the `commentCount` field shows total comments:

```json
{
  "id": "room-id",
  "name": "Room Name",
  "commentCount": 45,  // Total comments + replies
  "commentsUpdatedAt": "2025-01-03T12:00:00Z",
  // ... other room fields
}
```

Use this to show comment count badges in room list.