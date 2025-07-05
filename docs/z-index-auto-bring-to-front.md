# Z-Index Auto Bring-to-Front Feature

## Overview

Elements now automatically come to the front (get the highest z-index) when users interact with them. This creates a natural layering behavior where recently interacted elements appear on top.

## Server Changes

### 1. Element Update Handler (`element:update`)
- When an element is moved or its content is updated
- Server checks for the highest z-index in the room
- If the element isn't already on top, it gets a new z-index
- Broadcasts both `element:updated` (with z-index in updates) and `element:z-index-changed`

### 2. Element Transform Handler (`element:transform`)
- When an element is scaled or rotated
- Same bring-to-front logic as element:update
- Broadcasts updated z-index in the transformed element data
- Also emits `element:z-index-changed` if z-index changed

### 3. Explicit Bring-to-Front (`element:bring-to-front`)
- Dedicated handler for explicitly bringing element to front
- Used when tapping an element without moving it
- Only updates z-index if element isn't already on top

## iOS Implementation Requirements

### 1. Handle z-index in element:updated
```swift
socket.on("element:updated") { data, ack in
    // ... existing code
    if let zIndex = updates["zIndex"] as? Int { 
        self.elements[index].zIndex = zIndex
        self.elements.sort { $0.zIndex < $1.zIndex }
        self.updateElementZOrder() // Re-render
    }
}
```

### 2. Handle z-index in element:transformed
```swift
socket.on("element:transformed") { data, ack in
    // ... existing code
    self.elements[index].zIndex = element["zIndex"] as? Int ?? self.elements[index].zIndex
    self.elements.sort { $0.zIndex < $1.zIndex }
    self.updateElementZOrder() // Re-render
}
```

### 3. Optional: Manual bring-to-front
If you want to bring an element to front without moving it (e.g., on tap):
```swift
socket.emit("element:bring-to-front", [
    "roomId": currentRoomId,
    "elementId": element.id
])
```

## Behavior Summary

1. **Move/Drag**: Element automatically comes to front
2. **Transform (Scale/Rotate)**: Element automatically comes to front
3. **Tap (with bring-to-front)**: Element comes to front
4. **Create**: New element gets highest z-index + 1

This creates intuitive layering where:
- Recently interacted elements are naturally on top
- Users don't need to think about layers
- Collaboration feels natural as each user's interactions bring their elements forward

## Performance Notes

- Server only updates z-index if element isn't already on top
- Prevents unnecessary database writes and broadcasts
- Z-index queries are optimized with database index on `[roomId, zIndex]`