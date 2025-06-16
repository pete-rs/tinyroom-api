# iOS Push Notifications Implementation Guide

## Overview

We've implemented push notifications using OneSignal. The backend sends notifications for:
1. When someone creates a room with you
2. When someone renames a shared room
3. When someone adds content (note, photo, voice) to a shared room

## OneSignal Setup

### 1. Create OneSignal Account
1. Sign up at [onesignal.com](https://onesignal.com)
2. Create a new app for iOS
3. Follow OneSignal's iOS setup guide to configure APNs certificates

### 2. Install OneSignal iOS SDK

```ruby
# Podfile
pod 'OneSignalXCFramework', '>= 5.0.0', '< 6.0'
```

### 3. Initialize OneSignal in AppDelegate

```swift
import OneSignalFramework

class AppDelegate: UIResponder, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Initialize OneSignal
        OneSignal.initialize("YOUR_ONESIGNAL_APP_ID", withLaunchOptions: launchOptions)
        
        // Request permission
        OneSignal.Notifications.requestPermission({ accepted in
            print("User accepted notifications: \(accepted)")
        }, fallbackToSettings: true)
        
        return true
    }
}
```

### 4. Set External User ID After Login

```swift
// After successful Auth0 login, when you have the user profile
func setUserForNotifications(userId: String) {
    // Set the external user ID in OneSignal
    OneSignal.login(userId)
    
    // Get the OneSignal player ID and send to backend
    if let playerId = OneSignal.User.pushSubscription.id {
        updatePlayerIdOnBackend(playerId: playerId)
    }
    
    // Listen for player ID changes
    OneSignal.User.pushSubscription.addObserver(self)
}

// Update backend with player ID
func updatePlayerIdOnBackend(playerId: String) {
    APIClient.updateOneSignalPlayerId(playerId: playerId) { result in
        switch result {
        case .success:
            print("✅ OneSignal player ID updated on backend")
        case .failure(let error):
            print("❌ Failed to update player ID: \(error)")
        }
    }
}
```

## Backend API

### Update OneSignal Player ID
```
PUT /api/notifications/player-id
Authorization: Bearer <token>
Content-Type: application/json

Body:
{
  "playerId": "onesignal-player-id-here"
}

Response:
{
  "data": { "success": true }
}
```

## Notification Types

### 1. Room Created
```json
{
  "title": "New Room",
  "message": "Pete created a new room with you",
  "data": {
    "type": "room_created",
    "roomId": "room-uuid"
  }
}
```

### 2. Room Renamed
```json
{
  "title": "Room Renamed",
  "message": "Pete renamed your room to Italian Vacation",
  "data": {
    "type": "room_renamed",
    "roomId": "room-uuid",
    "roomName": "Italian Vacation"
  }
}
```

### 3. Element Added
```json
{
  "title": "New Content",
  "message": "Pete added a photo in Italian Vacation",
  "data": {
    "type": "element_added",
    "roomId": "room-uuid",
    "elementType": "photo"  // "note", "photo", or "audio"
  }
}
```

## Handling Notifications

```swift
// Set up notification opened handler
OneSignal.Notifications.addClickListener { result in
    guard let data = result.notification.additionalData,
          let type = data["type"] as? String,
          let roomId = data["roomId"] as? String else { return }
    
    switch type {
    case "room_created", "room_renamed", "element_added":
        // Navigate to the specific room
        navigateToRoom(roomId: roomId)
    default:
        break
    }
}

func navigateToRoom(roomId: String) {
    // Fetch room details and navigate
    APIClient.getRoom(roomId: roomId) { result in
        switch result {
        case .success(let room):
            DispatchQueue.main.async {
                // Navigate to RoomViewController with the room
                let roomVC = RoomViewController()
                roomVC.roomId = roomId
                roomVC.room = room
                
                // Present or push based on your navigation structure
                if let nav = UIApplication.shared.keyWindow?.rootViewController as? UINavigationController {
                    nav.pushViewController(roomVC, animated: true)
                }
            }
        case .failure(let error):
            print("Failed to load room: \(error)")
        }
    }
}
```

## Complete Implementation Example

```swift
// APIClient extension
extension APIClient {
    static func updateOneSignalPlayerId(playerId: String, completion: @escaping (Result<Void, Error>) -> Void) {
        guard let token = AuthManager.shared.accessToken else {
            completion(.failure(APIError.notAuthenticated))
            return
        }
        
        var request = URLRequest(url: URL(string: "\(baseURL)/api/notifications/player-id")!)
        request.httpMethod = "PUT"
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        let body = ["playerId": playerId]
        request.httpBody = try? JSONEncoder().encode(body)
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                completion(.failure(APIError.invalidResponse))
                return
            }
            
            completion(.success(()))
        }.resume()
    }
}
```

## Testing Push Notifications

1. **Test on Real Device**: Push notifications don't work on simulator
2. **Check OneSignal Dashboard**: Verify user appears as subscribed
3. **Send Test Notification**: Use OneSignal dashboard to send test
4. **Debug Player ID**: Log the player ID to ensure it's being set

```swift
// Debug logging
print("OneSignal Player ID: \(OneSignal.User.pushSubscription.id ?? "nil")")
print("OneSignal External User ID: \(OneSignal.User.externalId ?? "nil")")
```

## Important Notes

1. **User Privacy**: Users must opt-in to notifications
2. **Silent Updates**: Consider using silent notifications for less important updates
3. **Badge Management**: The backend increments badge count automatically
4. **Notification Grouping**: Consider grouping notifications by room

## Troubleshooting

- **No notifications received**: Check APNs certificates in OneSignal
- **Player ID not updating**: Ensure you're calling `OneSignal.login()` after Auth0 login
- **Notifications not opening app**: Check click handler is set up before notification arrives