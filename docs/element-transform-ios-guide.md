# iOS Element Transform Integration Guide

## Overview
The backend now fully supports rotation and scale for ALL element types. iOS can test with notes first while keeping other elements at default values (rotation: 0, scale: 1).

## What's New in the Backend

### Database Fields Added
- `rotation`: Float (degrees 0-360, default: 0)
- `scaleX`: Float (scale factor, default: 1) 
- `scaleY`: Float (scale factor, default: 1)

### Socket Events

#### 1. Creating Elements
All element types now accept transform properties:
```json
socket.emit("element:create", {
  "roomId": "room-123",
  "type": "note",
  "positionX": 100,
  "positionY": 200,
  "width": 150,
  "height": 100,
  "content": "Hello World",
  "rotation": 45,    // Optional, default: 0
  "scaleX": 1.5,     // Optional, default: 1
  "scaleY": 1.5      // Optional, default: 1
})
```

#### 2. Live Transform Preview (During Gesture)
```json
socket.emit("element:transforming", {
  "roomId": "room-123",
  "elementId": "element-456",
  "transform": {
    "rotation": 45,
    "scaleX": 1.5,
    "scaleY": 1.5
  }
})
```

#### 3. Final Transform (When Gesture Ends)
```json
socket.emit("element:transform", {
  "roomId": "room-123",
  "elementId": "element-456",
  "positionX": 100,
  "positionY": 200,
  "width": 225,      // Original width * scaleX
  "height": 150,     // Original height * scaleY
  "transform": {
    "rotation": 45,
    "scaleX": 1.5,
    "scaleY": 1.5
  }
})
```

#### 4. Receiving Transform Updates
```json
// Preview updates (no DB write)
socket.on("element:transforming", { 
  "elementId": "element-456",
  "userId": "user-789",
  "transform": { "rotation": 45, "scaleX": 1.5, "scaleY": 1.5 }
})

// Final updates (saved to DB)
socket.on("element:transformed", {
  "element": {
    "id": "element-456",
    "type": "note",
    "positionX": 100,
    "positionY": 200,
    "width": 225,
    "height": 150,
    "rotation": 45,
    "scaleX": 1.5,
    "scaleY": 1.5
  }
})
```

## iOS Testing Strategy

### Phase 1: Notes Only
1. Add gesture recognizers ONLY to note elements
2. Leave all other elements with default transforms
3. Test thoroughly:
   - Pinch to scale
   - Rotate gesture
   - Combined pinch + rotate
   - Multi-user sync

### Phase 2+: Other Elements
Once notes work perfectly, apply same pattern to:
- Photos (consider aspect ratio)
- Audio/Video (minimum scale for controls)
- Other types

## Implementation Example

```swift
// Only add gestures to notes for now
if element.type == .note {
    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
    let rotation = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation))
    element.view.addGestureRecognizer(pinch)
    element.view.addGestureRecognizer(rotation)
}

@objc func handlePinch(_ gesture: UIPinchGestureRecognizer) {
    guard let element = gesture.view?.element else { return }
    
    switch gesture.state {
    case .changed:
        // Send preview
        socket.emit("element:transforming", [
            "roomId": roomId,
            "elementId": element.id,
            "transform": [
                "scaleX": element.originalScaleX * gesture.scale,
                "scaleY": element.originalScaleY * gesture.scale
            ]
        ])
        
    case .ended:
        // Send final
        socket.emit("element:transform", [
            "roomId": roomId,
            "elementId": element.id,
            "positionX": element.position.x,
            "positionY": element.position.y,
            "width": element.originalWidth * element.scaleX,
            "height": element.originalHeight * element.scaleY,
            "transform": [
                "rotation": element.rotation,
                "scaleX": element.scaleX,
                "scaleY": element.scaleY
            ]
        ])
    default:
        break
    }
}
```

## Default Values
For elements without transforms:
- `rotation`: 0 (no rotation)
- `scaleX`: 1 (original size)
- `scaleY`: 1 (original size)

The backend will store these defaults for any element created without transform data.

## Backward Compatibility
- Old iOS clients will continue to work
- Transform fields are optional
- Elements created without transforms get defaults
- Existing elements have been migrated with defaults

## Performance Tips
1. Use `element:transforming` for smooth preview (30-60 Hz)
2. Use `element:transform` only when gesture ends
3. Batch transform updates when possible
4. Consider debouncing rapid gestures