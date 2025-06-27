# Element Comments API Documentation

## Overview

The comment system allows users to comment on elements in rooms. Comments support:
- 140 character limit
- Likes/unlikes from other users
- Pagination (20 comments at a time)
- Soft delete (creator can delete their comments)
- Push notifications for new comments and likes

## API Endpoints

### 1. Add Comment to Element
**POST** `/api/comments/elements/:elementId`

Add a comment to an element.

**Request Body:**
```json
{
  "content": "Great photo! 📸"  // Max 140 characters
}
```

**Response:**
```json
{
  "data": {
    "comment": {
      "id": "comment-123",
      "elementId": "element-456",
      "userId": "user-789",
      "content": "Great photo! 📸",
      "createdAt": "2024-06-21T10:00:00Z",
      "user": {
        "id": "user-789",
        "username": "johndoe",
        "firstName": "John",
        "email": "john@example.com",
        "avatarUrl": "https://..."
      },
      "likeCount": 0,
      "hasLiked": false
    },
    "elementStats": {
      "totalComments": 12
    }
  }
}
```

### 2. Get Comments for Element (Paginated)
**GET** `/api/comments/elements/:elementId?page=1&limit=20`

Get comments for an element with pagination.

**Query Parameters:**
- `page` (optional, default: 1) - Page number
- `limit` (optional, default: 20) - Comments per page

**Response:**
```json
{
  "data": {
    "comments": [
      {
        "id": "comment-123",
        "userId": "user-789",
        "content": "Great photo! 📸",
        "createdAt": "2024-06-21T10:00:00Z",
        "user": {
          "id": "user-789",
          "username": "johndoe",
          "firstName": "John",
          "avatarUrl": "https://..."
        },
        "likeCount": 3,
        "hasLiked": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "totalCount": 45,
      "hasMore": true
    }
  }
}
```

### 3. Delete Comment
**DELETE** `/api/comments/:commentId`

Delete your own comment (soft delete).

**Response:**
```json
{
  "data": {
    "message": "Comment deleted successfully",
    "elementStats": {
      "totalComments": 11
    }
  }
}
```

### 4. Like/Unlike Comment
**POST** `/api/comments/:commentId/like`

Toggle like on a comment.

**Response:**
```json
{
  "data": {
    "action": "liked",  // or "unliked"
    "commentStats": {
      "likeCount": 4,
      "hasLiked": true
    }
  }
}
```

## Element Response with Comment Count

When fetching room elements, comment counts are included:

```json
{
  "id": "element-456",
  "type": "PHOTO",
  "imageUrl": "https://...",
  // ... other element fields
  "reactions": {
    "count": 5,
    "hasReacted": true,
    "userEmoji": "❤️",
    "topReactors": [...]
  },
  "comments": {
    "count": 12  // Total comment count
  }
}
```

## Socket Events

### 1. element:comment:added
Emitted when a new comment is added to an element.

```json
{
  "elementId": "element-456",
  "comment": {
    "id": "comment-123",
    "userId": "user-789",
    "content": "Great photo! 📸",
    "createdAt": "2024-06-21T10:00:00Z",
    "user": {
      "id": "user-789",
      "username": "johndoe",
      "firstName": "John",
      "avatarUrl": "https://..."
    }
  },
  "stats": {
    "totalCount": 12
  }
}
```

### 2. element:comment:deleted
Emitted when a comment is deleted.

```json
{
  "elementId": "element-456",
  "commentId": "comment-123",
  "stats": {
    "totalCount": 11
  }
}
```

## Push Notifications

### New Comment on Your Element
When someone comments on your element:
- **Title**: "New comment on your {elementType}"
- **Message**: "{commenterName}: {commentText}"
- **Data**: Contains roomId, roomName, elementType

### Comment Like
When someone likes your comment:
- **Title**: "Your comment was liked"
- **Message**: "{likerName} liked your comment \"{truncatedComment}\""
- **Data**: Contains roomId, roomName

## Usage Examples

### Add a comment
```javascript
// Add comment
POST /api/comments/elements/element-456
{ "content": "Love this! 😍" }

// Listen for real-time updates
socket.on('element:comment:added', (data) => {
  // Update UI with new comment
  // Increment comment count on element
});
```

### Paginate through comments
```javascript
// Get first page
GET /api/comments/elements/element-456?page=1&limit=20

// Load more
GET /api/comments/elements/element-456?page=2&limit=20
```

### Like/unlike flow
```javascript
// Like a comment
POST /api/comments/comment-123/like
// Response: { "action": "liked", "commentStats": { "likeCount": 4, "hasLiked": true } }

// Unlike (same endpoint)
POST /api/comments/comment-123/like
// Response: { "action": "unliked", "commentStats": { "likeCount": 3, "hasLiked": false } }
```

## Notes

1. **Character limit**: Comments are limited to 140 characters
2. **Soft delete**: Deleted comments are marked with deletedAt but not removed from database
3. **Creator only delete**: Users can only delete their own comments
4. **Real-time updates**: Socket events update comment counts on elements in real-time
5. **Pagination**: Comments are sorted newest first, 20 per page by default
6. **Public room support**: Users can comment on elements in public rooms they've joined