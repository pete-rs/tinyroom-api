# Element Rotation & Scale Feature Design

## Overview
Adding pinch-to-resize and rotation capabilities to canvas elements requires updates across the database, API, and real-time communication layers.

## 1. Database Schema Changes

### Element Model Updates
```prisma
model Element {
  // Existing fields...
  
  // New transformation fields
  rotation   Float     @default(0) @map("rotation")        // Rotation in degrees (0-360)
  scaleX     Float     @default(1) @map("scale_x")        // Horizontal scale factor
  scaleY     Float     @default(1) @map("scale_y")        // Vertical scale factor
  
  // Optional: Store transform origin for more complex transformations
  originX    Float     @default(0.5) @map("origin_x")     // Transform origin X (0-1, default center)
  originY    Float     @default(0.5) @map("origin_y")     // Transform origin Y (0-1, default center)
  
  // Existing fields...
}
```

### Migration SQL
```sql
-- Add transformation columns
ALTER TABLE "elements" 
ADD COLUMN "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "scale_x" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "scale_y" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN "origin_x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
ADD COLUMN "origin_y" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- Add indexes for potential filtering (optional)
CREATE INDEX "elements_rotation_idx" ON "elements"("rotation");
```

## 2. API Changes

### Element Creation (POST)
```typescript
interface ElementCreateData {
  // Existing fields...
  rotation?: number;   // Default: 0
  scaleX?: number;     // Default: 1
  scaleY?: number;     // Default: 1
  originX?: number;    // Default: 0.5
  originY?: number;    // Default: 0.5
}
```

### Element Update (Socket & REST)
```typescript
interface ElementUpdateData {
  // Existing fields...
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  originX?: number;
  originY?: number;
}
```

## 3. Socket Event Updates

### Real-time Transform Events

#### Option A: Extend Existing Events
```typescript
// Extend existing element:update event
socket.on('element:update', {
  roomId: string;
  elementId: string;
  positionX?: number;
  positionY?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  content?: string;
});
```

#### Option B: Separate Transform Event (Recommended)
```typescript
// New dedicated transform event for performance
socket.on('element:transform', {
  roomId: string;
  elementId: string;
  transform: {
    positionX?: number;
    positionY?: number;
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
    width?: number;      // Final width after scaling
    height?: number;     // Final height after scaling
  };
});

// Broadcast to others
socket.to(roomId).emit('element:transformed', {
  elementId: string;
  transform: TransformData;
  userId: string;  // Who made the transform
});
```

### Live Transform Preview (During Gesture)
```typescript
// For smooth real-time updates during pinch/rotate
socket.on('element:transforming', {
  roomId: string;
  elementId: string;
  transform: TransformData;
  isFinal: boolean;  // true when gesture ends
});
```

## 4. Performance Optimizations

### Debouncing Strategy
```typescript
// Client-side debouncing
const transformDebounce = {
  timer: null,
  lastTransform: null,
  
  update(transform) {
    // Send immediate preview
    socket.emit('element:transforming', {
      ...transform,
      isFinal: false
    });
    
    // Debounce final update
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      socket.emit('element:transform', {
        ...transform,
        isFinal: true
      });
    }, 100);
  }
};
```

### Database Update Strategy
```typescript
// Only persist final transforms to database
socket.on('element:transform', async (data) => {
  if (data.isFinal) {
    // Update database
    await prisma.element.update({
      where: { id: data.elementId },
      data: {
        positionX: data.transform.positionX,
        positionY: data.transform.positionY,
        rotation: data.transform.rotation,
        scaleX: data.transform.scaleX,
        scaleY: data.transform.scaleY,
        width: data.transform.width,
        height: data.transform.height,
      }
    });
  }
  
  // Always broadcast for real-time sync
  socket.to(data.roomId).emit('element:transformed', data);
});
```

## 5. iOS Implementation Guide

### Gesture Recognition
```swift
class ElementTransformGestureHandler {
    private var initialTransform: ElementTransform?
    private var activeElement: Element?
    
    @objc func handlePinchGesture(_ gesture: UIPinchGestureRecognizer) {
        guard let element = activeElement else { return }
        
        switch gesture.state {
        case .began:
            initialTransform = element.currentTransform
            
        case .changed:
            // Calculate new scale
            let newScaleX = initialTransform.scaleX * gesture.scale
            let newScaleY = initialTransform.scaleY * gesture.scale
            
            // Apply transform locally for instant feedback
            element.applyTransform(
                scaleX: newScaleX,
                scaleY: newScaleY
            )
            
            // Send preview update
            socket.emit("element:transforming", [
                "roomId": roomId,
                "elementId": element.id,
                "transform": [
                    "scaleX": newScaleX,
                    "scaleY": newScaleY,
                    "width": element.originalWidth * newScaleX,
                    "height": element.originalHeight * newScaleY
                ],
                "isFinal": false
            ])
            
        case .ended, .cancelled:
            // Send final transform
            socket.emit("element:transform", [
                "roomId": roomId,
                "elementId": element.id,
                "transform": element.currentTransform.toDictionary(),
                "isFinal": true
            ])
            
        default:
            break
        }
    }
    
    @objc func handleRotationGesture(_ gesture: UIRotationGestureRecognizer) {
        guard let element = activeElement else { return }
        
        switch gesture.state {
        case .began:
            initialTransform = element.currentTransform
            
        case .changed:
            // Calculate new rotation in degrees
            let rotationDegrees = initialTransform.rotation + (gesture.rotation * 180 / .pi)
            let normalizedRotation = rotationDegrees.truncatingRemainder(dividingBy: 360)
            
            // Apply transform locally
            element.applyTransform(rotation: normalizedRotation)
            
            // Send preview update
            socket.emit("element:transforming", [
                "roomId": roomId,
                "elementId": element.id,
                "transform": ["rotation": normalizedRotation],
                "isFinal": false
            ])
            
        case .ended, .cancelled:
            // Send final transform
            socket.emit("element:transform", [
                "roomId": roomId,
                "elementId": element.id,
                "transform": element.currentTransform.toDictionary(),
                "isFinal": true
            ])
            
        default:
            break
        }
    }
}
```

### Simultaneous Gestures
```swift
extension ElementTransformGestureHandler: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, 
                          shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        // Allow pinch and rotation at the same time
        return (gestureRecognizer is UIPinchGestureRecognizer && other is UIRotationGestureRecognizer) ||
               (gestureRecognizer is UIRotationGestureRecognizer && other is UIPinchGestureRecognizer)
    }
}
```

## 6. Data Storage Considerations

### Transform Matrix Alternative
Instead of storing individual properties, consider storing a transform matrix:

```prisma
model Element {
  // Alternative: Store as JSON or array
  transform  Json?     @default("[1,0,0,1,0,0]") // [a,b,c,d,e,f] for 2D affine transform
  
  // Or store as separate floats for performance
  transformA Float    @default(1)  // scaleX * cos(rotation)
  transformB Float    @default(0)  // scaleX * sin(rotation)
  transformC Float    @default(0)  // -scaleY * sin(rotation)
  transformD Float    @default(1)  // scaleY * cos(rotation)
  transformE Float    @default(0)  // translateX
  transformF Float    @default(0)  // translateY
}
```

### Recommended Approach
Store individual properties (rotation, scaleX, scaleY) for:
- Easier debugging
- Simpler queries
- Better compatibility
- Clearer API

## 7. Backward Compatibility

### Migration Strategy
1. Add new fields with defaults
2. Existing elements work unchanged (rotation=0, scale=1)
3. Old clients ignore new transform properties
4. New clients handle both old and new elements

### API Versioning
```typescript
// v1 response (existing)
{
  element: {
    id, type, positionX, positionY, width, height, content
  }
}

// v2 response (with transforms)
{
  element: {
    id, type, positionX, positionY, width, height, content,
    rotation: 0,
    scaleX: 1,
    scaleY: 1,
    originX: 0.5,
    originY: 0.5
  }
}
```

## 8. Implementation Priority

### Phase 1: Basic Transform Support
1. Add database fields
2. Update element creation/update APIs
3. Implement basic socket events
4. iOS: Add gesture recognizers

### Phase 2: Performance Optimization
1. Implement transform preview events
2. Add debouncing logic
3. Optimize database writes
4. iOS: Smooth gesture handling

### Phase 3: Advanced Features
1. Transform origin support
2. Aspect ratio locking
3. Rotation snapping (0°, 90°, 180°, 270°)
4. Min/max scale limits

## 9. Testing Considerations

### Edge Cases
- Negative scales (flipping)
- Very small scales (< 0.1)
- Very large scales (> 10)
- Rapid concurrent transforms
- Transform conflicts between users

### Performance Testing
- 50+ elements with active transforms
- Network latency simulation
- Database write frequency
- Memory usage with transform history