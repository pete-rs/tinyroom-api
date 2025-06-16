# Link Element Feature Documentation

## Overview
A new element type "LINK" has been added that allows users to share URLs in rooms. The backend stores the URL, while iOS handles fetching and displaying the link preview.

## API Changes

### Element Type
Added `LINK` to the ElementType enum in the database schema.

### Socket Events

#### Creating a Link Element
Use the existing `element:create` socket event:

```javascript
socket.emit('element:create', {
  roomId: 'room-id',
  type: 'link',
  positionX: 100,
  positionY: 200,
  width: 300,      // Recommended: 300-350px
  height: 100,     // Will vary based on preview content
  content: 'https://example.com/article' // The URL
});
```

**Important**: 
- The URL should be stored in the `content` field (same field used for notes)
- Width/height can be adjusted based on your preview design
- iOS is responsible for fetching the link preview metadata

### REST API Endpoint

#### Delete Element
**NEW Endpoint**: `DELETE /api/rooms/:roomId/elements/:elementId`

**Headers**:
- `Authorization: Bearer <token>`

**Response**:
```json
{
  "data": {
    "message": "Element deleted successfully"
  }
}
```

**Error Responses**:
- `401 UNAUTHORIZED`: User not authenticated
- `403 FORBIDDEN`: User is not a participant in the room
- `404 NOT_FOUND`: Element not found
- `500 INTERNAL_ERROR`: Server error

**Note**: This endpoint works for ALL element types, not just links.

## Data Model

Link elements use the existing Element model:
```typescript
{
  id: string;
  roomId: string;
  type: 'link';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  content: string;      // The URL
  createdBy: string;
  createdAt: Date;
  // Other fields (imageUrl, audioUrl, etc.) will be null
}
```

## iOS Implementation Notes

### Creating Link Elements
1. User provides a URL (via paste, share sheet, or manual input)
2. Create the element with type 'link' and URL in content field
3. iOS fetches the link preview using LinkPresentation framework
4. Display the preview in the room

### Link Preview Fetching
```swift
import LinkPresentation

func fetchLinkPreview(for url: URL) {
    let provider = LPMetadataProvider()
    provider.startFetchingMetadata(for: url) { metadata, error in
        // Use metadata.title, metadata.imageProvider, etc.
        // to build your preview UI
    }
}
```

### Display Recommendations
- Show loading state while fetching preview
- Cache preview data to avoid refetching
- Handle errors gracefully (show basic URL if preview fails)
- Consider showing favicon, title, description, and image
- Make the entire element tappable to open the link

### Socket Events
The element will be broadcast to other users via the existing socket events:
- `element:created` - When a new link is added
- `element:updated` - If link position is changed
- `element:deleted` - When link is removed

## Push Notifications
When a link element is added, other participants receive:
- Title: "New Content"
- Message: "{userName} added a link in {roomName}"

## Security Considerations
- URLs are stored as-is without validation
- iOS should validate URLs before opening them
- Consider warning users before opening external links
- No server-side preview fetching to avoid SSRF risks

## Migration Notes
- Existing rooms support links immediately
- No database migration needed (uses existing Element model)
- Backward compatible with older clients (they'll see type 'link' but may not render properly)

## Deployment Notes
After deploying this update:
1. The database migration will run automatically to add the LINK enum value
2. **IMPORTANT**: The server must be restarted after migration to pick up the new Prisma types
3. If you see "Invalid value for argument type. Expected ElementType" errors, restart the server