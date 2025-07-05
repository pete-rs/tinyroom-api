# iOS Z-Index Troubleshooting Guide

## Common Issues and Solutions

### 1. "Room undefined" / "Element undefined" Error

**Error Message:**
```
⬆️ [Room undefined] User 6454c7b9-5bf9-426f-8259-6293cc8871b4 bringing element undefined to front
```

**Cause:** The iOS app is not sending the data in the correct format.

**Solution:** Ensure you're sending an object/dictionary with `roomId` and `elementId` properties:

```swift
// ❌ WRONG - Don't send values directly
socket.emit("element:bring-to-front", roomId, elementId)

// ❌ WRONG - Don't send as array
socket.emit("element:bring-to-front", [roomId, elementId])

// ✅ CORRECT - Send as dictionary
socket.emit("element:bring-to-front", [
    "roomId": roomId,
    "elementId": elementId
])
```

### 2. Debugging Socket Emissions

Add logging to verify what you're sending:

```swift
func bringElementToFront(element: ElementView) {
    let data = [
        "roomId": sharedState.currentRoomId,
        "elementId": element.id
    ]
    
    print("📤 Emitting bring-to-front with data: \(data)")
    
    // Verify values are not nil/empty
    guard let roomId = data["roomId"] as? String, !roomId.isEmpty,
          let elementId = data["elementId"] as? String, !elementId.isEmpty else {
        print("❌ Error: roomId or elementId is missing!")
        return
    }
    
    socket.emit("element:bring-to-front", data)
}
```

### 3. Socket.IO Swift Syntax

Different Socket.IO Swift libraries have different syntax. Here are common patterns:

**Socket.IO-Client-Swift (most common):**
```swift
// Single data parameter as dictionary
socket.emit("element:bring-to-front", [
    "roomId": roomId,
    "elementId": elementId
])

// With acknowledgment
socket.emit("element:bring-to-front", [
    "roomId": roomId,
    "elementId": elementId
]) { data in
    print("Server acknowledged: \(data)")
}
```

**Starscream/Other libraries:**
```swift
// May need to JSON encode
let data = ["roomId": roomId, "elementId": elementId]
if let jsonData = try? JSONSerialization.data(withJSONObject: data),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    socket.emit("element:bring-to-front", jsonString)
}
```

### 4. Complete Implementation Example

Here's a complete working example:

```swift
class RoomViewController: UIViewController {
    // Ensure these are properly set
    var currentRoomId: String = ""
    var socket: SocketIOClient!
    
    func setupBringToFront() {
        // For each element view
        noteView.onTap = { [weak self] in
            self?.bringElementToFront(elementId: noteView.id)
        }
    }
    
    func bringElementToFront(elementId: String) {
        // Guard against empty values
        guard !currentRoomId.isEmpty else {
            print("❌ Error: currentRoomId is empty")
            return
        }
        
        guard !elementId.isEmpty else {
            print("❌ Error: elementId is empty")
            return
        }
        
        // Create data dictionary
        let data: [String: Any] = [
            "roomId": currentRoomId,
            "elementId": elementId
        ]
        
        print("📤 Bringing element to front - roomId: \(currentRoomId), elementId: \(elementId)")
        
        // Emit to server
        socket.emit("element:bring-to-front", data)
    }
}
```

### 5. Server-Side Debugging

The server now logs more details. Check for these messages:

```
🔍 [BRING TO FRONT] Raw data received: { roomId: 'room-123', elementId: 'elem-456' }
```

If you see:
```
🔍 [BRING TO FRONT] Raw data received: undefined
```

Then the iOS app is not sending data correctly.

### 6. Testing with cURL

You can test the server directly to ensure it's working:

```bash
# First get a socket.io session (complex with auth)
# Or use a simple Node.js test client:

cat > test-bring-to-front.js << 'EOF'
const io = require('socket.io-client');

const socket = io('http://localhost:3000', {
  auth: {
    token: 'Bearer YOUR_TOKEN_HERE'
  }
});

socket.on('connect', () => {
  console.log('Connected');
  
  // Join room first
  socket.emit('room:join', { roomId: 'YOUR_ROOM_ID' });
  
  // Then bring element to front
  setTimeout(() => {
    socket.emit('element:bring-to-front', {
      roomId: 'YOUR_ROOM_ID',
      elementId: 'YOUR_ELEMENT_ID'
    });
  }, 1000);
});

socket.on('element:z-index-changed', (data) => {
  console.log('Z-index changed:', data);
});

socket.on('error', (error) => {
  console.error('Error:', error);
});
EOF

node test-bring-to-front.js
```

### 7. Check SharedState

Ensure your SharedState or similar state management has the correct room ID:

```swift
// In SharedState or similar
class SharedState: ObservableObject {
    @Published var currentRoomId: String = ""
    
    func joinRoom(_ roomId: String) {
        self.currentRoomId = roomId
        socket.emit("room:join", ["roomId": roomId])
    }
}

// When bringing to front
func bringElementToFront(_ element: ElementView) {
    guard !sharedState.currentRoomId.isEmpty else {
        print("❌ Not in a room!")
        return
    }
    
    socket.emit("element:bring-to-front", [
        "roomId": sharedState.currentRoomId,
        "elementId": element.id
    ])
}
```