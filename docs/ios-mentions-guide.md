# iOS @Mentions Implementation Guide

This guide covers implementing @mentions in comments with real-time search and autocomplete.

## Overview

The @mentions system allows users to mention other users by typing @username. Features include:
- Real-time username search as you type
- Case-insensitive prefix matching
- Room-specific filtering (optional)
- Visual formatting for mentions (blue, semibold)
- Edit support with re-triggering search

## API Endpoints

### 1. Search Users for Mentions

```
GET /api/users/search/mentions?prefix={prefix}&roomId={roomId}&limit=10
```

**Query Parameters:**
- `prefix` - Characters typed after @ (optional, empty returns recent users)
- `roomId` - Current room ID (HIGHLY RECOMMENDED)
  - For private rooms: Only searches room participants
  - For public rooms: Searches all users in the system
  - If omitted: Searches all users (less secure)
- `limit` - Max results, default 10, max 20

**Example Requests:**
```
// Private room - only searches participants
GET /api/users/search/mentions?prefix=pe&roomId=private-room-123

// Public room - searches all users
GET /api/users/search/mentions?prefix=pe&roomId=public-room-456

// No room specified - searches all users (NOT RECOMMENDED)
GET /api/users/search/mentions?prefix=pe
```

**Room Privacy Behavior:**
- **Private Rooms**: Only participants (creator + invited users) appear in search
- **Public Rooms**: All users in the system appear in search
- **No Room**: All users appear (use only for global contexts)

**Response:**
```json
{
  "data": [
    {
      "id": "user-123",
      "username": "pete",
      "firstName": "Pete",
      "avatarUrl": "https://cloudinary.com/..."
    },
    {
      "id": "user-456",
      "username": "peter",
      "firstName": "Peter",
      "avatarUrl": null
    }
  ]
}
```

**Performance Notes:**
- Results are sorted: exact match first, then alphabetical
- Uses database indexes for sub-10ms response times
- Excludes incomplete profiles (username starting with "user_")

### 2. Validate Mentioned Users (Optional)

```
POST /api/users/validate-mentions
Content-Type: application/json

{
  "usernames": ["pete", "sarah", "unknownuser"]
}
```

**Response:**
```json
{
  "data": [
    {
      "username": "pete",
      "userId": "user-123",
      "exists": true
    },
    {
      "username": "sarah",
      "userId": "user-456",
      "exists": true
    },
    {
      "username": "unknownuser",
      "userId": null,
      "exists": false
    }
  ]
}
```

## Implementation Flow

### 1. Detecting @ Trigger

Monitor text input for @ character:

```swift
func textView(_ textView: UITextView, shouldChangeTextIn range: NSRange, replacementText text: String) -> Bool {
    if text == "@" {
        startMentionSearch(at: range.location)
    }
    // ... rest of logic
}
```

### 2. Extracting Search Prefix

```swift
func getCurrentMentionPrefix(in text: String, cursorPosition: Int) -> String? {
    // Find @ before cursor
    let beforeCursor = String(text.prefix(cursorPosition))
    
    // Look for pattern @word
    let pattern = "@(\\w*)$"
    let regex = try! NSRegularExpression(pattern: pattern)
    
    if let match = regex.firstMatch(in: beforeCursor, range: NSRange(beforeCursor.startIndex..., in: beforeCursor)) {
        let prefixRange = Range(match.range(at: 1), in: beforeCursor)!
        return String(beforeCursor[prefixRange])
    }
    
    return nil
}
```

### 3. API Call with Debouncing

```swift
class MentionSearchManager {
    private var searchTimer: Timer?
    
    func searchUsers(prefix: String, roomId: String? = nil) {
        // Cancel previous timer
        searchTimer?.invalidate()
        
        // Debounce 150ms
        searchTimer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: false) { _ in
            self.performSearch(prefix: prefix, roomId: roomId)
        }
    }
    
    private func performSearch(prefix: String, roomId: String?) {
        var url = "https://api.example.com/api/users/search/mentions?prefix=\(prefix)"
        if let roomId = roomId {
            url += "&roomId=\(roomId)"
        }
        
        // Make API call...
    }
}
```

### 4. Display Results

Show results in a table view or collection view overlay:

```swift
struct MentionResultCell: View {
    let user: MentionUser
    
    var body: some View {
        HStack {
            AsyncImage(url: URL(string: user.avatarUrl ?? "")) { image in
                image.resizable()
            } placeholder: {
                Circle().fill(Color.gray.opacity(0.3))
            }
            .frame(width: 32, height: 32)
            .clipShape(Circle())
            
            VStack(alignment: .leading, spacing: 2) {
                Text(user.firstName)
                    .font(.system(size: 14, weight: .medium))
                Text("@\(user.username)")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            
            Spacer()
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
    }
}
```

### 5. Handle Selection

When user taps a result:

```swift
func selectMention(user: MentionUser, in textView: UITextView) {
    guard let text = textView.text,
          let selectedRange = textView.selectedTextRange else { return }
    
    let cursorPosition = textView.offset(from: textView.beginningOfDocument, to: selectedRange.start)
    
    // Find the @ symbol before cursor
    if let mentionRange = findMentionRange(in: text, before: cursorPosition) {
        // Replace @prefix with @username
        let replacement = "@\(user.username) "
        
        textView.text = (text as NSString).replacingCharacters(in: mentionRange, with: replacement)
        
        // Move cursor after the space
        let newPosition = mentionRange.location + replacement.count
        if let newCursorPosition = textView.position(from: textView.beginningOfDocument, offset: newPosition) {
            textView.selectedTextRange = textView.textRange(from: newCursorPosition, to: newCursorPosition)
        }
    }
    
    // Hide mention picker
    hideMentionPicker()
}
```

### 6. Format Mentions in Display

Apply blue, semibold styling to @mentions:

```swift
func formatMentions(in text: String) -> NSAttributedString {
    let attributedString = NSMutableAttributedString(string: text)
    let pattern = "@(\\w+)"
    let regex = try! NSRegularExpression(pattern: pattern)
    
    let matches = regex.matches(in: text, range: NSRange(text.startIndex..., in: text))
    
    for match in matches {
        let range = match.range
        attributedString.addAttributes([
            .foregroundColor: UIColor.systemBlue,
            .font: UIFont.systemFont(ofSize: 14, weight: .semibold)
        ], range: range)
    }
    
    return attributedString
}
```

## State Management

```swift
class CommentInputViewModel: ObservableObject {
    @Published var text = ""
    @Published var isMentioning = false
    @Published var mentionPrefix = ""
    @Published var mentionResults: [MentionUser] = []
    @Published var mentionStartIndex: Int = 0
    
    func handleTextChange(_ newText: String, cursorPosition: Int) {
        text = newText
        
        // Check if we're in a mention
        if let prefix = extractMentionPrefix(from: newText, at: cursorPosition) {
            isMentioning = true
            mentionPrefix = prefix
            searchUsers(prefix: prefix)
        } else {
            isMentioning = false
            mentionResults = []
        }
    }
}
```

## Edge Cases

### 1. Multiple Mentions
Support multiple @mentions in one comment:
```
"Hey @pete and @sarah, check this out!"
```

### 2. Editing Mentions
When cursor is inside a mention and user backspaces:
```
"Thanks @pete|" → Backspace → Show search for "pet"
```

### 3. Invalid Mentions
If username doesn't exist, treat as regular text (no formatting).

### 4. Case Sensitivity
- Search is case-insensitive
- Preserve original case when inserting

### 5. Special Characters
Only alphanumeric and underscore allowed in usernames.

## Performance Tips

1. **Debounce Search**: Wait 150ms after typing stops
2. **Cache Results**: Cache recent searches for instant display
3. **Limit Results**: Max 10-15 results
4. **Local Filtering**: Filter cached results locally first
5. **Preload Avatars**: Prefetch avatar images for smooth scrolling

## Comment Creation with Mentions

When submitting a comment, mentions are automatically extracted server-side:

```json
POST /api/rooms/:roomId/comments
{
  "text": "Hey @pete thanks for sharing!",
  "parentId": null
}
```

**Server-side Processing:**
1. Extracts mentioned usernames (["pete"]) from text
2. Stores in `mentionedUsernames` field
3. Sends push notifications to mentioned users (if they exist)

**Mention Notifications:**
- Title: "{mentioner} mentioned you"
- Message: "In {roomName}: {comment preview}"
- Only sent to valid users with push notifications enabled
- Self-mentions are ignored

## Testing Scenarios

1. **Empty Search**: Type @ with no prefix
2. **Fast Typing**: Type @petesm quickly
3. **Backspace**: Type @pete then delete to @pe
4. **Multiple Mentions**: @user1 text @user2
5. **Room Filtering**: Test with/without roomId
6. **Network Errors**: Handle API failures gracefully
7. **No Results**: Show "No users found" message

## UI/UX Best Practices

1. **Position**: Show results below or above input
2. **Animation**: Fade in/out smoothly
3. **Loading**: Show subtle loading indicator
4. **Empty State**: "No users found" or "Type to search"
5. **Keyboard**: Keep keyboard open during selection
6. **Scroll**: Auto-scroll results if needed
7. **Highlight**: Bold the matching prefix in results

This implementation provides a smooth, Instagram-like mention experience with excellent performance.