# Following Feed API - Technical Specification

## Endpoint

**GET** `/api/following/feed`

## Description

Returns all public rooms created by users that the current user is following. This enables a social feed experience where users can discover content from people they follow.

## Authentication

- **Required**: Yes
- **Profile Completion**: Required

## Request Parameters

| Parameter | Type    | Required | Default | Description                    |
|-----------|---------|----------|---------|--------------------------------|
| `page`    | integer | No       | 1       | Page number for pagination     |
| `limit`   | integer | No       | 20      | Number of rooms per page       |

## Response Format

### Success Response (200 OK)

```json
{
  "data": [
    {
      "id": "room-123",
      "name": "Summer Vacation 2024",
      "isPublic": true,
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-20T14:45:00Z",
      "messagesUpdatedAt": "2024-01-20T14:45:00Z",
      "createdBy": "user-456",
      "creator": {
        "id": "user-456",
        "username": "johndoe",
        "firstName": "John",
        "email": "john@example.com",
        "avatarUrl": "https://cloudinary.com/..."
      },
      "nameSetBy": "user-456",
      "nameSetByUser": {
        "id": "user-456",
        "username": "johndoe",
        "firstName": "John",
        "avatarUrl": "https://cloudinary.com/..."
      },
      "isCreator": false,
      "participants": [
        {
          "id": "user-456",
          "username": "johndoe",
          "firstName": "John",
          "avatarUrl": "https://cloudinary.com/...",
          "color": "#FF6B6B",
          "isActive": true
        },
        {
          "id": "user-789",
          "username": "janedoe",
          "firstName": "Jane",
          "avatarUrl": "https://cloudinary.com/...",
          "color": "#4ECDC4",
          "isActive": false
        }
      ],
      "elementCount": 24,
      "unreadCount": 0,
      "hasUnread": false,
      "lastVisitedAt": "2024-01-20T14:45:00Z",
      "badges": {
        "messages": 0,
        "elements": 0
      }
    }
  ],
  "meta": {
    "total": 45,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

### Empty Response (No Rooms)

```json
{
  "data": [],
  "meta": {
    "total": 0,
    "page": 1,
    "limit": 20,
    "hasMore": false
  }
}
```

## Response Fields

### Room Object

| Field               | Type     | Description                                           |
|---------------------|----------|-------------------------------------------------------|
| `id`                | string   | Unique room identifier                                |
| `name`              | string   | Room name                                             |
| `isPublic`          | boolean  | Always `true` (only public rooms shown in feed)      |
| `createdAt`         | string   | ISO 8601 timestamp of room creation                   |
| `updatedAt`         | string   | ISO 8601 timestamp of last room update               |
| `messagesUpdatedAt` | string?  | ISO 8601 timestamp of last message activity          |
| `createdBy`         | string   | User ID of room creator                               |
| `creator`           | User     | Full user object of room creator                      |
| `nameSetBy`         | string?  | User ID of who set the room name                     |
| `nameSetByUser`     | User?    | Full user object of name setter                      |
| `isCreator`         | boolean  | Whether current user is the room creator              |
| `participants`      | Array    | List of all room participants (simplified format)    |
| `elementCount`      | number   | Count of non-deleted elements in room                |
| `unreadCount`       | number   | Always 0 (feed doesn't track unread)                 |
| `hasUnread`         | boolean  | Always false (feed doesn't track unread)             |
| `lastVisitedAt`     | string   | Current timestamp (not tracked for feed)             |
| `badges`            | object   | Always `{messages: 0, elements: 0}`                  |

### User Object

| Field           | Type     | Description                  |
|-----------------|----------|------------------------------|
| `id`            | string   | User ID                      |
| `username`      | string   | Unique username              |
| `firstName`     | string   | User's first name            |
| `email`         | string?  | User's email (if included)   |
| `avatarUrl`     | string?  | Profile picture URL          |

### Participant Object (Simplified Format)

| Field       | Type     | Description                           |
|-------------|----------|---------------------------------------|
| `id`        | string   | Participant's user ID                 |
| `username`  | string   | Participant's username                |
| `firstName` | string   | Participant's first name              |
| `avatarUrl` | string?  | Participant's avatar URL              |
| `color`     | string   | Hex color for participant in room     |
| `isActive`  | boolean  | Whether participant is active in room |

### Meta Object

| Field     | Type    | Description                              |
|-----------|---------|------------------------------------------|
| `total`   | number  | Total number of rooms in feed            |
| `page`    | number  | Current page number                      |
| `limit`   | number  | Number of items per page                 |
| `hasMore` | boolean | Whether more pages are available         |

## Query Logic

The endpoint returns rooms where:
1. Room is public (`isPublic = true`)
2. Room creator is someone the current user follows
3. Ordered by most recently updated first (`updatedAt DESC`)

## Performance Considerations

1. **Indexed Queries**: Uses existing indexes on `follows.follower_id` and `rooms.is_public`
2. **Efficient Joins**: Single query with necessary joins to minimize database calls
3. **Pagination**: Supports limit/offset pagination to handle large result sets
4. **Count Optimization**: Element and message counts are included via `_count` aggregation

## Error Responses

### 401 Unauthorized
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "User not authenticated"
  }
}
```

### 403 Forbidden (Incomplete Profile)
```json
{
  "error": {
    "code": "PROFILE_INCOMPLETE",
    "message": "Please complete your profile to access this feature"
  }
}
```

## Use Cases

1. **Social Feed**: Display a feed of rooms from followed users
2. **Discovery**: Help users find interesting content from people they follow
3. **Engagement**: Encourage users to join public rooms from their network

## iOS Implementation Example

```swift
// Fetch following feed
func getFollowingFeed(page: Int = 1) async throws -> FeedResponse {
    let url = "\(baseURL)/api/following/feed?page=\(page)&limit=20"
    
    let response = await apiClient.get(url)
    return try decoder.decode(FeedResponse.self, from: response.data)
}

// Usage
let feedResponse = try await getFollowingFeed(page: 1)
if feedResponse.data.isEmpty {
    // Show empty state: "No public rooms from people you follow"
} else {
    // Display rooms in a list/grid
    for room in feedResponse.data {
        print("\(room.creator.firstName)'s room: \(room.name)")
        print("Participants: \(room.participants.count)")
        print("Elements: \(room.elementCount)")
    }
}
```

## Future Enhancements

1. **Filtering**: Add filters for room activity, participant count, content type
2. **Sorting**: Options to sort by creation date, activity, popularity
3. **Mixed Feed**: Include other content types (not just rooms)
4. **Recommendations**: Suggest rooms from friends of friends