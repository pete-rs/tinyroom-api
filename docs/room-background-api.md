# Room Background API Documentation

## Overview

Rooms can have custom backgrounds - either a solid color or an image. Any room participant can change the background.

## Database Schema

Added to Room model:
```prisma
backgroundColor String? @map("background_color") // Hex color (e.g., "#FFFFFF")
backgroundImageUrl String? @map("background_image_url") // Full-size image URL
backgroundImageThumbUrl String? @map("background_image_thumb_url") // 400px thumbnail
```

## API Endpoints

### 1. Upload Background Image

**Endpoint:** `POST /api/upload/background`  
**Auth:** Required  
**Content-Type:** `multipart/form-data`  
**Field Name:** `background`  
**Max Size:** 10MB  

**Response:**
```json
{
  "data": {
    "backgroundImageUrl": "https://res.cloudinary.com/...",
    "backgroundImageThumbUrl": "https://res.cloudinary.com/.../w_400..."
  }
}
```

**Notes:**
- Full-size image is optimized with `quality: auto:good`
- Thumbnail is 400px wide with `quality: auto:low` for fast loading
- Supports JPEG, PNG, GIF, WebP formats

### 2. Update Room Background

**Endpoint:** `PUT /api/rooms/:roomId/background`  
**Auth:** Required (must be room participant)  

**Request Body:**
```json
{
  "backgroundColor": "#FF6B6B",
  "backgroundImageUrl": "https://res.cloudinary.com/...",
  "backgroundImageThumbUrl": "https://res.cloudinary.com/.../w_400..."
}
```

**Notes:**
- All fields are optional
- Background color and image are **mutually exclusive**:
  - Setting `backgroundColor` automatically clears image fields
  - Setting `backgroundImageUrl` or `backgroundImageThumbUrl` automatically clears `backgroundColor`
- `backgroundColor` must be valid hex color (e.g., "#FFFFFF")
- New rooms default to white background (#FFFFFF)

**Response:**
```json
{
  "data": {
    "id": "room-123",
    "backgroundColor": "#FF6B6B",
    "backgroundImageUrl": null,
    "backgroundImageThumbUrl": null
  }
}
```

### 3. Get Room (includes background)

**Endpoint:** `GET /api/rooms/:roomId`  
**Auth:** Required  

The room response now includes:
```json
{
  "data": {
    "id": "room-123",
    "name": "My Room",
    "backgroundColor": "#FF6B6B",
    "backgroundImageUrl": "https://...",
    "backgroundImageThumbUrl": "https://...",
    // ... other room fields
  }
}
```

## Socket Events

### Server -> Client Events

#### `room:background`
Sent when joining a room that has a background:
```javascript
{
  backgroundColor: "#FF6B6B",
  backgroundImageUrl: "https://...",
  backgroundImageThumbUrl: "https://..."
}
```

#### `room:background-changed`
Broadcast when background is updated via API:
```javascript
{
  roomId: "room-123",
  backgroundColor: "#FF6B6B",
  backgroundImageUrl: null,
  backgroundImageThumbUrl: null,
  changedBy: "user-456"
}
```

## iOS Implementation Guide

### 1. Upload Flow

```swift
// 1. Select image from photo library
func selectBackgroundImage() {
    let picker = UIImagePickerController()
    picker.sourceType = .photoLibrary
    present(picker, animated: true)
}

// 2. Upload to server
func uploadBackgroundImage(_ image: UIImage) {
    let url = "\(API_BASE)/api/upload/background"
    
    AF.upload(
        multipartFormData: { formData in
            if let imageData = image.jpegData(compressionQuality: 0.8) {
                formData.append(
                    imageData,
                    withName: "background",
                    fileName: "background.jpg",
                    mimeType: "image/jpeg"
                )
            }
        },
        to: url,
        headers: ["Authorization": "Bearer \(token)"]
    ).responseJSON { response in
        // Parse backgroundImageUrl and backgroundImageThumbUrl
    }
}

// 3. Update room background (mutually exclusive)
func setBackgroundColor(_ color: String) {
    let url = "\(API_BASE)/api/rooms/\(roomId)/background"
    
    // Only send color - server will clear image
    let params = ["backgroundColor": color]
    
    AF.request(url, method: .put, parameters: params, headers: headers)
        .responseJSON { response in
            // Handle success
        }
}

func setBackgroundImage(imageUrl: String, thumbUrl: String) {
    let url = "\(API_BASE)/api/rooms/\(roomId)/background"
    
    // Only send image URLs - server will clear color
    let params = [
        "backgroundImageUrl": imageUrl,
        "backgroundImageThumbUrl": thumbUrl
    ]
    
    AF.request(url, method: .put, parameters: params, headers: headers)
        .responseJSON { response in
            // Handle success
        }
}

func clearBackground() {
    let url = "\(API_BASE)/api/rooms/\(roomId)/background"
    
    // Send empty object to clear all backgrounds
    let params: [String: String] = [:]
    
    AF.request(url, method: .put, parameters: params, headers: headers)
        .responseJSON { response in
            // Handle success
        }
}
```

### 2. Rendering

```swift
class RoomView: UIView {
    var backgroundImageView: UIImageView?
    
    func setBackground(color: String?, imageUrl: String?, thumbUrl: String?) {
        // Clear existing background
        backgroundImageView?.removeFromSuperview()
        backgroundImageView = nil
        
        // Priority: Image > Color > Default White
        if let thumbUrl = thumbUrl, !thumbUrl.isEmpty {
            // Image background takes priority
            backgroundColor = .white // Clear any color
            
            backgroundImageView = UIImageView(frame: bounds)
            backgroundImageView?.contentMode = .scaleAspectFill
            backgroundImageView?.clipsToBounds = true
            insertSubview(backgroundImageView!, at: 0)
            
            // Load thumbnail first
            backgroundImageView?.loadImage(from: thumbUrl)
            
            // Then load full image if available
            if let fullUrl = imageUrl, !fullUrl.isEmpty {
                backgroundImageView?.loadImage(from: fullUrl)
            }
        } else if let colorHex = color, !colorHex.isEmpty {
            // Color background (no image)
            backgroundColor = UIColor(hex: colorHex)
        } else {
            // Default white background
            backgroundColor = .white
        }
    }
}
```

### 3. Socket Handling

```swift
// When joining room
socket.on("room:background") { data, _ in
    guard let payload = data.first as? [String: Any] else { return }
    
    let backgroundColor = payload["backgroundColor"] as? String
    let backgroundImageUrl = payload["backgroundImageUrl"] as? String
    let backgroundImageThumbUrl = payload["backgroundImageThumbUrl"] as? String
    
    self.roomView.setBackground(
        color: backgroundColor,
        imageUrl: backgroundImageUrl,
        thumbUrl: backgroundImageThumbUrl
    )
}

// When background changes
socket.on("room:background-changed") { data, _ in
    guard let payload = data.first as? [String: Any] else { return }
    
    let backgroundColor = payload["backgroundColor"] as? String
    let backgroundImageUrl = payload["backgroundImageUrl"] as? String
    let backgroundImageThumbUrl = payload["backgroundImageThumbUrl"] as? String
    
    self.roomView.setBackground(
        color: backgroundColor,
        imageUrl: backgroundImageUrl,
        thumbUrl: backgroundImageThumbUrl
    )
}
```

## Best Practices

1. **Image Loading**: 
   - Load thumbnail first for immediate display
   - Load full image in background
   - Cache images locally

2. **Image Size**:
   - Compress images before upload (0.8 quality recommended)
   - Maximum 10MB file size
   - Consider device screen size when selecting images

3. **Performance**:
   - Use thumbnail (400px) for room previews
   - Only load full image when room is active
   - Consider lazy loading for room lists

4. **UI/UX**:
   - Show loading indicator during upload
   - Allow users to clear background (set to null)
   - Preview before saving
   - All room participants see background options

## Example Color Palette

```swift
let backgroundColors = [
    "#FFFFFF", // White (default)
    "#F8F9FA", // Light Gray
    "#E9ECEF", // Gray
    "#FFF5F5", // Light Red
    "#FFF0F6", // Light Pink
    "#F8F0FF", // Light Purple
    "#F0F1FF", // Light Blue
    "#E3FAFC", // Light Cyan
    "#E6FCF5", // Light Teal
    "#EBFBEE", // Light Green
    "#FFF9DB", // Light Yellow
    "#FFF4E6", // Light Orange
]
```