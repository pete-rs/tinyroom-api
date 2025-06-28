# Edit Profile API Documentation

## Overview
This document provides complete technical specifications for the Edit Profile feature endpoints that iOS needs to implement the profile editing functionality.

## Authentication
All endpoints require a valid Auth0 Bearer token in the Authorization header:
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

## Endpoints

### 1. Update User Profile
Updates the current user's profile information including username, first name, avatar URL, and date of birth.

**Endpoint:** `PUT /api/users/me`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "firstName": "John",           // Optional: 1-50 characters
  "username": "johndoe",         // Optional: 3-20 chars, alphanumeric + underscore
  "avatarUrl": "https://...",    // Optional: URL from Cloudinary upload, or null to remove
  "dateOfBirth": "1990-01-15"    // Optional: ISO date string, user must be 13+
}
```

**Notes:**
- All fields are optional - only send fields you want to update
- Username must be unique across all users
- First name cannot be empty if provided
- Avatar URL should be from Cloudinary upload endpoint
- Pass `null` for avatarUrl to remove the avatar

**Success Response:** `200 OK`
```json
{
  "data": {
    "id": "abc123-def456",
    "username": "johndoe",
    "firstName": "John",
    "email": "john@example.com",
    "avatarUrl": "https://res.cloudinary.com/...",
    "dateOfBirth": "1990-01-15T00:00:00.000Z",
    "createdAt": "2025-01-01T10:00:00.000Z",
    "followersCount": 42,
    "followingCount": 23
  }
}
```

**Error Responses:**

`400 Bad Request` - Validation Error
```json
{
  "error": {
    "code": "INVALID_USERNAME",
    "message": "Username can only contain letters, numbers, and underscores"
  }
}
```

`409 Conflict` - Username Taken
```json
{
  "error": {
    "code": "USERNAME_TAKEN",
    "message": "Username is already taken"
  }
}
```

**Validation Rules:**
- **Username**: 3-20 characters, alphanumeric + underscore only, case-insensitive uniqueness
- **First Name**: 1-50 characters, required (cannot be empty)
- **Date of Birth**: User must be at least 13 years old
- **Avatar URL**: Must be a valid URL (typically from Cloudinary)

### 2. Check Username Availability
Checks if a username is available for use. Excludes the current user from the check during profile editing.

**Endpoint:** `GET /api/auth/check-username`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN
```

**Query Parameters:**
- `username` (required): The username to check

**Example Request:**
```
GET /api/auth/check-username?username=johndoe
```

**Success Response:** `200 OK`

Username Available:
```json
{
  "data": {
    "available": true
  }
}
```

Username Taken or Invalid:
```json
{
  "data": {
    "available": false,
    "reason": "Username is already taken"
  }
}
```

**Possible Reasons:**
- "Username is already taken"
- "Username can only contain letters, numbers, and underscores"
- "Username must be between 3 and 20 characters"

**Note:** This endpoint automatically excludes the current user from the check, so users can "check" their own username without it showing as taken.

### 3. Upload Avatar Image
Uploads an image to Cloudinary and returns the URL to use in the profile update.

**Endpoint:** `POST /api/upload/image`

**Headers:**
```
Authorization: Bearer YOUR_AUTH_TOKEN
Content-Type: multipart/form-data
```

**Request:**
- Field name: `image`
- File: The image file to upload
- Max size: 10MB
- Supported formats: JPEG, PNG, GIF, WebP

**Example (Swift):**
```swift
let formData = MultipartFormData()
formData.append(imageData, withName: "image", fileName: "avatar.jpg", mimeType: "image/jpeg")
```

**Success Response:** `200 OK`
```json
{
  "data": {
    "imageUrl": "https://res.cloudinary.com/dq3yea1ux/image/upload/v1749885768/room-elements/image_abc123_1749885768.jpg"
  }
}
```

**Error Response:** `400 Bad Request`
```json
{
  "error": {
    "code": "NO_FILE",
    "message": "No file uploaded"
  }
}
```

## Complete iOS Implementation Flow

### 1. Load Current Profile
```swift
// Current user data available from AuthManager.shared.userProfile
let currentUser = AuthManager.shared.userProfile
originalUsername = currentUser.username
originalFirstName = currentUser.firstName
originalAvatarUrl = currentUser.avatarUrl
```

### 2. Username Availability Check (Debounced)
```swift
func checkUsernameAvailability(_ username: String) async throws -> Bool {
    let response = try await APIClient.get("/api/auth/check-username", 
                                          params: ["username": username])
    return response.data.available
}
```

### 3. Avatar Upload Flow
```swift
func uploadAvatar(_ image: UIImage) async throws -> String {
    let imageData = image.jpegData(compressionQuality: 0.8)!
    let response = try await APIClient.uploadImage(imageData)
    return response.data.imageUrl  // Note: returns "imageUrl", not "url"
}
```

### 4. Save Profile Changes
```swift
func saveProfile() async throws {
    var updates: [String: Any] = [:]
    
    if currentUsername != originalUsername {
        updates["username"] = currentUsername
    }
    if currentFirstName != originalFirstName {
        updates["firstName"] = currentFirstName
    }
    if currentAvatarUrl != originalAvatarUrl {
        updates["avatarUrl"] = currentAvatarUrl ?? NSNull()
    }
    
    let response = try await APIClient.put("/api/users/me", body: updates)
    // Update local user profile
    AuthManager.shared.userProfile = response.data
}
```

## Important Notes

1. **Profile Completion Required**: User must have completed their profile (during signup) to access these endpoints

2. **Real-time Validation**: Username availability should be checked with debouncing (0.5s recommended) to avoid excessive API calls

3. **Atomic Updates**: The PUT endpoint updates all provided fields atomically - if any validation fails, no fields are updated

4. **Cache Invalidation**: After successful profile update, iOS should:
   - Update local user profile cache
   - Refresh any displayed user info in the app
   - Consider refreshing room participant info if username changed

5. **Error Handling**: Always show specific error messages from the API response to help users understand validation failures

6. **Image Processing**: Images should be square-cropped on the client before upload to maintain consistency

## Error Codes Reference

| Code | Description | User Action |
|------|-------------|-------------|
| INVALID_USERNAME | Format validation failed | Show format requirements |
| INVALID_USERNAME_LENGTH | Length validation failed | Show length requirements |
| USERNAME_TAKEN | Username already exists | Suggest alternatives |
| INVALID_FIRST_NAME | First name validation failed | Show requirements |
| AGE_REQUIREMENT | User under 13 | Block profile update |
| NO_FILE | No image uploaded | Retry upload |
| UNAUTHORIZED | Invalid/expired token | Re-authenticate |