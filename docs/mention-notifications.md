# Mention Notifications

## Overview

When a user is mentioned in a comment using @username, they receive a push notification if:
1. The username exists in the system
2. The mentioned user has push notifications enabled (oneSignalPlayerId set)
3. The mentioned user is not the comment author (no self-mention notifications)

## Notification Flow

### 1. Comment Creation
When a comment is created with text like "Hey @pete thanks @sarah!", the system:

1. **Extracts Mentions**: Uses regex to find all @username patterns
2. **Validates Users**: Looks up users by username in database
3. **Sends Notifications**: Sends push notification to each valid mentioned user

### 2. Notification Format

**Push Notification:**
- **Title**: "{sender} mentioned you"
- **Message**: "In {roomName}: {comment preview up to 50 chars}..."

**Example:**
- Title: "John mentioned you"
- Message: "In Team Chat: Hey @pete can you review the latest..."

### 3. Privacy Considerations

- **Private Rooms**: Only participants can be mentioned (enforced by search)
- **Public Rooms**: Anyone can be mentioned
- **Deleted Users**: Mentions of deleted usernames are ignored
- **Blocked Users**: Currently no blocking system (future enhancement)

## Implementation Details

### Comment Storage
```json
{
  "id": "comment-123",
  "text": "Thanks @pete and @sarah!",
  "mentionedUsernames": ["pete", "sarah"],  // Stored for reference
  "userId": "user-456",
  // ... other fields
}
```

### Notification Service Call
```typescript
NotificationService.notifyMentioned(
  mentionedUserId,      // User to notify
  mentionerName,        // Who mentioned them
  roomName,            // Which room
  commentText          // Comment preview
);
```

### Database Query
The system efficiently looks up mentioned users:
```sql
SELECT id, username, onesignal_player_id 
FROM users 
WHERE username IN ('pete', 'sarah') 
  AND onesignal_player_id IS NOT NULL
```

## Edge Cases

1. **Invalid Mentions**: @nonexistentuser - No notification sent
2. **Self Mentions**: @myownusername - No notification sent
3. **Multiple Mentions**: Each user gets one notification
4. **Case Sensitivity**: Usernames are case-sensitive for mentions
5. **Special Characters**: Only @alphanumeric_underscore patterns detected

## Future Enhancements

1. **Mention Settings**: Allow users to disable mention notifications
2. **@everyone**: Mention all room participants
3. **Rich Notifications**: Include avatar, deep link to comment
4. **Mention History**: Track all mentions of a user
5. **Smart Mentions**: Suggest frequently mentioned users first