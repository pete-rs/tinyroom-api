# Room Visibility (Public/Private) - iOS Integration Guide

## Overview

Rooms now have a visibility attribute that determines whether they are public or private. By default, all rooms are **private**.

### Database Field
- **Field**: `isPublic` (Boolean)
- **Default**: `false` (private)
- **Permissions**: Only room creator can change visibility

## API Changes

### 1. All Room Responses Include `isPublic`

Wherever room data is returned, you'll now see:

```json
{
  "id": "room-123",
  "name": "Design Team",
  "isPublic": false,  // NEW FIELD
  "createdBy": "user-456",
  "createdAt": "2024-01-20T10:00:00Z",
  // ... other fields
}
```

This includes:
- `GET /api/rooms/my-rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms` (create response)
- Socket events: `room:updated`, `room:visibility-changed`

### 2. New Endpoint: Toggle Room Visibility

**Endpoint**: `PUT /api/rooms/:id/visibility`

**Request Body**:
```json
{
  "isPublic": true  // or false
}
```

**Response**: Updated room object with new visibility

**Permissions**: Only room creator can change visibility

**Example**:
```swift
func setRoomVisibility(roomId: String, isPublic: Bool) async {
    let url = "\(baseURL)/api/rooms/\(roomId)/visibility"
    let body = ["isPublic": isPublic]
    
    // PUT request with auth token
    await apiClient.put(url, body: body)
}
```

### 3. Real-time Socket Event

When visibility changes, all room participants receive:

```javascript
socket.on('room:visibility-changed', {
  roomId: "room-123",
  isPublic: true,
  changedBy: "user-456"
})
```

## Use Cases & UI Considerations

### 1. Private Rooms (Default)
- **Icon**: 🔒 Lock icon
- **Behavior**: Only invited participants can access
- **Discovery**: Not shown in any public lists
- **Sharing**: Requires explicit invitation

### 2. Public Rooms
- **Icon**: 🌐 Globe icon
- **Behavior**: Anyone with link can view/join
- **Discovery**: Could be shown in explore/discover sections (future)
- **Sharing**: Shareable link can be generated

### 3. Creator Controls
```swift
// Only show visibility toggle for room creator
if room.createdBy == currentUserId {
    visibilityToggle.isHidden = false
    visibilityToggle.isOn = room.isPublic
}
```

### 4. Room List UI
```swift
// In MyRoomsCell
if room.isPublic {
    visibilityIcon.image = UIImage(systemName: "globe")
    visibilityLabel.text = "Public"
} else {
    visibilityIcon.image = UIImage(systemName: "lock.fill")
    visibilityLabel.text = "Private"
}
```

## Implementation Checklist for iOS

### 1. Update Room Model
```swift
struct Room: Codable {
    // ... existing fields ...
    let isPublic: Bool  // Add this field
}
```

### 2. Display Visibility in UI
- Show lock/globe icon in room lists
- Add visibility toggle in room settings (creator only)
- Update room info screens

### 3. Handle Visibility Changes
```swift
// Listen for visibility changes
socket.on("room:visibility-changed") { data in
    let roomId = data["roomId"] as? String
    let isPublic = data["isPublic"] as? Bool
    // Update UI accordingly
}
```

### 4. Implement Visibility Toggle
```swift
@IBAction func visibilityToggled(_ sender: UISwitch) {
    Task {
        await updateRoomVisibility(
            roomId: room.id,
            isPublic: sender.isOn
        )
    }
}
```

## Security Implications

### Private Rooms
- Require authentication
- Verify participant membership
- No public access

### Public Rooms (Future Considerations)
- May allow read-only access without auth
- Could have different permission levels
- Potential for link-based sharing

## Migration Notes

- All existing rooms have been set to `isPublic: false` (private)
- No action needed for existing rooms unless you want to make them public
- The field is included in all room responses immediately

## Future Roadmap Possibilities

1. **Public Room Discovery**
   - Browse/search public rooms
   - Trending public rooms
   - Categories/tags for public rooms

2. **Link Sharing**
   - Generate shareable links for public rooms
   - QR codes for easy joining
   - Deep linking support

3. **Permission Levels**
   - View-only access for non-participants in public rooms
   - Contributor vs viewer roles
   - Moderation tools for public rooms

4. **Privacy Controls**
   - Room passwords
   - Allowlist/blocklist for public rooms
   - Time-limited public access

## Testing Scenarios

1. Create new room → Verify `isPublic: false`
2. Toggle room to public → Verify all participants receive socket event
3. Non-creator tries to change visibility → Should fail with 403
4. Refresh room list → Public/private status persists
5. Join public room (future) → Different flow than private room

The backend is ready for this feature. Start with basic display of public/private status, then add creator controls for toggling visibility.