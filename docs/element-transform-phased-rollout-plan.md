# Element Transform Phased Rollout Plan

## Overview
This plan allows iOS to implement transforms gradually, starting with notes and expanding to other element types as each phase is perfected.

## Backend Implementation Strategy

### Option 1: Type-Based Transform Support (Recommended)
Add a configuration to control which element types support transforms:

```typescript
// config/elementTransforms.ts
export const TRANSFORM_ENABLED_TYPES = {
  NOTE: true,      // Phase 1: Enable for notes first
  PHOTO: false,    // Phase 2
  AUDIO: false,    // Phase 3
  VIDEO: false,    // Phase 3
  HOROSCOPE: false,// Phase 4
  LINK: false      // Phase 4
};

// In socket handlers
socket.on('element:transform', async (data) => {
  // Get element to check type
  const element = await prisma.element.findUnique({
    where: { id: data.elementId }
  });
  
  if (!element) {
    socket.emit('error', { message: 'Element not found' });
    return;
  }
  
  // Check if transforms are enabled for this type
  if (!TRANSFORM_ENABLED_TYPES[element.type]) {
    socket.emit('error', { 
      message: `Transforms not yet supported for ${element.type} elements` 
    });
    return;
  }
  
  // Proceed with transform...
});
```

### Option 2: Feature Flag in Database
Add a feature flag to control transforms per element type:

```prisma
model FeatureFlag {
  id          String   @id @default(uuid())
  name        String   @unique
  enabled     Boolean  @default(false)
  metadata    Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  @@map("feature_flags")
}
```

```typescript
// Seed with:
await prisma.featureFlag.create({
  data: {
    name: 'transform_notes',
    enabled: true,
    metadata: { phase: 1 }
  }
});
```

## Phased Rollout Plan

### Phase 1: Notes Only (Week 1-2)
**Why start with notes?**
- Simplest visual element
- No aspect ratio constraints
- Text reflows naturally with scale
- Most forgiving for rotation

**Implementation:**
```typescript
// Backend validates element type
if (element.type !== 'NOTE') {
  // Ignore transform fields for non-notes
  delete data.rotation;
  delete data.scaleX;
  delete data.scaleY;
}
```

**iOS Focus:**
- Perfect gesture recognition
- Smooth transform animations
- Text rendering at different scales
- Rotation with readable text

**Success Criteria:**
- Smooth 60 FPS transforms
- No text pixelation when scaled
- Intuitive gesture handling
- Stable multi-user sync

### Phase 2: Photos (Week 3-4)
**Additional Challenges:**
- Maintain aspect ratio
- Image quality at different scales
- Memory management for large images
- Rotation with proper bounds

**Backend Updates:**
```typescript
TRANSFORM_ENABLED_TYPES.PHOTO = true;

// Add aspect ratio locking
socket.on('element:transform', async (data) => {
  if (element.type === 'PHOTO' && data.scaleX && data.scaleY) {
    // Enforce aspect ratio
    const aspectRatio = element.width / element.height;
    data.scaleY = data.scaleX / aspectRatio;
  }
});
```

**iOS Focus:**
- Aspect ratio constraints during pinch
- Image quality optimization
- Memory efficient scaling
- Smooth photo rotation

### Phase 3: Audio/Video (Week 5-6)
**Additional Challenges:**
- UI controls at different scales
- Playback area calculations
- Thumbnail scaling for video

**Backend Updates:**
```typescript
TRANSFORM_ENABLED_TYPES.AUDIO = true;
TRANSFORM_ENABLED_TYPES.VIDEO = true;

// Special handling for media elements
if (element.type === 'AUDIO' || element.type === 'VIDEO') {
  // Ensure minimum size for controls
  const minScale = 0.5;
  data.scaleX = Math.max(data.scaleX, minScale);
  data.scaleY = Math.max(data.scaleY, minScale);
}
```

**iOS Focus:**
- Scale UI controls appropriately
- Maintain tap targets at small scales
- Handle rotation of media controls

### Phase 4: Horoscope/Links (Week 7)
**Final Polish:**
- Custom elements
- Any special rendering

## Backend API Design for Phased Support

### 1. Element Capabilities Endpoint
```typescript
// GET /api/elements/capabilities
{
  "transformSupport": {
    "NOTE": {
      "enabled": true,
      "minScale": 0.1,
      "maxScale": 10,
      "rotationEnabled": true,
      "aspectRatioLocked": false
    },
    "PHOTO": {
      "enabled": false,  // Will be true in Phase 2
      "minScale": 0.2,
      "maxScale": 5,
      "rotationEnabled": true,
      "aspectRatioLocked": true
    },
    "AUDIO": {
      "enabled": false,
      "minScale": 0.5,
      "maxScale": 2,
      "rotationEnabled": false,  // Maybe disable rotation for audio
      "aspectRatioLocked": true
    }
    // ... other types
  }
}
```

### 2. Graceful Degradation
```typescript
// When creating/updating elements
socket.on('element:create', async (data) => {
  const element = {
    ...data,
    // Only apply transform fields if supported
    rotation: TRANSFORM_ENABLED_TYPES[data.type] ? data.rotation : 0,
    scaleX: TRANSFORM_ENABLED_TYPES[data.type] ? data.scaleX : 1,
    scaleY: TRANSFORM_ENABLED_TYPES[data.type] ? data.scaleY : 1,
  };
  
  // Create element...
});
```

### 3. Migration Helper
```typescript
// Endpoint to check which elements can be transformed
// GET /api/rooms/:id/transformable-elements
{
  "data": {
    "total": 45,
    "transformable": 12,  // Just notes in Phase 1
    "byType": {
      "NOTE": { "count": 12, "transformable": true },
      "PHOTO": { "count": 20, "transformable": false },
      "AUDIO": { "count": 13, "transformable": false }
    }
  }
}
```

## iOS Implementation Strategy

### Phase 1: Note Transform Manager
```swift
protocol ElementTransformable {
    var canTransform: Bool { get }
    var canRotate: Bool { get }
    var aspectRatioLocked: Bool { get }
    var minScale: CGFloat { get }
    var maxScale: CGFloat { get }
}

extension Element: ElementTransformable {
    var canTransform: Bool {
        switch type {
        case .note: return true  // Phase 1
        case .photo: return FeatureFlags.photoTransformEnabled  // Phase 2
        case .audio, .video: return FeatureFlags.mediaTransformEnabled  // Phase 3
        default: return false
        }
    }
    
    var aspectRatioLocked: Bool {
        switch type {
        case .note: return false
        case .photo, .audio, .video: return true
        default: return false
        }
    }
}
```

### Gesture Handler with Type Checking
```swift
class ElementGestureHandler {
    func addGestures(to element: Element) {
        guard element.canTransform else { return }
        
        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
        element.view.addGestureRecognizer(pinch)
        
        if element.canRotate {
            let rotation = UIRotationGestureRecognizer(target: self, action: #selector(handleRotation))
            element.view.addGestureRecognizer(rotation)
        }
    }
}
```

## Testing Strategy per Phase

### Phase 1: Notes Testing
- Text clarity at 0.1x to 10x scale
- Rotation from 0° to 360°
- Multi-line text behavior
- Font rendering optimization
- Memory usage with many transformed notes

### Phase 2: Photos Testing
- Image quality preservation
- Aspect ratio maintenance
- Memory management with large images
- Rotation bounds checking
- Pinch gesture accuracy

### Phase 3: Media Testing
- Control visibility at minimum scale
- Playback area calculations
- Gesture conflicts with media controls
- Performance with playing media

## Success Metrics

### Per Phase Metrics
1. **Stability**: < 0.1% crash rate with transforms
2. **Performance**: Maintain 60 FPS during transforms
3. **Sync**: < 100ms latency for transform sync
4. **Adoption**: 80%+ of users try transforms
5. **Satisfaction**: 90%+ positive feedback

### Rollback Plan
If issues arise in any phase:
1. Disable transforms for problematic element type
2. Keep transforms for stable types
3. Fix issues without affecting working features
4. Re-enable when stable

## Communication Between Teams

### Backend Provides:
- Feature flags endpoint
- Per-type transform capabilities
- Graceful fallbacks
- Clear error messages

### iOS Reports:
- Performance metrics per type
- User feedback
- Bug reports with element types
- Success/failure rates

This phased approach allows iOS to perfect transforms one element type at a time while maintaining stability and user trust.