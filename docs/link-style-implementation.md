# Link Style Implementation - iOS Requirements

## Overview
This document describes the backend implementation for Link Styles, which allows users to change the visual appearance of link elements by cycling through different display styles.

## Database Changes

### New Enum: LinkStyle
```prisma
enum LinkStyle {
  default
  clear
  style1
  style2
}
```

### New Field on Element Model
```prisma
linkStyle LinkStyle? @map("link_style") @default(default) // Current link display style
```

## API Endpoints

### 1. Create Link Element
**Endpoint:** Via Socket.io `element:create` event  
**Additional Field:**
- `linkStyle` - (optional) Initial link style, defaults to `default`

**Example:**
```javascript
socket.emit('element:create', {
  roomId: 'room-id',
  type: 'link',
  positionX: 100,
  positionY: 200,
  width: 300,
  height: 100,
  content: 'https://example.com',
  stickerText: 'Custom Label', // Optional
  linkStyle: 'default' // Optional, defaults to 'default'
});
```

### 2. Update Link Style (REST API)
**Endpoint:** `PUT /api/rooms/:roomId/elements/:elementId/link-style`  
**Auth:** Required (must be room participant)  
**Body:**
```json
{
  "linkStyle": "style1"
}
```

**Response:**
```json
{
  "data": {
    "element": {
      "id": "element-id",
      "linkStyle": "style1"
    }
  }
}
```

**Error Cases:**
- 400 INVALID_REQUEST - linkStyle is required
- 400 INVALID_STYLE - Invalid link style value
- 403 FORBIDDEN - Not a room participant
- 404 NOT_FOUND - Link element not found

### 3. Update Link Style (Socket.io)
**Event:** `element:link-style`
```javascript
socket.emit('element:link-style', {
  roomId: 'room-id',
  elementId: 'element-id',
  linkStyle: 'clear'
});
```

**Server Broadcast:**
```javascript
socket.on('element:link-style-changed', (data) => {
  // data = {
  //   elementId: 'element-id',
  //   linkStyle: 'clear',
  //   userId: 'user-who-changed-it'
  // }
});
```

## Element Response Format

All link elements in API responses and socket events now include:
```javascript
{
  id: 'element-id',
  type: 'link',
  content: 'https://example.com',
  stickerText: 'Custom Label',
  linkStyle: 'default', // New field
  // ... other element fields
}
```

This field is included in:
- `POST /api/rooms/:roomId/join` - Room data with elements
- `GET /api/rooms/:roomId` - Room details
- `GET /api/rooms/:roomId/elements` - Elements list
- Socket event `element:created` - When elements are created
- Socket event `elements:batch` - Batch element updates
- Socket event `room:join` - When joining a room

## Style Behavior

### Available Styles
1. **default** - Standard link appearance
2. **clear** - Transparent/minimal style
3. **style1** - Style variant 1
4. **style2** - Style variant 2

### Future Extensibility
The enum is designed to support additional style variants:
- `style3`, `style4`, `style5`, etc. can be added in future

### Default Behavior
- All link elements default to `default` style if not specified
- Only LINK type elements can have linkStyle
- Other element types will have `linkStyle: null`

## iOS Implementation Notes

### Cycling Through Styles
iOS should implement a tap handler that cycles through available styles:
```swift
let availableStyles = ["default", "clear", "style1", "style2"]
let currentIndex = availableStyles.firstIndex(of: element.linkStyle) ?? 0
let nextIndex = (currentIndex + 1) % availableStyles.count
let nextStyle = availableStyles[nextIndex]
```

### Visual Representation
Each style should have distinct visual characteristics:
- **default**: Standard bordered rectangle with background
- **clear**: Minimal/transparent with subtle borders
- **style1**: First style variant (e.g., gradient or colorful background)
- **style2**: Second style variant

### Real-time Updates
1. When user changes style locally:
   - Update UI immediately for responsive feel
   - Send update via Socket.io or REST API
   - Listen for confirmation/broadcast

2. When receiving style changes from others:
   - Update element appearance smoothly
   - Consider animation/transition effects

### State Management
- Store `linkStyle` as part of element data
- Ensure style persists across app restarts
- Handle null/undefined gracefully (treat as 'default')

## Testing

### Test Create with Style
```bash
# Socket.io - use your testing tool to emit:
{
  "event": "element:create",
  "data": {
    "roomId": "ROOM_ID",
    "type": "link",
    "positionX": 100,
    "positionY": 200,
    "width": 300,
    "height": 100,
    "content": "https://example.com",
    "linkStyle": "style1"
  }
}
```

### Test Style Update
```bash
curl -X PUT http://localhost:3000/api/rooms/ROOM_ID/elements/ELEMENT_ID/link-style \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"linkStyle": "clear"}'
```

## Error Handling

- Invalid style values → Show error, keep current style
- Network failures → Retry with exponential backoff
- Conflicting updates → Last write wins
- Missing linkStyle in response → Default to 'default'

## Migration & Compatibility

- Existing link elements will have `linkStyle: null`
- iOS should treat null as 'default' style
- No breaking changes to existing functionality
- Style changes don't affect room activity timestamp