# Room Snapshot API Documentation

## Overview
The room snapshot feature allows iOS clients to upload visual thumbnails of rooms to display in the room grid view. Snapshots are resized to 600px width (maintaining aspect ratio) and stored in Cloudinary.

## Database Changes
- Added `snapshot` field to Room model (stored as `snapshot_url` in database)
- Field is nullable - rooms without snapshots should display a white placeholder

## API Endpoint

### Upload Room Snapshot
```
POST /api/upload/room/:roomId/snapshot
Authorization: Bearer <token>
Content-Type: multipart/form-data

Form data:
- snapshot: <image file>

Response:
{
  "data": {
    "snapshotUrl": "https://res.cloudinary.com/..."
  }
}
```

## iOS Implementation Guide

### When to Upload Snapshots

To ensure snapshots are always current while minimizing conflicts:

1. **When joining a room** - Upload snapshot after room loads
2. **When leaving a room** - Upload snapshot before disconnecting
3. **Optional: After significant changes** - After adding multiple elements

This approach ensures:
- New users see the current state when browsing rooms
- The last person to leave captures the final state
- If someone's app crashes, the next person to open the room will update the snapshot
- No complex coordination needed between multiple users

### Implementation Example
```swift
// In RoomViewController
override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    
    // Upload snapshot after room loads (with small delay for content to render)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
        self.captureAndUploadSnapshot()
    }
}

override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    
    // Upload snapshot when leaving room
    if isMovingFromParent || isBeingDismissed {
        captureAndUploadSnapshot()
    }
}

func captureAndUploadSnapshot() {
    // 1. Capture screenshot of the canvas
    let renderer = UIGraphicsImageRenderer(bounds: canvasView.bounds)
    let screenshot = renderer.image { ctx in
        canvasView.layer.render(in: ctx.cgContext)
    }
    
    // 2. Upload in background (don't block UI)
    MediaUploader.shared.uploadRoomSnapshot(
        roomId: roomId,
        image: screenshot
    ) { result in
        switch result {
        case .success(let snapshotUrl):
            print("Snapshot uploaded: \(snapshotUrl)")
        case .failure(let error):
            print("Snapshot upload failed: \(error)")
            // Don't show error to user - snapshots are non-critical
        }
    }
}

// In MediaUploader
func uploadRoomSnapshot(roomId: String, image: UIImage, completion: @escaping (Result<String, Error>) -> Void) {
    guard let url = URL(string: "\(APIConfig.baseURL)/api/upload/room/\(roomId)/snapshot") else {
        completion(.failure(APIError.invalidURL))
        return
    }
    
    guard let imageData = image.jpegData(compressionQuality: 0.8) else {
        completion(.failure(APIError.invalidData))
        return
    }
    
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    
    if let token = AuthManager.shared.getAccessToken() {
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    }
    
    let boundary = UUID().uuidString
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    
    var body = Data()
    body.append("--\(boundary)\r\n".data(using: .utf8)!)
    body.append("Content-Disposition: form-data; name=\"snapshot\"; filename=\"snapshot.jpg\"\r\n".data(using: .utf8)!)
    body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
    body.append(imageData)
    body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
    
    request.httpBody = body
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        // Handle response...
    }.resume()
}
```

### Displaying Snapshots in Room Grid
```swift
// In your room cell
if let snapshotUrl = room.snapshot {
    snapshotImageView.sd_setImage(
        with: URL(string: snapshotUrl),
        placeholderImage: UIImage(named: "room_placeholder")
    )
} else {
    snapshotImageView.image = UIImage(named: "room_placeholder")
    snapshotImageView.backgroundColor = .white
}
```

## Response Updates
All room responses now include the `snapshot` field:
- `GET /api/rooms/:id` - Single room details
- `GET /api/rooms/grouped-by-person` - Room list grouped by person
- `POST /api/rooms` - Room creation response
- `PUT /api/rooms/:id/name` - Room rename response

## Best Practices
1. **Compression**: Use JPEG compression (0.7-0.8 quality) to reduce upload size
2. **Timing**: Avoid uploading too frequently - batch updates when possible
3. **Error Handling**: Snapshot upload failures shouldn't block user actions
4. **Caching**: Use image caching libraries (SDWebImage) for displaying snapshots
5. **Placeholder**: Always have a clean white placeholder for rooms without snapshots

## Technical Details
- Snapshots are resized to 600px width server-side
- Aspect ratio is maintained
- Stored in Cloudinary under `room-snapshots` folder
- JPEG format with 85% quality
- Old snapshots are not automatically deleted (Cloudinary handles storage)