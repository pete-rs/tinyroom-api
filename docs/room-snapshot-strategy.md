# Room Snapshot Strategy & Implementation Guide

## Overview
Room snapshots provide visual thumbnails for the room grid view, showing only the content elements (notes, photos, audio) on a clean background. This creates a clean, content-focused preview of each room.

## Snapshot Strategy Algorithm

### Core Principle: "Join-Leave Snapshot Pattern"
```
User A joins room → Snapshot uploaded
User B joins room → Snapshot uploaded  
User A leaves room → Snapshot uploaded
User B leaves room → Snapshot uploaded
```

### Why This Works
1. **Always Current**: When browsing rooms, users see recent snapshots
2. **Self-Healing**: If someone crashes, next visitor updates the snapshot
3. **No Coordination**: No complex multi-user synchronization needed
4. **Minimal Overhead**: Only 2 uploads per user session (join + leave)

## What to Capture

### ✅ INCLUDE in Snapshot:
- Background color/texture
- Note elements (yellow sticky notes)
- Photo elements
- Audio elements (visual representation)
- Element positions and sizes

### ❌ EXCLUDE from Snapshot:
- User avatars/cursors
- Touch indicators
- Room name overlay
- Double-tap menus
- Any UI chrome or controls
- Navigation elements
- Timestamps or metadata

## iOS Implementation

### 1. Create a Clean Snapshot View
```swift
class RoomSnapshotView: UIView {
    // This view only contains elements, no UI overlays
    
    func configureForSnapshot(with elements: [Element]) {
        // Clear any existing content
        subviews.forEach { $0.removeFromSuperview() }
        
        // Add only element views
        for element in elements {
            switch element.type {
            case .note:
                let noteView = createNoteView(element)
                addSubview(noteView)
            case .photo:
                let photoView = createPhotoView(element)
                addSubview(photoView)
            case .audio:
                let audioView = createAudioView(element)
                addSubview(audioView)
            }
        }
    }
    
    private func createNoteView(_ element: Element) -> UIView {
        let noteView = UIView()
        noteView.backgroundColor = .systemYellow
        noteView.frame = CGRect(
            x: element.positionX,
            y: element.positionY,
            width: element.width,
            height: element.height
        )
        
        // Add text content
        let label = UILabel()
        label.text = element.content
        label.numberOfLines = 0
        label.frame = noteView.bounds.insetBy(dx: 8, dy: 8)
        noteView.addSubview(label)
        
        return noteView
    }
    
    // Similar methods for photo and audio views...
}
```

### 2. Capture Clean Snapshot
```swift
extension RoomViewController {
    
    private func captureCleanSnapshot() -> UIImage? {
        // Create a separate view for snapshot
        let snapshotView = RoomSnapshotView(frame: canvasView.bounds)
        snapshotView.backgroundColor = canvasView.backgroundColor
        
        // Configure with current elements only
        snapshotView.configureForSnapshot(with: currentElements)
        
        // Render to image
        let renderer = UIGraphicsImageRenderer(bounds: snapshotView.bounds)
        let image = renderer.image { ctx in
            snapshotView.layer.render(in: ctx.cgContext)
        }
        
        return image
    }
    
    private func uploadSnapshot() {
        guard let snapshot = captureCleanSnapshot() else { return }
        
        // Upload in background, don't block UI
        Task {
            do {
                let url = try await MediaUploader.shared.uploadRoomSnapshot(
                    roomId: roomId,
                    image: snapshot
                )
                print("✅ Snapshot uploaded: \(url)")
            } catch {
                print("❌ Snapshot upload failed: \(error)")
                // Non-critical failure - don't show to user
            }
        }
    }
}
```

### 3. Timing Implementation
```swift
class RoomViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupRoom()
    }
    
    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        
        // Upload snapshot after room renders
        // Delay ensures all elements are loaded
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            self.uploadSnapshot()
        }
    }
    
    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        
        // Only upload when actually leaving (not presenting modals)
        if isMovingFromParent || isBeingDismissed {
            uploadSnapshot()
        }
    }
    
    // Optional: Upload after significant changes
    private var elementChangeCount = 0
    
    func didAddElement(_ element: Element) {
        elementChangeCount += 1
        
        // Upload snapshot every 5 elements added
        if elementChangeCount >= 5 {
            uploadSnapshot()
            elementChangeCount = 0
        }
    }
}
```

### 4. Optimize Upload Performance
```swift
extension MediaUploader {
    
    func uploadRoomSnapshot(roomId: String, image: UIImage) async throws -> String {
        // Pre-compress image client-side to reduce upload time
        guard let compressedData = image.jpegData(compressionQuality: 0.7) else {
            throw UploadError.compressionFailed
        }
        
        // Check size - if too large, reduce quality
        var imageData = compressedData
        var quality: CGFloat = 0.7
        
        while imageData.count > 1_000_000 && quality > 0.3 { // 1MB limit
            quality -= 0.1
            guard let newData = image.jpegData(compressionQuality: quality) else {
                break
            }
            imageData = newData
        }
        
        // Upload to API
        return try await uploadData(
            endpoint: "/api/upload/room/\(roomId)/snapshot",
            data: imageData,
            fieldName: "snapshot"
        )
    }
}
```

## API Reference

### Upload Room Snapshot
```http
POST /api/upload/room/:roomId/snapshot
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body:
- snapshot: <image file>

Response 200:
{
  "data": {
    "snapshotUrl": "https://res.cloudinary.com/..."
  }
}

Response 403:
{
  "error": "Not a participant in this room"
}
```

### Backend Processing
- Resizes to 600px width (maintains aspect ratio)
- Converts to JPEG with 85% quality
- Stores in Cloudinary `room-snapshots` folder
- Updates room.snapshot field in database

## Best Practices

### 1. Performance
- Use background queue for uploads
- Compress images before upload
- Don't block UI operations
- Cache rendered snapshots briefly

### 2. User Experience
- Never show snapshot errors to users
- Don't delay room exit for upload
- Provide white placeholder for missing snapshots
- Update grid view when new snapshots arrive

### 3. Implementation Tips
```swift
// Debounce rapid changes
private let snapshotDebouncer = Debouncer(delay: 2.0)

func scheduleSnapshotUpdate() {
    snapshotDebouncer.debounce {
        self.uploadSnapshot()
    }
}

// Track upload state to prevent duplicates
private var isUploadingSnapshot = false

func uploadSnapshot() {
    guard !isUploadingSnapshot else { return }
    isUploadingSnapshot = true
    
    // Upload logic...
    
    isUploadingSnapshot = false
}
```

## Edge Cases Handled

1. **App Crash**: Next user to open room updates snapshot
2. **Network Failure**: Silent failure, next opportunity will update
3. **Rapid Join/Leave**: Debouncing prevents excessive uploads
4. **Multiple Users**: Each user updates on their join/leave cycle
5. **Empty Rooms**: White background serves as valid snapshot

## Testing Checklist

- [ ] Snapshot excludes all UI overlays
- [ ] Only elements are visible in snapshot
- [ ] Upload triggers on room join (after load)
- [ ] Upload triggers on room leave
- [ ] Failed uploads don't crash or block UI
- [ ] Grid view shows snapshots correctly
- [ ] White placeholder for rooms without snapshots
- [ ] Performance acceptable with many elements