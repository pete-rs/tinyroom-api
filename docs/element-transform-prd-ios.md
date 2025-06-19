# Product Requirements Document: Element Transform Feature
**Date**: December 17, 2024  
**Version**: 1.0  
**Platform**: iOS (TouchSync)

---

## Executive Summary

This PRD outlines the implementation of pinch-to-resize and rotation capabilities for canvas elements in TouchSync. Users will be able to use standard iOS gestures to transform elements on the shared canvas, creating a more dynamic and expressive collaborative experience.

## Product Vision

Enable users to resize and rotate elements on the canvas using intuitive pinch and rotation gestures, making the collaborative space more flexible and creative while maintaining real-time synchronization across all participants.

## User Stories

### As a TouchSync user:
1. I want to pinch to resize elements so I can emphasize important content
2. I want to rotate elements to create more dynamic layouts
3. I want to see other users' transformations in real-time
4. I want transforms to feel smooth and responsive
5. I want my transformed elements to persist when I leave and return

## Functional Requirements

### Core Features

#### 1. Pinch to Resize
- **Gesture**: Standard UIPinchGestureRecognizer
- **Behavior**: 
  - Scales element from its center point
  - Maintains aspect ratio for photos/media (configurable)
  - Supports non-uniform scaling for notes
- **Constraints**:
  - Minimum scale: 0.1x (10% of original)
  - Maximum scale: 10x (1000% of original)
  - Media elements may have tighter constraints (0.5x - 3x)

#### 2. Rotation
- **Gesture**: Standard UIRotationGestureRecognizer
- **Behavior**:
  - Rotates around element's center
  - Full 360° rotation support
  - No snapping by default (future: optional 90° snapping)
- **Visual**: Smooth rotation without pixelation

#### 3. Combined Gestures
- **Simultaneous**: Pinch and rotate can happen together
- **Natural Feel**: Mimics iOS photo manipulation behavior
- **Transform Origin**: Always element center (0.5, 0.5)

### Real-time Synchronization

#### Preview Phase (During Gesture)
- **Frequency**: 30-60 Hz updates
- **Network**: Send only transform deltas
- **Visual**: Immediate local feedback
- **Others**: See smooth preview of transformation

#### Commit Phase (Gesture End)
- **Action**: Save final transform to server
- **Data**: Complete transform + final dimensions
- **Sync**: All users receive authoritative update

## Technical Architecture

### Backend Support (Already Implemented)

#### Database Schema
```prisma
model Element {
  // ... existing fields ...
  rotation   Float  @default(0)    // Degrees (0-360)
  scaleX     Float  @default(1)    // Horizontal scale
  scaleY     Float  @default(1)    // Vertical scale
}
```

#### Socket Events

**1. Live Preview** (During gesture, no DB write)
```typescript
// iOS sends:
socket.emit('element:transforming', {
  roomId: string,
  elementId: string,
  transform: {
    rotation?: number,    // Degrees
    scaleX?: number,
    scaleY?: number
  }
})

// iOS receives:
socket.on('element:transforming', {
  elementId: string,
  userId: string,
  transform: {...}
})
```

**2. Final Transform** (On gesture end, saves to DB)
```typescript
// iOS sends:
socket.emit('element:transform', {
  roomId: string,
  elementId: string,
  positionX: number,
  positionY: number,
  width: number,      // Final width (original * scaleX)
  height: number,     // Final height (original * scaleY)
  transform: {
    rotation: number,
    scaleX: number,
    scaleY: number
  }
})

// iOS receives:
socket.on('element:transformed', {
  element: {
    id, type, positionX, positionY,
    width, height, rotation, scaleX, scaleY
  }
})
```

### iOS Implementation Requirements

#### 1. Gesture Setup
```swift
class ElementTransformHandler {
    private var initialTransform: Transform?
    private var transformTimer: Timer?
    
    func setupGestures(for element: Element) {
        let pinch = UIPinchGestureRecognizer(
            target: self, 
            action: #selector(handlePinch)
        )
        let rotation = UIRotationGestureRecognizer(
            target: self, 
            action: #selector(handleRotation)
        )
        
        pinch.delegate = self
        rotation.delegate = self
        
        element.view.addGestureRecognizer(pinch)
        element.view.addGestureRecognizer(rotation)
    }
}

// Allow simultaneous gestures
extension ElementTransformHandler: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gesture: UIGestureRecognizer, 
                          shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        return true
    }
}
```

#### 2. Transform Data Model
```swift
struct ElementTransform {
    var rotation: CGFloat = 0      // Radians locally, degrees for server
    var scaleX: CGFloat = 1
    var scaleY: CGFloat = 1
    
    var rotationDegrees: CGFloat {
        rotation * 180 / .pi
    }
}

extension Element {
    var currentTransform: ElementTransform { ... }
    func applyTransform(_ transform: ElementTransform) { ... }
}
```

#### 3. Network Optimization
```swift
class TransformThrottler {
    private var pendingTransform: ElementTransform?
    private var timer: Timer?
    
    func scheduleTransform(_ transform: ElementTransform, isFinal: Bool) {
        if isFinal {
            // Send immediately when gesture ends
            timer?.invalidate()
            sendTransform(transform, isFinal: true)
        } else {
            // Throttle preview updates
            pendingTransform = transform
            timer?.invalidate()
            timer = Timer.scheduledTimer(
                withTimeInterval: 0.016,  // ~60 FPS
                repeats: false
            ) { _ in
                self.sendTransform(transform, isFinal: false)
            }
        }
    }
}
```

## Implementation Phases

### Phase 1: Notes Only (Week 1-2)
**Why Start Here**: 
- Simplest element type
- No aspect ratio constraints
- Text reflows naturally
- Most forgiving for testing

**Success Criteria**:
- ✓ Smooth 60 FPS transforms
- ✓ No text pixelation at any scale
- ✓ Natural gesture feel
- ✓ Reliable multi-user sync

**Implementation**:
```swift
// Only enable for notes initially
if element.type == .note {
    transformHandler.setupGestures(for: element)
}
```

### Phase 2: Photos (Week 3)
**Additional Considerations**:
- Aspect ratio preservation
- Image quality at scale
- Memory management
- Appropriate scale limits (0.2x - 5x)

### Phase 3: Audio/Video (Week 4)
**Additional Considerations**:
- Maintain usable control sizes
- Consider disabling rotation for audio
- Thumbnail scaling for video

### Phase 4: Other Elements (Week 5)
- Horoscopes, links, etc.
- Apply learnings from previous phases

## Design Specifications

### Visual Feedback
1. **During Transform**:
   - Optional: Subtle bounding box
   - Smooth, real-time updates
   - No lag or stuttering

2. **Transform Limits**:
   - Gentle "rubber band" effect at scale limits
   - No hard stops

3. **Other Users' Transforms**:
   - Smooth interpolation
   - Optional: Show user avatar/color during transform

### Performance Requirements
- **Gesture Response**: < 16ms (60 FPS)
- **Network Preview**: 30-60 updates/second
- **Final Commit**: < 100ms to server
- **Memory**: No leaks during rapid transforms

## Edge Cases & Error Handling

### Gesture Conflicts
- Handle simultaneous transforms from multiple users
- Last-write-wins for conflicting updates
- Smooth interpolation between states

### Network Issues
- Queue transforms during disconnection
- Apply when reconnected
- Show connection state if transform fails

### Performance Degradation
- Reduce preview frequency if needed
- Prioritize local user's gestures
- Drop frames rather than queue

## Testing Requirements

### Unit Tests
- Transform calculation accuracy
- Gesture recognizer states
- Network message formatting

### Integration Tests
- Multi-user transform scenarios
- Rapid gesture sequences
- Network failure recovery

### User Testing
- Gesture feels natural
- No motion sickness from others' transforms
- Performance on older devices

## Success Metrics

### Technical Metrics
- Transform FPS: > 55 average
- Network latency: < 100ms p95
- Crash rate: < 0.1%
- Memory stability: No leaks

### User Metrics
- Feature adoption: 80% of users try it
- Engagement: 20% increase in element interactions
- Satisfaction: 4.5+ star rating

## Future Enhancements

### V2 Considerations
1. **Snap to Grid/Angles**: Optional 45°/90° rotation snapping
2. **Transform History**: Undo/redo transforms
3. **Group Transforms**: Transform multiple elements
4. **Transform Presets**: Quick 90° rotate, flip, etc.
5. **3D Transforms**: Perspective transforms

### Advanced Features
- Transform origin customization
- Keyframe animations
- Physics-based interactions
- Transform constraints/guides

## Risk Mitigation

### Technical Risks
1. **Performance on Older Devices**
   - Mitigation: Adjustable quality settings
   - Fallback: Disable preview, show final only

2. **Network Congestion**
   - Mitigation: Adaptive throttling
   - Fallback: Increase preview interval

3. **Memory Pressure**
   - Mitigation: Lazy rendering
   - Fallback: Limit simultaneous transforms

### User Experience Risks
1. **Gesture Learning Curve**
   - Mitigation: Optional tutorial
   - Visual hints on first use

2. **Accidental Transforms**
   - Mitigation: Gesture activation threshold
   - Quick reset option

## Appendix: Technical Details

### Coordinate System
- Origin: Top-left (0,0)
- Rotation: Clockwise positive
- Scale: Multiplicative (1 = original)

### Data Precision
- Position: Integer pixels
- Rotation: Float degrees (0-360)
- Scale: Float (0.1 - 10.0)

### Backward Compatibility
- Old clients see final positions only
- Transform data ignored if not supported
- Graceful degradation

---

## Approval

**Product Owner**: _________________  
**Engineering Lead**: _________________  
**Design Lead**: _________________  
**Date**: _________________