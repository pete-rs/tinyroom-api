# iOS Rotation Implementation Guide for Note Elements

## Overview
This guide covers everything iOS developers need to know about storing, retrieving, and working with rotation values for note elements in TouchSync.

## Backend Storage Format

The backend stores rotation as:
- **Type**: Float
- **Unit**: Degrees
- **Range**: 0-360
- **Default**: 0 (no rotation)
- **Direction**: Clockwise positive

```typescript
// What backend sends/expects
{
  "id": "element-123",
  "type": "note",
  "rotation": 45.5,      // Degrees
  "scaleX": 1.0,
  "scaleY": 1.0,
  // ... other fields
}
```

## iOS Implementation Recommendations

### 1. Internal Storage (Use Radians)

```swift
class Element {
    // Store internally as radians for iOS compatibility
    private var _rotation: CGFloat = 0  // Radians
    
    // Computed property for degrees (for server communication)
    var rotationDegrees: CGFloat {
        get { _rotation * 180 / .pi }
        set { _rotation = newValue * .pi / 180 }
    }
    
    // For UI/gestures use radians directly
    var rotation: CGFloat {
        get { _rotation }
        set { _rotation = newValue }
    }
}
```

### 2. Gesture Handling

```swift
@objc func handleRotation(_ gesture: UIRotationGestureRecognizer) {
    guard let element = gesture.view as? ElementView else { return }
    
    switch gesture.state {
    case .began:
        element.initialRotation = element.rotation
        
    case .changed:
        // Gesture provides radians directly
        element.rotation = element.initialRotation + gesture.rotation
        
        // Apply transform locally
        element.transform = CGAffineTransform(rotationAngle: element.rotation)
        
        // Send preview to server (convert to degrees)
        socket.emit("element:transforming", [
            "roomId": roomId,
            "elementId": element.id,
            "transform": [
                "rotation": element.rotationDegrees  // Convert to degrees for server
            ]
        ])
        
    case .ended:
        // Normalize rotation to 0-360 degrees for server
        let normalizedDegrees = element.rotationDegrees.truncatingRemainder(dividingBy: 360)
        let finalDegrees = normalizedDegrees < 0 ? normalizedDegrees + 360 : normalizedDegrees
        
        // Send final value
        socket.emit("element:transform", [
            "roomId": roomId,
            "elementId": element.id,
            "positionX": element.center.x,
            "positionY": element.center.y,
            "width": element.bounds.width,
            "height": element.bounds.height,
            "transform": [
                "rotation": finalDegrees,
                "scaleX": element.scaleX,
                "scaleY": element.scaleY
            ]
        ])
        
    default:
        break
    }
}
```

### 3. Receiving Rotation from Server

```swift
// When receiving element data
socket.on("element:created") { data, _ in
    guard let element = data[0] as? [String: Any] else { return }
    
    let noteView = NoteElementView()
    
    // Server sends degrees, convert to radians for iOS
    if let rotationDegrees = element["rotation"] as? CGFloat {
        noteView.rotation = rotationDegrees * .pi / 180
        noteView.transform = CGAffineTransform(rotationAngle: noteView.rotation)
    }
    
    // Handle other properties...
}

// For transform updates
socket.on("element:transformed") { data, _ in
    guard let payload = data[0] as? [String: Any],
          let element = payload["element"] as? [String: Any],
          let elementId = element["id"] as? String else { return }
    
    if let noteView = self.findElement(byId: elementId) as? NoteElementView {
        if let rotationDegrees = element["rotation"] as? CGFloat {
            // Animate to new rotation
            UIView.animate(withDuration: 0.2) {
                noteView.rotation = rotationDegrees * .pi / 180
                noteView.transform = CGAffineTransform(rotationAngle: noteView.rotation)
            }
        }
    }
}
```

### 4. Complete Element Model

```swift
class NoteElement: Codable {
    let id: String
    let type: String = "note"
    var positionX: CGFloat
    var positionY: CGFloat
    var width: CGFloat
    var height: CGFloat
    var content: String
    
    // Transform properties
    private var _rotationDegrees: CGFloat = 0  // What we store/send
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
    
    // Coding keys for JSON
    enum CodingKeys: String, CodingKey {
        case id, type, positionX, positionY, width, height, content
        case _rotationDegrees = "rotation"  // Maps to "rotation" in JSON
        case scaleX, scaleY
    }
    
    // Convenience for UI
    var rotation: CGFloat {
        get { _rotationDegrees * .pi / 180 }
        set { _rotationDegrees = newValue * 180 / .pi }
    }
}
```

### 5. Applying Transforms to Views

```swift
extension UIView {
    func applyElementTransform(rotation: CGFloat, scaleX: CGFloat, scaleY: CGFloat) {
        // Create transform matrix
        var transform = CGAffineTransform.identity
        
        // Order matters! Scale first, then rotate
        transform = transform.scaledBy(x: scaleX, y: scaleY)
        transform = transform.rotated(by: rotation)  // Radians
        
        self.transform = transform
    }
}

// Usage
noteView.applyElementTransform(
    rotation: element.rotation,      // Radians
    scaleX: element.scaleX,
    scaleY: element.scaleY
)
```

### 6. Handling Edge Cases

```swift
// Normalize rotation to 0-360 degrees
extension CGFloat {
    var normalizedDegrees: CGFloat {
        let degrees = self.truncatingRemainder(dividingBy: 360)
        return degrees < 0 ? degrees + 360 : degrees
    }
    
    var normalizedRadians: CGFloat {
        let radians = self.truncatingRemainder(dividingBy: 2 * .pi)
        return radians < 0 ? radians + 2 * .pi : radians
    }
}

// Snap to 45° increments (optional feature)
extension CGFloat {
    func snappedToAngle(increment: CGFloat = 45) -> CGFloat {
        let degrees = self * 180 / .pi
        let snapped = round(degrees / increment) * increment
        return snapped * .pi / 180
    }
}
```

## Best Practices

### 1. **Always Use Radians Internally**
```swift
// ✅ Good - iOS native
element.transform = CGAffineTransform(rotationAngle: radians)

// ❌ Avoid - Constant conversion
element.transform = CGAffineTransform(rotationAngle: degrees * .pi / 180)
```

### 2. **Convert at API Boundaries**
```swift
// Sending to server
let dataToSend = ["rotation": element.rotation * 180 / .pi]

// Receiving from server  
element.rotation = serverData["rotation"] as? CGFloat ?? 0 * .pi / 180
```

### 3. **Normalize Before Sending**
```swift
// Ensure 0-360 range for server
let normalizedDegrees = rotationDegrees.normalizedDegrees
socket.emit("element:transform", ["rotation": normalizedDegrees])
```

### 4. **Consider Performance**
```swift
// Cache transform for frequent updates
class ElementView: UIView {
    private var cachedTransform = CGAffineTransform.identity
    
    func updateTransform(rotation: CGFloat, scaleX: CGFloat, scaleY: CGFloat) {
        let newTransform = CGAffineTransform.identity
            .scaledBy(x: scaleX, y: scaleY)
            .rotated(by: rotation)
        
        // Only update if changed
        if !cachedTransform.isEqual(to: newTransform) {
            cachedTransform = newTransform
            self.transform = newTransform
        }
    }
}
```

## Quick Reference

### Server → iOS
```swift
// Server sends degrees, convert to radians
let rotationRadians = serverRotationDegrees * .pi / 180
view.transform = CGAffineTransform(rotationAngle: rotationRadians)
```

### iOS → Server
```swift
// iOS uses radians, convert to degrees
let rotationDegrees = gestureRotationRadians * 180 / .pi
socket.emit("rotation", rotationDegrees)
```

### Gesture → Transform
```swift
// Gesture gives radians directly
view.transform = CGAffineTransform(rotationAngle: gesture.rotation)
```

## Testing Rotation Values

```swift
// Test cases to verify correct handling
func testRotationConversion() {
    // 0° = 0 radians
    assert(0.0.degreesToRadians == 0)
    
    // 90° = π/2 radians
    assert(90.0.degreesToRadians ≈ .pi/2)
    
    // 180° = π radians  
    assert(180.0.degreesToRadians ≈ .pi)
    
    // 270° = 3π/2 radians
    assert(270.0.degreesToRadians ≈ 3*.pi/2)
    
    // 360° = 0° (normalized)
    assert(360.0.normalizedDegrees == 0)
    
    // -90° = 270° (normalized)
    assert((-90.0).normalizedDegrees == 270)
}
```

## Summary

1. **Backend**: Stores/expects degrees (0-360)
2. **iOS Internal**: Use radians (0-2π) 
3. **Conversion**: Only at API boundaries
4. **Gestures**: Already provide radians
5. **Transform**: Takes radians directly
6. **Normalize**: Always send 0-360 to server

This approach minimizes conversions and leverages iOS's native radian-based system while maintaining compatibility with the degree-based backend.