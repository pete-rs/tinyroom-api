# iOS Video Element Feature Implementation Guide

## Overview
A new element type "VIDEO" has been added that allows users to upload and share videos up to 10 seconds long in rooms.

## API Endpoints

### Upload Video
**Endpoint**: `POST /api/upload/video`

**Headers**:
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Form Data**:
- `video`: Video file (required)
- `duration`: Video duration in seconds (optional, will be capped at 10)

**Validation**:
- Max file size: 50MB
- Max duration: 10 seconds (enforced by Cloudinary)
- Supported formats: MP4, MOV, AVI, WebM, M4V

**Response**:
```json
{
  "data": {
    "videoUrl": "https://res.cloudinary.com/dq3yea1ux/video/upload/v.../room-videos/video_xxx.mp4",
    "thumbnailUrl": "https://res.cloudinary.com/dq3yea1ux/video/upload/w_400,h_400,c_fill,g_auto,so_2,f_jpg/v.../room-videos/video_xxx.jpg",
    "duration": 8.5
  }
}
```

**Error Responses**:
- `400 FILE_TOO_LARGE`: Video exceeds 50MB
- `400 INVALID_FILE_TYPE`: Unsupported video format
- `500 UPLOAD_FAILED`: Cloudinary upload error

### Create Video Element
After uploading, create the element using the existing socket event:

```javascript
socket.emit('element:create', {
  roomId: 'room-id',
  type: 'video',
  positionX: 100,
  positionY: 200,
  width: 200,
  height: 150,
  videoUrl: videoUrl,      // From upload response
  thumbnailUrl: thumbnailUrl, // From upload response
  duration: duration       // Video duration in seconds
});
```

## Element Display

### Visual Representation
- Display thumbnail image when video is not playing
- Show play button overlay on thumbnail
- Standard video player controls when playing
- Can be moved/dragged like other elements
- Can be deleted by any participant

### Recommended Dimensions
- Default width: 200-300px
- Height: Calculate based on video aspect ratio
- Maintain aspect ratio to prevent distortion

## Data Structure

### Element Model
```typescript
interface VideoElement {
  id: string;
  type: 'video';
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  videoUrl: string;
  thumbnailUrl: string;
  duration: number;
  createdBy: string;
  createdAt: Date;
}
```

## Implementation Steps

### 1. Video Capture/Selection
```swift
// Configure video picker
let picker = UIImagePickerController()
picker.sourceType = .photoLibrary
picker.mediaTypes = ["public.movie"]
picker.videoMaximumDuration = 10.0 // Enforce 10 second limit locally
picker.videoQuality = .typeMedium // Balance quality vs file size
```

### 2. Video Validation
```swift
func validateVideo(url: URL) -> Bool {
    // Check file size
    let fileSize = try? url.fileSize()
    guard let size = fileSize, size <= 50 * 1024 * 1024 else {
        showError("Video must be less than 50MB")
        return false
    }
    
    // Check duration
    let asset = AVAsset(url: url)
    let duration = CMTimeGetSeconds(asset.duration)
    guard duration <= 10.0 else {
        showError("Video must be 10 seconds or less")
        return false
    }
    
    return true
}
```

### 3. Upload Video
```swift
func uploadVideo(videoURL: URL, completion: @escaping (Result<VideoUploadResponse, Error>) -> Void) {
    var request = URLRequest(url: URL(string: "\(baseURL)/api/upload/video")!)
    request.httpMethod = "POST"
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    
    let formData = MultipartFormData()
    formData.append(videoURL, withName: "video", fileName: "video.mp4", mimeType: "video/mp4")
    
    // Get duration
    let asset = AVAsset(url: videoURL)
    let duration = CMTimeGetSeconds(asset.duration)
    formData.append("\(duration)".data(using: .utf8)!, withName: "duration")
    
    // Upload...
}
```

### 4. Create Element (WITH ASPECT RATIO)
```swift
func createVideoElement(roomId: String, position: CGPoint, videoData: VideoUploadResponse) {
    // IMPORTANT: Calculate height based on video aspect ratio
    let asset = AVURLAsset(url: URL(string: videoData.videoUrl)!)
    let track = asset.tracks(withMediaType: .video).first
    
    let width: CGFloat = 250
    var height: CGFloat = 140 // default
    
    if let track = track {
        let size = track.naturalSize.applying(track.preferredTransform)
        let videoWidth = abs(size.width)
        let videoHeight = abs(size.height)
        let aspectRatio = videoHeight / videoWidth
        height = width * aspectRatio
    }
    
    socket.emit("element:create", [
        "roomId": roomId,
        "type": "video",
        "positionX": position.x,
        "positionY": position.y,
        "width": width,
        "height": height, // Calculated based on aspect ratio!
        "videoUrl": videoData.videoUrl,
        "thumbnailUrl": videoData.thumbnailUrl,
        "duration": videoData.duration
    ])
}
```

### 5. Display Video Element (PRESERVE ASPECT RATIO)
```swift
class VideoElementView: UIView {
    private let thumbnailImageView = UIImageView()
    private let playButton = UIButton()
    private var player: AVPlayer?
    private var playerLayer: AVPlayerLayer?
    
    func configure(with element: VideoElement) {
        // IMPORTANT: Set content mode to preserve aspect ratio
        thumbnailImageView.contentMode = .scaleAspectFit
        thumbnailImageView.backgroundColor = .black // Optional: for letterboxing
        thumbnailImageView.clipsToBounds = true
        
        // Load thumbnail
        thumbnailImageView.sd_setImage(with: URL(string: element.thumbnailUrl))
        
        // Setup play button
        playButton.setImage(UIImage(systemName: "play.circle.fill"), for: .normal)
        
        // Handle tap to play
        playButton.addTarget(self, action: #selector(playVideo), for: .touchUpInside)
    }
    
    @objc private func playVideo() {
        guard let url = URL(string: element.videoUrl) else { return }
        
        player = AVPlayer(url: url)
        playerLayer = AVPlayerLayer(player: player)
        playerLayer?.frame = bounds
        layer.addSublayer(playerLayer!)
        
        player?.play()
        
        // Hide thumbnail and play button
        thumbnailImageView.isHidden = true
        playButton.isHidden = true
        
        // Listen for video end
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(videoDidEnd),
            name: .AVPlayerItemDidPlayToEndTime,
            object: player?.currentItem
        )
    }
    
    @objc private func videoDidEnd() {
        // Reset to thumbnail view
        playerLayer?.removeFromSuperlayer()
        player = nil
        thumbnailImageView.isHidden = false
        playButton.isHidden = false
    }
}
```

## Video Processing Details

### Cloudinary Transformations
The server automatically applies these transformations:
1. **Duration Limit**: Videos are cut to max 10 seconds
2. **Quality Optimization**: Auto quality for optimal file size
3. **Format Optimization**: Auto format selection for device
4. **Thumbnail Generation**: Max 400x400 thumbnail at 2 seconds (aspect ratio preserved)

### Important: Video Dimensions
- **Videos**: Original aspect ratio is preserved (NOT cropped)
- **Thumbnails**: Fit within 400x400 while maintaining aspect ratio

### Thumbnail URL Format
The thumbnail URL is generated from the video URL:
```
video URL: .../video/upload/v123/room-videos/video_xxx.mp4
thumbnail: .../video/upload/w_400,h_400,c_limit,so_2,f_jpg/v123/room-videos/video_xxx.jpg
```
Note: `c_limit` ensures the thumbnail fits within 400x400 without cropping

## Best Practices

### 1. Loading States
- Show upload progress indicator
- Display processing state while Cloudinary processes video
- Show thumbnail placeholder while loading

### 2. Error Handling
- Validate video locally before upload
- Handle network errors gracefully
- Provide clear error messages

### 3. Performance
- Use thumbnail for preview (don't auto-play)
- Preload video when user shows intent to play
- Clean up AVPlayer instances when done

### 4. User Experience
- Allow trimming videos longer than 10 seconds
- Show duration overlay on thumbnail
- Provide video compression options for large files

## Push Notifications
When a video element is added, other participants receive:
- Title: "New Content"
- Message: "{userName} added a video in {roomName}"

## Testing Checklist
- [ ] Video selection from library
- [ ] Video capture from camera
- [ ] 10-second duration enforcement
- [ ] 50MB file size limit
- [ ] Upload progress indication
- [ ] Thumbnail display
- [ ] Video playback
- [ ] Drag and position video element
- [ ] Delete video element
- [ ] Multiple videos in same room
- [ ] Network error handling
- [ ] Video format support (MP4, MOV, etc.)