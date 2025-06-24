# iOS Reactions Implementation Guide (REST-First)

## Overview
Use REST API for all reaction operations. Socket.io is only for receiving real-time updates.

## Implementation

### 1. Double Tap Handler
```swift
@objc func handleDoubleTap(_ gesture: UITapGestureRecognizer) {
    // 1. Optimistic UI update
    photoView.toggleReaction()
    
    // 2. Call REST API (NOT Socket.io)
    APIClient.shared.toggleReaction(
        roomId: currentRoomId, 
        elementId: element.id
    ) { result in
        switch result {
        case .success(let reactionData):
            // Update with server data
            DispatchQueue.main.async {
                self.updateReactionUI(with: reactionData.elementStats)
            }
        case .failure(let error):
            // Revert optimistic update
            DispatchQueue.main.async {
                photoView.toggleReaction()
            }
        }
    }
}
```

### 2. Socket Listeners (Receive Only)
```swift
// Listen for reactions from OTHER users
socket.on("element:reaction:added") { data in
    guard let elementId = data[0]["elementId"] as? String else { return }
    // Update UI - someone else reacted
    self.updateElementReaction(elementId: elementId, data: data[0])
}

socket.on("element:reaction:removed") { data in
    guard let elementId = data[0]["elementId"] as? String else { return }
    // Update UI - someone else removed reaction
    self.updateElementReaction(elementId: elementId, data: data[0])
}
```

### 3. API Call
```swift
func toggleReaction(roomId: String, elementId: String, completion: @escaping (Result<ReactionData, Error>) -> Void) {
    let url = "\(baseURL)/api/rooms/\(roomId)/elements/\(elementId)/reactions/toggle"
    
    var request = URLRequest(url: URL(string: url)!)
    request.httpMethod = "POST"
    request.setValue("Bearer \(authToken)", forHTTPHeaderField: "Authorization")
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    
    URLSession.shared.dataTask(with: request) { data, response, error in
        // Handle response
    }.resume()
}
```

## Important Notes

1. **DO NOT** emit `element:reaction:toggle` via Socket.io
2. **ALWAYS** use REST API for toggling reactions
3. **ONLY** listen to Socket events for UI updates from other users
4. The REST API will handle:
   - Database updates
   - Broadcasting to other users
   - Push notifications

## Flow Summary

1. User double-taps → REST API call
2. Server updates database
3. Server emits Socket event to all users
4. All clients update UI from Socket event

This ensures:
- Single source of truth (REST API)
- Reliable delivery
- Real-time updates
- No race conditions