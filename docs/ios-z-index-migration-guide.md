# iOS Z-Index Migration Guide

## Overview

This guide covers the changes needed in the iOS app to support z-index layering for room elements. Elements now maintain a proper stacking order, with the ability to bring elements to the front when tapped.

## 1. Data Model Updates

### Element Model
Add a `zIndex` property to your Element model:

```swift
struct Element: Codable {
    let id: String
    let type: ElementType
    let positionX: Double
    let positionY: Double
    let width: Double
    let height: Double
    let content: String?
    let imageUrl: String?
    let audioUrl: String?
    let videoUrl: String?
    let thumbnailUrl: String?
    let duration: Double?
    let rotation: Double
    let scaleX: Double
    let scaleY: Double
    let stickerText: String?
    let zIndex: Int  // NEW: Layer order (higher = on top)
    let createdBy: String
    let createdAt: Date
    let creator: User
    // ... other properties
}
```

## 2. Rendering Updates

### Sort Elements by Z-Index
When rendering elements on the canvas, sort them by z-index first:

```swift
class RoomCanvasView: UIView {
    var elements: [Element] = [] {
        didSet {
            // Sort elements by z-index before rendering
            elements.sort { $0.zIndex < $1.zIndex }
            setNeedsDisplay()
        }
    }
    
    override func draw(_ rect: CGRect) {
        // Elements are already sorted by z-index
        for element in elements {
            drawElement(element)
        }
    }
}
```

### Alternative: Using CALayer
If using CALayer for elements, set the zPosition:

```swift
func addElementLayer(_ element: Element) {
    let layer = CALayer()
    // ... configure layer properties
    layer.zPosition = CGFloat(element.zIndex)
    canvasLayer.addSublayer(layer)
}
```

## 3. Socket Event Updates

### Handle New Socket Events

#### Incoming: `element:z-index-changed`
```swift
socket.on("element:z-index-changed") { data, ack in
    guard let payload = data.first as? [String: Any],
          let elementId = payload["elementId"] as? String,
          let newZIndex = payload["zIndex"] as? Int else { return }
    
    // Update local element z-index
    if let index = self.elements.firstIndex(where: { $0.id == elementId }) {
        self.elements[index].zIndex = newZIndex
        
        // Re-sort and re-render
        self.elements.sort { $0.zIndex < $1.zIndex }
        self.canvasView.setNeedsDisplay()
    }
}
```

#### Outgoing: `element:bring-to-front`
When user taps an element to select it:

```swift
func handleElementTap(_ element: Element) {
    // Bring element to front
    // IMPORTANT: Data must be sent as a dictionary/object
    let data: [String: Any] = [
        "roomId": currentRoomId,
        "elementId": element.id
    ]
    
    socket.emit("element:bring-to-front", data)
    
    // Optional: Optimistically update local state
    // (server will broadcast the actual z-index change)
}

// Or more explicitly:
func bringElementToFront(roomId: String, elementId: String) {
    guard !roomId.isEmpty, !elementId.isEmpty else {
        print("Error: roomId or elementId is empty")
        return
    }
    
    socket.emit("element:bring-to-front", [
        "roomId": roomId,
        "elementId": elementId
    ])
}
```

### Updated Events
All element-related events now include z-index:

```swift
// When receiving element:created
socket.on("element:created") { data, ack in
    guard let payload = data.first as? [String: Any],
          let element = payload["element"] as? [String: Any] else { return }
    
    let newElement = Element(
        // ... other properties
        zIndex: element["zIndex"] as? Int ?? 0
    )
    
    self.elements.append(newElement)
    self.elements.sort { $0.zIndex < $1.zIndex }
}

// When receiving element:updated (now includes z-index)
socket.on("element:updated") { data, ack in
    guard let payload = data.first as? [String: Any],
          let elementId = payload["elementId"] as? String,
          let updates = payload["updates"] as? [String: Any] else { return }
    
    if let index = self.elements.firstIndex(where: { $0.id == elementId }) {
        // Update element properties
        if let x = updates["positionX"] as? Double { self.elements[index].positionX = x }
        if let y = updates["positionY"] as? Double { self.elements[index].positionY = y }
        if let zIndex = updates["zIndex"] as? Int { 
            self.elements[index].zIndex = zIndex
            // Re-sort when z-index changes
            self.elements.sort { $0.zIndex < $1.zIndex }
        }
        // ... other properties
    }
}

// When receiving element:transformed (includes z-index)
socket.on("element:transformed") { data, ack in
    guard let payload = data.first as? [String: Any],
          let element = payload["element"] as? [String: Any] else { return }
    
    if let index = self.elements.firstIndex(where: { $0.id == element["id"] as? String }) {
        // Update all transform properties including z-index
        self.elements[index].zIndex = element["zIndex"] as? Int ?? self.elements[index].zIndex
        // ... update other properties
        self.elements.sort { $0.zIndex < $1.zIndex }
    }
}

// When receiving elements:batch
socket.on("elements:batch") { data, ack in
    guard let payload = data.first as? [String: Any],
          let elements = payload["elements"] as? [[String: Any]] else { return }
    
    self.elements = elements.compactMap { elementData in
        Element(
            // ... parse properties
            zIndex: elementData["zIndex"] as? Int ?? 0
        )
    }
    
    // Elements from server are already sorted by z-index
    self.canvasView.setNeedsDisplay()
}
```

## 4. Interaction Handling

### Automatic Bring-to-Front Behavior
The server automatically brings elements to the front when they are:
- **Moved** (via `element:update` with position changes)
- **Transformed** (via `element:transform` with scale/rotation changes)
- **Explicitly tapped** (via `element:bring-to-front` emission)

This ensures that interacted elements naturally appear on top without requiring explicit z-index management on every interaction.

### Tap to Bring Forward
Implement tap gesture to bring elements to front:

```swift
@objc func handleTapGesture(_ gesture: UITapGestureRecognizer) {
    let location = gesture.location(in: canvasView)
    
    // Find tapped element (iterate in reverse for top-most element)
    for element in elements.reversed() {
        if elementContainsPoint(element, point: location) {
            // Bring to front
            socket.emit("element:bring-to-front", [
                "roomId": currentRoomId,
                "elementId": element.id
            ])
            
            // Select element for editing/moving
            selectedElement = element
            break
        }
    }
}
```

### Visual Feedback
Consider showing z-index feedback:

```swift
func showElementSelected(_ element: Element) {
    // Add selection border
    let selectionLayer = CAShapeLayer()
    selectionLayer.path = UIBezierPath(rect: element.bounds).cgPath
    selectionLayer.fillColor = UIColor.clear.cgColor
    selectionLayer.strokeColor = UIColor.systemBlue.cgColor
    selectionLayer.lineWidth = 2
    selectionLayer.lineDashPattern = [5, 5]
    selectionLayer.zPosition = CGFloat(element.zIndex) + 0.1
    canvasLayer.addSublayer(selectionLayer)
}
```

## 5. API Response Updates

### GET /api/rooms/:id/elements
Elements are now returned sorted by z-index:

```swift
struct ElementsResponse: Codable {
    let data: [Element]  // Already sorted by zIndex ascending
}
```

### Room Join Response
When joining a room, elements in both `element:created` and `elements:batch` events include z-index.

## 6. Migration Checklist

- [ ] Update Element model to include `zIndex: Int`
- [ ] Update element rendering to respect z-index order
- [ ] Add handler for `element:z-index-changed` socket event
- [ ] Implement `element:bring-to-front` emission on tap
- [ ] Update all element parsing to include z-index
- [ ] Test with existing rooms (elements will have sequential z-index)
- [ ] Test creating new elements (should appear on top)
- [ ] Test tapping elements to bring them forward

## 7. Testing Scenarios

1. **Existing Room**: Join a room with existing elements
   - Elements should maintain their original stacking order
   - Older elements behind newer ones

2. **New Elements**: Create new elements
   - New elements should appear on top of existing ones
   - Each new element gets progressively higher z-index

3. **Bring to Front**: Tap elements
   - Tapped element moves to top layer
   - Other users see the change in real-time

4. **Multiple Users**: Test with 2+ users
   - Z-index changes sync across all clients
   - No z-index conflicts or race conditions

## 8. Optimization Tips

1. **Batch Z-Index Updates**: If implementing drag-to-reorder, batch updates
2. **Local Feedback**: Show immediate visual feedback before server confirms
3. **Efficient Sorting**: Keep elements pre-sorted to avoid repeated sorting
4. **Layer Caching**: Cache CALayers by element ID for efficient updates

## 9. Backward Compatibility

- Existing elements have been migrated to have sequential z-index values
- The server ensures no duplicate z-index values within a room
- Default z-index is 0 for any missing values

## 10. Example Implementation

```swift
class RoomViewController: UIViewController {
    var elements: [Element] = []
    var elementLayers: [String: CALayer] = [:]  // Cache layers by element ID
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupSocketHandlers()
        setupGestureRecognizers()
    }
    
    func setupSocketHandlers() {
        // Handle z-index changes
        socket.on("element:z-index-changed") { [weak self] data, _ in
            guard let self = self,
                  let payload = data.first as? [String: Any],
                  let elementId = payload["elementId"] as? String,
                  let zIndex = payload["zIndex"] as? Int else { return }
            
            self.updateElementZIndex(elementId: elementId, zIndex: zIndex)
        }
    }
    
    func updateElementZIndex(elementId: String, zIndex: Int) {
        guard let index = elements.firstIndex(where: { $0.id == elementId }) else { return }
        
        elements[index].zIndex = zIndex
        
        // Update layer z-position
        if let layer = elementLayers[elementId] {
            layer.zPosition = CGFloat(zIndex)
        }
        
        // Re-sort elements array
        elements.sort { $0.zIndex < $1.zIndex }
    }
    
    @objc func handleTap(_ gesture: UITapGestureRecognizer) {
        let point = gesture.location(in: canvasView)
        
        // Find top-most element at point
        if let element = elements.reversed().first(where: { elementContainsPoint($0, point) }) {
            socket.emit("element:bring-to-front", [
                "roomId": currentRoomId,
                "elementId": element.id
            ])
        }
    }
}
```