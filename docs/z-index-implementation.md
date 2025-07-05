# Z-Index Implementation for Room Elements

## Overview

Elements in rooms now support z-index ordering, allowing them to be layered on top of each other. The implementation follows a "last interaction moves to top" approach.

## Database Changes

Added `zIndex` field to the Element model:
```prisma
zIndex     Int       @default(0) @map("z_index") // Layer order (higher = on top)
```

Also added an index for efficient z-order queries:
```prisma
@@index([roomId, zIndex]) // For efficient z-order queries
```

## API Changes

### 1. Element Creation
- New elements automatically get the highest z-index in the room
- Server calculates `newZIndex = (highestExisting + 1)`

### 2. Element Fetching
- `GET /api/rooms/:id/elements` now returns elements ordered by z-index (ascending)
- Elements include `zIndex` field in all responses

### 3. Socket Events

#### Client -> Server: `element:bring-to-front`
Moves an element to the top layer:
```javascript
socket.emit('element:bring-to-front', {
  roomId: 'room-123',
  elementId: 'element-456'
});
```

#### Server -> Client: `element:z-index-changed`
Broadcasted when an element's z-index changes:
```javascript
{
  elementId: 'element-456',
  zIndex: 42
}
```

## Implementation Details

### Creating Elements
1. Query highest z-index in room
2. Assign new element z-index = highest + 1
3. Include z-index in element:created broadcast

### Bringing to Front
1. Get current highest z-index in room
2. Only update if element isn't already on top
3. Broadcast z-index change to all participants

### Rendering Order
- Elements should be rendered in ascending z-index order
- Lower z-index = behind, higher z-index = in front

## iOS Implementation Notes

1. **Tap/Click to Bring Forward**: When user taps an element, emit `element:bring-to-front`
2. **Handle z-index-changed**: Update local element z-index when receiving broadcast
3. **Render Order**: Sort elements by z-index before rendering
4. **Batch Updates**: When receiving `elements:batch`, elements are already sorted by z-index

## Example Flow

1. User taps element → iOS emits `element:bring-to-front`
2. Server updates z-index in database
3. Server broadcasts `element:z-index-changed` to all participants
4. All clients update their local element z-index
5. Clients re-render elements in new order

## Performance Considerations

- Z-index updates are separate from position updates (no unnecessary renders)
- Only elements that aren't already on top trigger database writes
- Indexed on `[roomId, zIndex]` for fast queries

## Handling Existing Elements

When the z-index feature was added:
1. All existing elements received a default z-index of 0
2. A migration script (`scripts/fix-element-zindex.ts`) was created to:
   - Detect rooms with overlapping z-index values
   - Reassign sequential z-index values based on creation order
   - Ensure no duplicate z-index values within a room

To run the fix script:
```bash
npx ts-node scripts/fix-element-zindex.ts
```

This ensures all existing elements have proper layering based on when they were created.