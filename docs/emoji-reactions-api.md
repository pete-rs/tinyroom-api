# Emoji Reactions API Documentation

## Overview

The reaction system now supports any emoji character(s) instead of predefined reaction types. Users can react to elements with any emoji, and can update their reaction to a different emoji.

## API Endpoints

### 1. Add or Update Reaction
**POST** `/api/reactions/elements/:elementId`

Add a new reaction or update an existing reaction with a different emoji.

**Request Body:**
```json
{
  "emoji": "❤️"  // Any emoji character(s)
}
```

**Response:**
```json
{
  "data": {
    "action": "added",  // or "updated"
    "reaction": {
      "id": "reaction-123",
      "elementId": "element-456",
      "userId": "user-789",
      "emoji": "❤️",
      "createdAt": "2024-06-21T10:00:00Z",
      "user": {
        "id": "user-789",
        "username": "johndoe",
        "firstName": "John",
        "email": "john@example.com",
        "avatarUrl": "https://..."
      }
    },
    "elementStats": {
      "totalReactions": 5,
      "hasReacted": true,
      "topReactors": [
        {
          "id": "user-123",
          "username": "jane",
          "firstName": "Jane",
          "avatarUrl": "https://...",
          "emoji": "😍"
        },
        {
          "id": "user-456",
          "username": "bob",
          "firstName": "Bob",
          "avatarUrl": "https://...",
          "emoji": "🔥"
        }
      ]
    }
  }
}
```

### 2. Remove Reaction
**DELETE** `/api/reactions/elements/:elementId`

Remove your reaction from an element.

**Response:**
```json
{
  "data": {
    "message": "Reaction removed successfully",
    "elementStats": {
      "totalReactions": 4,
      "hasReacted": false,
      "topReactors": [...]
    }
  }
}
```

### 3. Get Element Reactions
**GET** `/api/reactions/elements/:elementId`

Get all reactions for a specific element.

**Response:**
```json
{
  "data": {
    "reactions": [
      {
        "id": "reaction-123",
        "userId": "user-789",
        "name": "John",
        "avatarUrl": "https://...",
        "username": "johndoe",
        "reactedAt": "2024-06-21T10:00:00Z",
        "emoji": "❤️"
      },
      {
        "id": "reaction-456",
        "userId": "user-123",
        "name": "Jane",
        "avatarUrl": "https://...",
        "username": "jane",
        "reactedAt": "2024-06-21T10:05:00Z",
        "emoji": "😍"
      }
    ],
    "total": 2,
    "hasReacted": true,
    "userEmoji": "❤️"  // Current user's emoji reaction
  }
}
```

## Socket Events

### 1. element:reaction:added
Emitted when a new reaction is added to an element.

```json
{
  "elementId": "element-456",
  "reaction": {
    "userId": "user-789",
    "emoji": "❤️",
    "user": {
      "id": "user-789",
      "username": "johndoe",
      "firstName": "John",
      "avatarUrl": "https://..."
    }
  },
  "stats": {
    "totalCount": 5,
    "topReactors": [...]
  }
}
```

### 2. element:reaction:updated
Emitted when a user changes their reaction emoji.

```json
{
  "elementId": "element-456",
  "reaction": {
    "userId": "user-789",
    "emoji": "🔥",  // New emoji
    "user": {...}
  },
  "stats": {...}
}
```

### 3. element:reaction:removed
Emitted when a reaction is removed.

```json
{
  "elementId": "element-456",
  "userId": "user-789",
  "stats": {
    "totalCount": 4,
    "topReactors": [...]
  }
}
```

## Element Response with Reactions

When fetching room elements, reactions are included:

```json
{
  "id": "element-456",
  "type": "PHOTO",
  "imageUrl": "https://...",
  // ... other element fields
  "reactions": {
    "count": 5,
    "hasReacted": true,
    "userEmoji": "❤️",  // The emoji YOU used (null if not reacted)
    "topReactors": [
      {
        "id": "user-123",
        "username": "jane",
        "firstName": "Jane",
        "avatarUrl": "https://...",
        "emoji": "😍"
      }
      // ... up to 3 top reactors
    ]
  }
}
```

## Usage Examples

### React with any emoji
```javascript
// Add heart reaction
POST /api/reactions/elements/element-456
{ "emoji": "❤️" }

// Change to fire emoji
POST /api/reactions/elements/element-456
{ "emoji": "🔥" }

// Use multiple emojis
POST /api/reactions/elements/element-456
{ "emoji": "🎉🎊" }

// Use any Unicode emoji
POST /api/reactions/elements/element-456
{ "emoji": "🦄" }
```

### Remove reaction
```javascript
DELETE /api/reactions/elements/element-456
```

## Notes

1. **One reaction per user per element** - Users can only have one reaction per element, but can change the emoji
2. **Any emoji supported** - The system accepts any Unicode emoji character(s)
3. **Real-time updates** - All reaction changes are broadcast via Socket.IO
4. **Push notifications** - Users receive notifications when someone reacts to their elements (except for updates)
5. **Public room support** - Users can react to elements in public rooms they've joined

## Migration from Type-based System

The previous system used a `type` field with enum values (HEART). This has been replaced with an `emoji` field that accepts any emoji string. Existing HEART reactions have been migrated to "❤️" emoji.