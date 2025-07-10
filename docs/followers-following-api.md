# Followers & Following API Documentation

## Overview
These endpoints provide paginated lists of followers and following users with mutual follow status.

## Base URL
All endpoints require authentication and a complete user profile.

## Endpoints

### 1. Get User's Followers
Get a list of users who follow a specific user.

**Endpoint:** `GET /api/users/:userId/followers`  
**Auth:** Required  
**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:**
```json
{
  "data": [
    {
      "id": "user-id",
      "username": "johndoe",
      "firstName": "John",
      "email": "john@example.com",
      "avatarUrl": "https://cloudinary.com/avatar.jpg",
      "followersCount": 150,
      "followingCount": 200,
      "following": true,  // Does current user follow this follower?
      "followsMe": true   // Always true (they follow the profile being viewed)
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

**Use Case:** When viewing someone's followers list
- Shows all users following the specified userId
- `following` field indicates if YOU follow this follower
- Button text logic:
  - If `following: true` → Show "Following" button
  - If `following: false` → Show "Follow Back" button

### 2. Get User's Following
Get a list of users that a specific user follows.

**Endpoint:** `GET /api/users/:userId/following`  
**Auth:** Required  
**Query Parameters:**
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20)

**Response:**
```json
{
  "data": [
    {
      "id": "user-id",
      "username": "janedoe",
      "firstName": "Jane",
      "email": "jane@example.com",
      "avatarUrl": "https://cloudinary.com/avatar.jpg",
      "followersCount": 300,
      "followingCount": 250,
      "following": true,  // Does current user follow this user?
      "followsMe": false  // Does this user follow current user back?
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "hasMore": true
  }
}
```

**Use Case:** When viewing someone's following list
- Shows all users that the specified userId follows
- `following` field indicates if YOU also follow this user
- `followsMe` field indicates if they follow YOU back

### 3. Follow a User
Follow a user.

**Endpoint:** `POST /api/users/:userId/follow`  
**Auth:** Required  
**Body:** None required

**Response:**
```json
{
  "data": {
    "following": true,
    "followersCount": 151  // Updated follower count
  }
}
```

**Error Cases:**
- 400 ALREADY_FOLLOWING - Already following this user
- 404 USER_NOT_FOUND - User doesn't exist

### 4. Unfollow a User
Unfollow a user.

**Endpoint:** `DELETE /api/users/:userId/follow`  
**Auth:** Required  
**Body:** None required

**Response:**
```json
{
  "data": {
    "following": false,
    "followersCount": 150  // Updated follower count
  }
}
```

**Error Cases:**
- 400 NOT_FOLLOWING - Not following this user
- 404 USER_NOT_FOUND - User doesn't exist

### 5. Check Follow Status
Check if current user follows a specific user.

**Endpoint:** `GET /api/users/:userId/follow-status`  
**Auth:** Required

**Response:**
```json
{
  "data": {
    "following": true,
    "followsMe": false
  }
}
```

## iOS Implementation Notes

### Button State Logic

#### In Followers List
```swift
func configureFollowButton(for user: User) {
    if user.following {
        // Already following
        button.setTitle("Following", for: .normal)
        button.backgroundColor = .systemGray
    } else {
        // Not following - suggest follow back
        button.setTitle("Follow Back", for: .normal)
        button.backgroundColor = .systemBlue
    }
}
```

#### In Following List
```swift
func configureFollowButton(for user: User) {
    if currentUserId == viewingUserId {
        // Viewing own following list
        button.setTitle("Following", for: .normal)
        button.backgroundColor = .systemGray
    } else {
        // Viewing someone else's following
        if user.following {
            button.setTitle("Following", for: .normal)
            button.backgroundColor = .systemGray
        } else {
            button.setTitle("Follow", for: .normal)
            button.backgroundColor = .systemBlue
        }
    }
}
```

### Handling Follow/Unfollow Actions
```swift
func toggleFollow(for user: User) {
    if user.following {
        // Unfollow
        APIClient.shared.unfollowUser(userId: user.id) { result in
            // Update UI
        }
    } else {
        // Follow
        APIClient.shared.followUser(userId: user.id) { result in
            // Update UI
        }
    }
}
```

### Pagination
```swift
func loadMoreFollowers() {
    let nextPage = currentPage + 1
    APIClient.shared.getFollowers(
        userId: userId,
        page: nextPage,
        limit: 20
    ) { result in
        // Append to existing list
    }
}
```

## Example Usage

### Get My Followers
```
GET /api/users/my-user-id/followers?page=1&limit=20
```

### Get Someone Else's Following
```
GET /api/users/other-user-id/following?page=1&limit=20
```

### Follow Someone from Followers List
```
POST /api/users/follower-user-id/follow
```

## Notes

1. **Privacy**: These endpoints are public - any authenticated user can view anyone's followers/following
2. **Pagination**: Default limit is 20, maximum recommended is 50
3. **Ordering**: Results are ordered by most recent first (newest followers/following at top)
4. **Real-time**: Follow counts update immediately but lists may have slight delay
5. **Self-following**: Users cannot follow themselves (backend prevents this)