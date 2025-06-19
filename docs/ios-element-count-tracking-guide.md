# iOS Element Count Tracking Implementation Guide

## Overview
This guide explains how to track and display real-time element counts in MyRooms using global socket events. The backend now broadcasts element events globally to support real-time count updates without requiring users to join rooms.

## Architecture

### Data Flow
1. Initial counts fetched from `/api/rooms/my-rooms`
2. Real-time updates via `element:created` and `element:deleted` socket events
3. Local count management in iOS
4. UI updates triggered by count changes

## Implementation

### 1. Data Model Updates

```swift
// Extend your Room model to track element counts
struct Room: Codable {
    let id: String
    let name: String
    // ... existing fields ...
    
    // Element tracking
    var elementCount: Int = 0        // Total elements
    var unseenElementCount: Int = 0  // From badges.elements
    
    // For UI display
    var displayElementCount: String {
        return elementCount > 99 ? "99+" : "\(elementCount)"
    }
    
    var hasUnseenElements: Bool {
        return unseenElementCount > 0
    }
}
```

### 2. Room Count Manager (Singleton)

```swift
class RoomCountManager {
    static let shared = RoomCountManager()
    
    // Store counts by roomId
    private var elementCounts = [String: Int]()
    private var unseenCounts = [String: Int]()
    
    // Thread safety
    private let queue = DispatchQueue(label: "com.app.roomcounts", attributes: .concurrent)
    
    private init() {
        setupSocketListeners()
    }
    
    // Initialize with data from API
    func setInitialCounts(from rooms: [Room]) {
        queue.async(flags: .barrier) {
            self.elementCounts.removeAll()
            self.unseenCounts.removeAll()
            
            for room in rooms {
                self.elementCounts[room.id] = room.elementCount
                self.unseenCounts[room.id] = room.badges.elements
            }
        }
    }
    
    // Get current count
    func getElementCount(for roomId: String) -> Int {
        queue.sync {
            return elementCounts[roomId] ?? 0
        }
    }
    
    func getUnseenCount(for roomId: String) -> Int {
        queue.sync {
            return unseenCounts[roomId] ?? 0
        }
    }
    
    // Update counts
    private func incrementElementCount(for roomId: String, isUnseen: Bool) {
        queue.async(flags: .barrier) {
            self.elementCounts[roomId] = (self.elementCounts[roomId] ?? 0) + 1
            
            if isUnseen {
                self.unseenCounts[roomId] = (self.unseenCounts[roomId] ?? 0) + 1
            }
            
            // Post notification for UI update
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .roomElementCountChanged,
                    object: nil,
                    userInfo: [
                        "roomId": roomId,
                        "elementCount": self.elementCounts[roomId] ?? 0,
                        "unseenCount": self.unseenCounts[roomId] ?? 0
                    ]
                )
            }
        }
    }
    
    private func decrementElementCount(for roomId: String) {
        queue.async(flags: .barrier) {
            self.elementCounts[roomId] = max(0, (self.elementCounts[roomId] ?? 0) - 1)
            // Note: unseen count doesn't decrement on delete
            
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .roomElementCountChanged,
                    object: nil,
                    userInfo: [
                        "roomId": roomId,
                        "elementCount": self.elementCounts[roomId] ?? 0,
                        "unseenCount": self.unseenCounts[roomId] ?? 0
                    ]
                )
            }
        }
    }
    
    // Reset unseen count when entering room
    func markElementsAsSeen(for roomId: String) {
        queue.async(flags: .barrier) {
            self.unseenCounts[roomId] = 0
            
            DispatchQueue.main.async {
                NotificationCenter.default.post(
                    name: .roomElementCountChanged,
                    object: nil,
                    userInfo: [
                        "roomId": roomId,
                        "elementCount": self.elementCounts[roomId] ?? 0,
                        "unseenCount": 0
                    ]
                )
            }
        }
    }
    
    // Socket listeners
    private func setupSocketListeners() {
        // Element created globally
        SocketManager.shared.socket.on("element:created:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String,
                  let createdBy = payload["createdBy"] as? String else { return }
            
            // Check if it's someone else's element (unseen)
            let isUnseen = createdBy != AuthManager.shared.currentUserId
            
            self?.incrementElementCount(for: roomId, isUnseen: isUnseen)
        }
        
        // Element deleted globally
        SocketManager.shared.socket.on("element:deleted:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String else { return }
            
            self?.decrementElementCount(for: roomId)
        }
        
        // Room cleared globally (all elements deleted)
        SocketManager.shared.socket.on("room:cleared:global") { [weak self] data, _ in
            guard let payload = data[0] as? [String: Any],
                  let roomId = payload["roomId"] as? String else { return }
            
            self?.queue.async(flags: .barrier) {
                self?.elementCounts[roomId] = 0
                // Don't reset unseen - user still needs to visit room
                
                DispatchQueue.main.async {
                    NotificationCenter.default.post(
                        name: .roomElementCountChanged,
                        object: nil,
                        userInfo: [
                            "roomId": roomId,
                            "elementCount": 0,
                            "unseenCount": self?.unseenCounts[roomId] ?? 0
                        ]
                    )
                }
            }
        }
    }
}

extension Notification.Name {
    static let roomElementCountChanged = Notification.Name("roomElementCountChanged")
}
```

### 3. MyRoomsViewController Integration

```swift
class MyRoomsViewController: UIViewController {
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupNotifications()
        fetchMyRooms()
    }
    
    private func setupNotifications() {
        // Element count changes
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleElementCountChange),
            name: .roomElementCountChanged,
            object: nil
        )
        
        // Existing message notification observer...
    }
    
    private func fetchMyRooms() {
        APIManager.shared.getMyRooms { [weak self] rooms in
            self?.rooms = rooms
            
            // Initialize count manager with API data
            RoomCountManager.shared.setInitialCounts(from: rooms)
            
            self?.tableView.reloadData()
        }
    }
    
    @objc private func handleElementCountChange(_ notification: Notification) {
        guard let roomId = notification.userInfo?["roomId"] as? String,
              let elementCount = notification.userInfo?["elementCount"] as? Int,
              let unseenCount = notification.userInfo?["unseenCount"] as? Int,
              let index = rooms.firstIndex(where: { $0.id == roomId }) else { return }
        
        // Update model
        rooms[index].elementCount = elementCount
        rooms[index].unseenElementCount = unseenCount
        
        // Update UI efficiently
        DispatchQueue.main.async { [weak self] in
            let indexPath = IndexPath(row: index, section: 0)
            if let cell = self?.tableView.cellForRow(at: indexPath) as? RoomCell {
                cell.updateElementCount(total: elementCount, unseen: unseenCount)
            }
        }
    }
    
    // When user taps a room
    func didSelectRoom(_ room: Room) {
        // Mark elements as seen
        RoomCountManager.shared.markElementsAsSeen(for: room.id)
        
        // Navigate to room...
    }
}
```

### 4. RoomCell UI Updates

```swift
class RoomCell: UITableViewCell {
    @IBOutlet weak var nameLabel: UILabel!
    @IBOutlet weak var elementCountLabel: UILabel!
    @IBOutlet weak var elementBadgeView: UIView!
    @IBOutlet weak var unseenCountLabel: UILabel!
    
    func configure(with room: Room) {
        nameLabel.text = room.name
        updateElementCount(total: room.elementCount, unseen: room.unseenElementCount)
    }
    
    func updateElementCount(total: Int, unseen: Int) {
        // Total count
        elementCountLabel.text = total > 99 ? "99+" : "\(total)"
        
        // Unseen badge
        if unseen > 0 {
            elementBadgeView.isHidden = false
            unseenCountLabel.text = unseen > 99 ? "99+" : "\(unseen)"
            
            // Add pulse animation for new elements
            UIView.animate(withDuration: 0.3, animations: {
                self.elementBadgeView.transform = CGAffineTransform(scaleX: 1.1, y: 1.1)
            }) { _ in
                UIView.animate(withDuration: 0.3) {
                    self.elementBadgeView.transform = .identity
                }
            }
        } else {
            elementBadgeView.isHidden = true
        }
    }
}
```

### 5. Handling Edge Cases

```swift
extension RoomCountManager {
    // Handle app becoming active (counts might be stale)
    func refreshCountsIfNeeded() {
        let lastRefresh = UserDefaults.standard.object(forKey: "lastCountRefresh") as? Date ?? Date.distantPast
        
        if Date().timeIntervalSince(lastRefresh) > 300 { // 5 minutes
            // Trigger a refresh of MyRooms
            NotificationCenter.default.post(name: .shouldRefreshMyRooms, object: nil)
            UserDefaults.standard.set(Date(), forKey: "lastCountRefresh")
        }
    }
    
    // Handle socket reconnection
    func handleSocketReconnection() {
        // Counts might be out of sync, trigger refresh
        NotificationCenter.default.post(name: .shouldRefreshMyRooms, object: nil)
    }
}

// In AppDelegate
func applicationDidBecomeActive(_ application: UIApplication) {
    RoomCountManager.shared.refreshCountsIfNeeded()
}

// In SocketManager
socket.on("connect") { _, _ in
    RoomCountManager.shared.handleSocketReconnection()
}
```

## Visual Design Suggestions

### Element Count Badge Design
```swift
// Custom badge view for element counts
class ElementCountBadge: UIView {
    enum Style {
        case normal    // Gray background
        case unseen    // Red/accent color for unseen
    }
    
    func configure(count: Int, style: Style) {
        // Set background color based on style
        backgroundColor = style == .unseen ? .systemRed : .systemGray3
        
        // Set text
        label.text = count > 99 ? "99+" : "\(count)"
        
        // Round corners
        layer.cornerRadius = bounds.height / 2
    }
}
```

## Testing Scenarios

1. **Initial Load**
   - Verify counts match API response
   - Check both total and unseen counts display correctly

2. **Real-time Updates**
   - User A adds element → User B sees count increment
   - User A deletes element → User B sees count decrement
   - Own elements don't increase unseen count

3. **Entering/Leaving Rooms**
   - Unseen count resets when entering room
   - Total count remains accurate

4. **Edge Cases**
   - Socket disconnect/reconnect
   - App background/foreground
   - Rapid element creation/deletion
   - Room with 99+ elements

## API Response Reference

```json
// GET /api/rooms/my-rooms returns:
{
  "data": [{
    "id": "room-123",
    "name": "Design Team",
    "elementCount": 45,        // Total elements
    "badges": {
      "messages": 3,
      "elements": 7            // Unseen elements
    },
    "hasUnread": true
  }]
}
```

## Socket Event Reference

### Global Events (NEW - for MyRooms tracking)

```javascript
// Backend broadcasts these globally to ALL connected sockets:

// When element is created
socket.on('element:created:global', {
  roomId: "room-456",
  elementId: "elem-123",
  createdBy: "user-789",
  type: "note"
})

// When element is deleted
socket.on('element:deleted:global', {
  roomId: "room-456",
  elementId: "elem-123",
  deletedBy: "user-789"
})

// When room is cleared
socket.on('room:cleared:global', {
  roomId: "room-456",
  clearedBy: "user-789"
})
```

### Room-Specific Events (existing - for users in the room)

```javascript
// These are sent only to users who have joined the room:

socket.on('element:created', {
  element: { /* full element data */ }
})

socket.on('element:deleted', {
  elementId: "elem-123"
})

socket.on('room:cleared', {
  roomId: "room-456"
})
```

## Performance Considerations

1. **Batch Updates**: If multiple elements are created rapidly, debounce UI updates
2. **Memory**: Clean up counts for rooms user is no longer part of
3. **Thread Safety**: Always use concurrent queue for count access
4. **UI Updates**: Only update visible cells, not entire table

This implementation provides real-time element count tracking without requiring any backend changes!