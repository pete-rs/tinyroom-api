# Photo Style Switcher - Backend Implementation

## Overview
This document describes the backend implementation for the Photo Style Switcher feature, which allows users to cycle through different photo display styles by tapping on photos. All photos support basic styles (squared, rounded, polaroid), while photos with alpha masks also support cutout styles.

## Database Changes

### New Enum: PhotoStyle
```prisma
enum PhotoStyle {
  squared_photo
  rounded_photo
  polaroid_photo
  cutout
  cutout_white_sticker
  cutout_black_sticker
}
```

### New Fields on Element Model
```prisma
imageAlphaMaskUrl String? @map("image_alpha_mask_url")
imageThumbnailAlphaMaskUrl String? @map("image_thumbnail_alpha_mask_url")
selectedStyle PhotoStyle? @map("selected_style") @default(squared_photo)
```

### Migration
Location: `/prisma/migrations/20250706_add_photo_style_fields/migration.sql`

## API Endpoints

### 1. Upload Photo with Mask
**Endpoint:** `POST /api/upload/photo-with-mask`  
**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Required Fields:**
- `image` - Original photo (JPEG)
- `thumbnail` - Thumbnail (JPEG)

**Optional Fields (when iOS detects an object):**
- `alphaMask` - Alpha mask (PNG grayscale)
- `thumbnailMask` - Thumbnail alpha mask (PNG grayscale)

**Response:**
```json
{
  "data": {
    "imageUrl": "https://res.cloudinary.com/...",
    "imageAlphaMaskUrl": "https://res.cloudinary.com/..." || null,
    "smallThumbnailUrl": "https://res.cloudinary.com/...",
    "imageThumbnailAlphaMaskUrl": "https://res.cloudinary.com/..." || null
  }
}
```

### 2. Update Photo Style
**Endpoint:** `PUT /api/rooms/:roomId/elements/:elementId/photo-style`  
**Auth:** Required (must be room participant)  
**Body:**
```json
{
  "selectedStyle": "cutout"
}
```

**Response:**
```json
{
  "data": {
    "element": {
      "id": "element-id",
      "selectedStyle": "cutout"
    }
  }
}
```

**Error Cases:**
- 400 NO_ALPHA_MASK - Cutout styles require an alpha mask
- 400 INVALID_STYLE - Invalid style value
- 403 FORBIDDEN - Not a room participant
- 404 NOT_FOUND - Element not found

## Socket.io Events

### Client Events

#### element:photo-style
Update photo style in real-time:
```javascript
socket.emit('element:photo-style', {
  roomId: 'room-id',
  elementId: 'element-id',
  selectedStyle: 'cutout_white_sticker'
});
```

#### element:create (enhanced)
Create photo element with optional mask support:
```javascript
socket.emit('element:create', {
  roomId: 'room-id',
  type: 'photo',
  positionX: 100,
  positionY: 200,
  width: 300,
  height: 400,
  imageUrl: 'https://...',
  smallThumbnailUrl: 'https://...',
  imageAlphaMaskUrl: 'https://...' || null,  // null if no object detected
  imageThumbnailAlphaMaskUrl: 'https://...' || null,  // null if no object detected
  selectedStyle: 'squared_photo' // Optional, defaults to squared_photo
});
```

### Server Broadcasts

#### element:photo-style-changed
Broadcast when photo style changes:
```javascript
{
  elementId: 'element-id',
  selectedStyle: 'cutout_white_sticker',
  userId: 'user-id'
}
```

## Element Response Format

All photo element responses include:
```javascript
{
  id: 'element-id',
  type: 'photo',
  // ... other fields ...
  imageUrl: 'https://...',
  smallThumbnailUrl: 'https://...',
  imageAlphaMaskUrl: 'https://...' || null,  // null if no object detected
  imageThumbnailAlphaMaskUrl: 'https://...' || null,  // null if no object detected
  selectedStyle: 'squared_photo',  // current display style
}
```

## Photo Style Behavior

### Photos WITH Alpha Masks
- Support all 6 styles: squared_photo, rounded_photo, polaroid_photo, cutout, cutout_white_sticker, cutout_black_sticker
- iOS cycles through all styles when tapping

### Photos WITHOUT Alpha Masks
- Support only 3 styles: squared_photo, rounded_photo, polaroid_photo
- iOS cycles through non-cutout styles only
- Server rejects attempts to set cutout styles

## Implementation Notes

1. **Style changes don't update room timestamp** - Prevents rooms from reordering when users just change styles
2. **Server validates cutout styles** - Cutout styles require alpha masks
3. **Default style** - All photos default to `squared_photo`
4. **Parallel uploads** - All assets upload simultaneously (masks only if provided)
5. **Cloudinary folder** - Photos upload to `room-photos` folder for consistency with other media types

## Testing

### Test Upload with cURL

**With masks (object detected):**
```bash
curl -X POST http://localhost:3000/api/upload/photo-with-mask \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@photo.jpg" \
  -F "alphaMask=@mask.png" \
  -F "thumbnail=@thumb.jpg" \
  -F "thumbnailMask=@thumb_mask.png"
```

**Without masks (no object detected):**
```bash
curl -X POST http://localhost:3000/api/upload/photo-with-mask \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "image=@photo.jpg" \
  -F "thumbnail=@thumb.jpg"
```

### Test Style Update
```bash
curl -X PUT http://localhost:3000/api/rooms/ROOM_ID/elements/ELEMENT_ID/photo-style \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"selectedStyle": "cutout"}'
```

## Error Handling

- Missing required files → 400 MISSING_FILES (image and thumbnail required)
- Invalid photo style → 400 INVALID_STYLE  
- Cutout style without mask → 400 NO_ALPHA_MASK
- Not room participant → 403 FORBIDDEN
- Element not found → 404 NOT_FOUND
- Upload failure → 500 UPLOAD_FAILED