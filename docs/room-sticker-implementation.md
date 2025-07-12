# Room Sticker Implementation

## Overview
Rooms can now have a designated "sticker" - a photo or video element from the room that serves as the room's representative image. This sticker can be displayed in the My Rooms feed as a visual identifier for the room.

## Database Changes
- Added `sticker_element_id` field to the `rooms` table
- Foreign key references the `elements` table
- Automatically set to NULL if the referenced element is deleted

## API Endpoints

### 1. Set Room Sticker
Sets a photo or video element as the room's sticker.

**Endpoint:** `PUT /api/rooms/:roomId/sticker`  
**Auth:** Required (Creator only)  
**Body:**
```json
{
  "elementId": "element-uuid-here"
}
```

**Response:**
```json
{
  "data": {
    "roomId": "room-uuid",
    "stickerElement": {
      "id": "element-uuid",
      "type": "PHOTO",
      "positionX": 100,
      "positionY": 200,
      "width": 150,
      "height": 150,
      "rotation": 0,
      "scaleX": 1,
      "scaleY": 1,
      "zIndex": 5,
      "content": null,
      "imageUrl": "https://res.cloudinary.com/...",
      "audioUrl": null,
      "videoUrl": null,
      "thumbnailUrl": null,
      "smallThumbnailUrl": "https://res.cloudinary.com/...",
      "duration": null,
      "stickerText": null,
      "imageAlphaMaskUrl": null,
      "imageThumbnailAlphaMaskUrl": null,
      "selectedStyle": "squared_photo",
      "linkStyle": null,
      "createdAt": "2025-07-10T20:00:00.000Z",
      "updatedAt": "2025-07-10T20:00:00.000Z",
      "createdBy": "user-uuid",
      "creator": {
        "id": "user-uuid",
        "username": "john",
        "firstName": "John",
        "avatarUrl": "https://..."
      }
    }
  }
}
```

**Error Cases:**
- 401 UNAUTHORIZED - Not the room creator
- 404 ROOM_NOT_FOUND - Room doesn't exist
- 404 ELEMENT_NOT_FOUND - Element doesn't exist, isn't in this room, or isn't a photo/video

### 2. Remove Room Sticker
Removes the sticker from a room.

**Endpoint:** `DELETE /api/rooms/:roomId/sticker`  
**Auth:** Required (Creator only)  

**Response:**
```json
{
  "data": {
    "roomId": "room-uuid",
    "stickerElement": null
  }
}
```

**Error Cases:**
- 401 UNAUTHORIZED - Not the room creator
- 404 ROOM_NOT_FOUND - Room doesn't exist

### 3. Get My Rooms (Updated)
The existing `/api/rooms/my-rooms` endpoint now includes the sticker element.

**Endpoint:** `GET /api/rooms/my-rooms`  
**Auth:** Required  

**Response (showing sticker field):**
```json
{
  "data": [
    {
      "id": "room-uuid",
      "name": "Summer Memories",
      // ... other room fields ...
      "stickerElement": {
        "id": "element-uuid",
        "type": "PHOTO",
        "positionX": 100,
        "positionY": 200,
        "width": 150,
        "height": 150,
        "rotation": 15,
        "scaleX": 1.2,
        "scaleY": 1.2,
        "zIndex": 5,
        "content": null,
        "imageUrl": "https://res.cloudinary.com/...",
        "audioUrl": null,
        "videoUrl": null,
        "thumbnailUrl": null,
        "smallThumbnailUrl": "https://res.cloudinary.com/...",
        "duration": null,
        "stickerText": null,
        "imageAlphaMaskUrl": "https://res.cloudinary.com/...",
        "imageThumbnailAlphaMaskUrl": "https://res.cloudinary.com/...",
        "selectedStyle": "cutout",
        "linkStyle": null,
        "createdAt": "2025-07-10T20:00:00.000Z",
        "updatedAt": "2025-07-10T20:00:00.000Z",
        "createdBy": "user-uuid",
        "creator": {
          "id": "user-uuid",
          "username": "john",
          "firstName": "John",
          "avatarUrl": "https://..."
        }
      }
    }
  ]
}
```

## iOS Implementation Guide

### 1. Setting a Sticker
When the room creator long-presses on a photo or video element:

```swift
func setRoomSticker(roomId: String, elementId: String) {
    let url = "\(baseURL)/api/rooms/\(roomId)/sticker"
    let body = ["elementId": elementId]
    
    // PUT request with auth header
    APIClient.shared.put(url, body: body) { result in
        // Handle response
    }
}
```

### 2. Removing a Sticker
When the room creator wants to remove the sticker:

```swift
func removeRoomSticker(roomId: String) {
    let url = "\(baseURL)/api/rooms/\(roomId)/sticker"
    
    // DELETE request with auth header
    APIClient.shared.delete(url) { result in
        // Handle response
    }
}
```

### 3. Displaying Stickers in My Rooms
The sticker element comes with all properties needed to render it:

```swift
if let sticker = room.stickerElement {
    switch sticker.type {
    case "PHOTO":
        // Use smallThumbnailUrl for list views
        imageView.loadImage(from: sticker.smallThumbnailUrl)
        
        // Apply transforms if needed
        imageView.transform = CGAffineTransform(rotationAngle: sticker.rotation * .pi / 180)
            .scaledBy(x: sticker.scaleX, y: sticker.scaleY)
        
        // Handle cutout styles with alpha mask
        if sticker.selectedStyle == "cutout", 
           let maskUrl = sticker.imageThumbnailAlphaMaskUrl {
            // Apply alpha mask
        }
        
    case "VIDEO":
        // Use thumbnailUrl or smallThumbnailUrl
        imageView.loadImage(from: sticker.smallThumbnailUrl ?? sticker.thumbnailUrl)
        // Show video indicator overlay
    }
}
```

## Important Notes

1. **Creator Only**: Only the room creator can set or remove stickers
2. **Photo/Video Only**: Only PHOTO and VIDEO elements can be stickers
3. **Automatic Cleanup**: If a sticker element is deleted, the room's stickerElementId is automatically set to NULL
4. **Full Element Data**: The sticker element includes all properties (transforms, styles, masks) needed for accurate rendering
5. **Performance**: Use `smallThumbnailUrl` for list views, full `imageUrl` only when needed

## Element Properties Reference

The sticker element includes all standard element properties:
- **Position**: positionX, positionY
- **Size**: width, height  
- **Transform**: rotation (degrees), scaleX, scaleY
- **Layer**: zIndex
- **Media URLs**: imageUrl, videoUrl, thumbnailUrl, smallThumbnailUrl
- **Style**: selectedStyle (for photos), linkStyle (not applicable for stickers)
- **Masks**: imageAlphaMaskUrl, imageThumbnailAlphaMaskUrl (for cutout styles)
- **Metadata**: createdAt, updatedAt, creator info