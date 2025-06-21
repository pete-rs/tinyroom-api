# Following System - Feature Overview & Technical Details

## Overview

TinyRoom now supports a complete following system that allows users to:
- Follow and unfollow other users
- Search for users with fuzzy text matching
- View followers and following lists
- See follow counts and status in user profiles

## Database Schema

### New Table: `follows`
```sql
CREATE TABLE follows (
  id TEXT PRIMARY KEY,
  follower_id TEXT NOT NULL REFERENCES users(id),
  following_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(follower_id, following_id)
);

-- Indexes for performance
CREATE INDEX ON follows(follower_id);
CREATE INDEX ON follows(following_id);
```

### Updated User Model
Added to the `users` table:
- `followers_count` (INTEGER DEFAULT 0) - Denormalized count of followers
- `following_count` (INTEGER DEFAULT 0) - Denormalized count of following

### Automatic Count Maintenance
Database triggers automatically update counts when follows are created/deleted:
```sql
CREATE TRIGGER update_follow_counts_trigger
AFTER INSERT OR DELETE ON follows
FOR EACH ROW EXECUTE FUNCTION update_follow_counts();
```

## API Endpoints

### 1. User Search with Follow Status
**GET** `/api/users/search?q={query}&page=1&limit=20`

**Description**: Search for users by username or first name with fuzzy matching

**Request Parameters**:
- `q` (required): Search query string
- `page` (optional): Page number for pagination (default: 1)
- `limit` (optional): Results per page (default: 20)

**Response**:
```json
{
  "data": [
    {
      "id": "user-123",
      "username": "johndoe",
      "firstName": "John",
      "email": "john@example.com",
      "avatarUrl": "https://...",
      "followersCount": 150,
      "followingCount": 89,
      "following": true,      // Am I following this user?
      "followsMe": false      // Does this user follow me?
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

**Search Features**:
- Case-insensitive search
- Searches both username and firstName
- Prioritizes exact matches, then prefix matches
- Excludes incomplete profiles

### 2. Follow a User
**POST** `/api/users/:userId/follow`

**Description**: Follow another user

**Response**:
```json
{
  "data": {
    "following": true,
    "followersCount": 151  // Updated follower count
  }
}
```

**Error Cases**:
- 400: Cannot follow yourself
- 400: Already following this user
- 404: User not found

**Side Effects**:
- Sends push notification to followed user

### 3. Unfollow a User
**DELETE** `/api/users/:userId/follow`

**Description**: Unfollow a user

**Response**:
```json
{
  "data": {
    "following": false,
    "followersCount": 150  // Updated follower count
  }
}
```

**Error Cases**:
- 400: Not following this user

### 4. Get Followers List
**GET** `/api/users/:userId/followers?page=1&limit=20`

**Description**: Get paginated list of a user's followers

**Response**:
```json
{
  "data": [
    {
      "id": "user-456",
      "username": "janedoe",
      "firstName": "Jane",
      "email": "jane@example.com",
      "avatarUrl": "https://...",
      "followersCount": 89,
      "followingCount": 134,
      "following": false,     // Do I follow this follower?
      "followsMe": true       // They follow the profile being viewed
    }
  ],
  "meta": {
    "total": 150,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

### 5. Get Following List
**GET** `/api/users/:userId/following?page=1&limit=20`

**Description**: Get paginated list of users that someone follows

**Response**: Same format as followers, but `followsMe` indicates if they follow you back

### 6. Check Follow Status
**GET** `/api/users/:userId/follow-status`

**Description**: Quick check of follow relationship between current user and another user

**Response**:
```json
{
  "data": {
    "following": true,   // Am I following them?
    "followsMe": false   // Do they follow me?
  }
}
```

### 7. Get User Profile
**GET** `/api/users/:userId`

**Description**: Get detailed user profile with follow information

**Response**:
```json
{
  "data": {
    "id": "user-123",
    "username": "johndoe",
    "firstName": "John",
    "email": "john@example.com",
    "avatarUrl": "https://...",
    "followersCount": 150,
    "followingCount": 89,
    "following": true,
    "followsMe": false,
    "createdAt": "2024-01-20T10:00:00Z"
  }
}
```

### 8. Get Current User (Updated)
**GET** `/api/users/me`

**Description**: Now includes follow counts

**Response**:
```json
{
  "data": {
    "id": "user-789",
    "username": "myusername",
    "firstName": "My Name",
    "email": "me@example.com",
    "avatarUrl": "https://...",
    "followersCount": 42,
    "followingCount": 67,
    "profileComplete": true,
    "dateOfBirth": "1990-01-01T00:00:00Z",
    "oneSignalPlayerId": "..."
  }
}
```

## Push Notifications

When someone follows you, they receive a OneSignal push notification:
- **Title**: "New Follower"
- **Message**: "John started following you"
- **Data**: `{ type: "user_followed", followerName: "John" }`

## Performance Considerations

1. **Denormalized Counts**: Follower/following counts are stored on the user record and maintained by database triggers for fast access

2. **Efficient Queries**: Follow status is checked using LEFT JOINs in search queries to minimize database calls

3. **Indexed Lookups**: Both `follower_id` and `following_id` are indexed for fast queries

## iOS Integration Tips

### Following/Unfollowing
```swift
// Follow
POST /api/users/{userId}/follow
// Returns: { following: true, followersCount: 151 }

// Unfollow  
DELETE /api/users/{userId}/follow
// Returns: { following: false, followersCount: 150 }
```

### Search Implementation
```swift
// Search with follow status
GET /api/users/search?q=john&page=1&limit=20

// Each result includes:
// - following: Bool (am I following them?)
// - followsMe: Bool (do they follow me?)
// - followersCount: Int
// - followingCount: Int
```

### Profile Display
When showing a user profile:
1. Use `GET /api/users/:userId` to get full profile with follow status
2. Show follow/unfollow button based on `following` field
3. Display follower/following counts
4. Show mutual follow indicator if both `following` and `followsMe` are true

### Real-time Updates
Currently, follow actions don't emit socket events, but the response includes updated counts. Consider refreshing the UI after follow/unfollow actions.

## Security & Privacy

1. **Profile Completion Required**: Only users with complete profiles can follow or be followed
2. **No Self-Following**: Users cannot follow themselves
3. **Duplicate Prevention**: Database constraint prevents duplicate follow relationships
4. **Private by Default**: Follow lists are currently public, but privacy settings can be added later

## Future Enhancements

1. **Private Accounts**: Add privacy settings to require approval for follows
2. **Mutual Followers**: Show mutual connections between users
3. **Follow Suggestions**: Recommend users to follow based on mutual connections
4. **Activity Feed**: Show content from followed users
5. **Block/Mute**: Prevent unwanted follows