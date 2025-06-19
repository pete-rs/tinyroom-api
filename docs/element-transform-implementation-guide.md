# Element Transform Implementation Guide

## Quick Summary
To support pinch-to-resize and rotation, we need to add 5 new fields to elements and update our socket communication.

## 1. Database Changes

### Add to Element Table
```sql
ALTER TABLE "elements" 
ADD COLUMN "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,     -- Degrees (0-360)
ADD COLUMN "scale_x" DOUBLE PRECISION NOT NULL DEFAULT 1,      -- Scale factor
ADD COLUMN "scale_y" DOUBLE PRECISION NOT NULL DEFAULT 1,      -- Scale factor  
ADD COLUMN "origin_x" DOUBLE PRECISION NOT NULL DEFAULT 0.5,   -- Transform origin (0-1)
ADD COLUMN "origin_y" DOUBLE PRECISION NOT NULL DEFAULT 0.5;   -- Transform origin (0-1)
```

### Update Prisma Schema
```prisma
model Element {
  // ... existing fields ...
  
  // Transformation fields
  rotation   Float     @default(0) @map("rotation")     
  scaleX     Float     @default(1) @map("scale_x")      
  scaleY     Float     @default(1) @map("scale_y")      
  originX    Float     @default(0.5) @map("origin_x")   
  originY    Float     @default(0.5) @map("origin_y")   
  
  // ... rest of model ...
}
```

## 2. Socket Communication Changes

### New Events for Smooth Real-time Updates

#### During Gesture (High Frequency)
```typescript
// iOS sends this during pinch/rotate gestures
socket.on('element:transforming', {
  roomId: string;
  elementId: string;
  transform: {
    rotation?: number;    // Current rotation in degrees
    scaleX?: number;      // Current X scale
    scaleY?: number;      // Current Y scale
  }
});

// Server broadcasts to others (no DB write)
socket.to(roomId).emit('element:transforming', {
  elementId: string;
  userId: string;
  transform: {...}
});
```

#### When Gesture Ends (Final Update)
```typescript
// iOS sends this when gesture completes
socket.on('element:transform', {
  roomId: string;
  elementId: string;
  positionX: number;    // Final position
  positionY: number;
  rotation: number;     // Final rotation
  scaleX: number;       // Final scale
  scaleY: number;
  width: number;        // Final computed width
  height: number;       // Final computed height
});

// Server saves to DB and broadcasts
socket.to(roomId).emit('element:transformed', {
  elementId: string;
  updates: {...}
});
```

### Update Existing Events

#### element:create
```typescript
{
  // ... existing fields ...
  rotation?: number;    // Default: 0
  scaleX?: number;      // Default: 1  
  scaleY?: number;      // Default: 1
}
```

#### element:update (for content/position changes)
```typescript
{
  // ... existing fields ...
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}
```

## 3. Performance Strategy

### Two-Phase Updates
1. **Preview Phase**: During gesture, send `element:transforming` events
   - No database writes
   - High frequency (30-60 Hz)
   - Instant visual feedback

2. **Commit Phase**: When gesture ends, send `element:transform` event
   - Write to database
   - Update room timestamp
   - Final synchronization

### Backend Implementation
```typescript
// High-frequency preview (no DB)
socket.on('element:transforming', async (data) => {
  // Just broadcast, no DB write
  socket.to(data.roomId).emit('element:transforming', {
    elementId: data.elementId,
    userId: socket.userId,
    transform: data.transform
  });
});

// Final transform (with DB)
socket.on('element:transform', async (data) => {
  // Update database
  const element = await prisma.element.update({
    where: { id: data.elementId },
    data: {
      positionX: data.positionX,
      positionY: data.positionY,
      rotation: data.rotation,
      scaleX: data.scaleX,
      scaleY: data.scaleY,
      width: data.width,
      height: data.height,
    }
  });
  
  // Update room timestamp
  await prisma.room.update({
    where: { id: data.roomId },
    data: {} // Triggers @updatedAt
  });
  
  // Broadcast final state
  io.to(data.roomId).emit('element:transformed', {
    element: element
  });
});
```

## 4. iOS Integration

### Gesture Handling
```swift
private var transformTimer: Timer?

func handlePinchAndRotation(element: Element, scale: CGFloat, rotation: CGFloat) {
    // Cancel previous timer
    transformTimer?.invalidate()
    
    // Send preview immediately
    socket.emit("element:transforming", [
        "roomId": roomId,
        "elementId": element.id,
        "transform": [
            "scaleX": scale,
            "scaleY": scale,
            "rotation": rotation * 180 / .pi  // Convert to degrees
        ]
    ])
    
    // Debounce final update
    transformTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: false) { _ in
        self.sendFinalTransform(element)
    }
}

func sendFinalTransform(_ element: Element) {
    socket.emit("element:transform", [
        "roomId": roomId,
        "elementId": element.id,
        "positionX": element.position.x,
        "positionY": element.position.y,
        "rotation": element.rotation,
        "scaleX": element.scaleX,
        "scaleY": element.scaleY,
        "width": element.originalWidth * element.scaleX,
        "height": element.originalHeight * element.scaleY
    ])
}
```

### Receiving Updates
```swift
// Preview updates (during gesture)
socket.on("element:transforming") { data in
    // Apply transform without animation for smooth preview
    updateElementTransform(data, animated: false)
}

// Final updates (after gesture)
socket.on("element:transformed") { data in
    // Apply with optional animation for smoothness
    updateElementTransform(data, animated: true)
}
```

## 5. Migration Steps

1. **Add database columns** with defaults (rotation=0, scale=1)
2. **Deploy backend** with new socket handlers
3. **Update iOS** to send transform events
4. **Test** with old clients (should ignore new fields)

## 6. Data Flow Example

```
User pinches element on iOS
↓
iOS: Calculate scale change
↓
iOS: socket.emit('element:transforming', {...})  [30-60 times/second]
↓
Server: Broadcast to other users (no DB write)
↓
Other iOS: Update element visually
↓
User releases pinch
↓
iOS: socket.emit('element:transform', {...})  [Once, final values]
↓
Server: Save to database + broadcast
↓
All clients: Final synchronized state
```

## 7. Important Considerations

- **Rotation**: Store in degrees (0-360), not radians
- **Scale**: Separate X and Y for non-uniform scaling
- **Origin**: Default to center (0.5, 0.5) for natural transforms
- **Bounds**: Consider min/max limits (e.g., scale 0.1-10x)
- **Performance**: Preview events don't hit database
- **Conflicts**: Last-write-wins for simultaneous transforms