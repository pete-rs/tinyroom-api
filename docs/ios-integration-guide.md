# iOS Integration Guide for Rooms API

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Authentication](#authentication)
3. [API Integration](#api-integration)
4. [Real-time Socket.IO](#real-time-socketio)
5. [Push Notifications](#push-notifications)
6. [Media Upload](#media-upload)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

## Architecture Overview

### Base Configuration
```swift
struct APIConfig {
    static let baseURL = "https://your-api-url.com"
    static let socketURL = "wss://your-api-url.com"
    static let auth0Domain = "your-auth0-domain.auth0.com"
    static let auth0ClientId = "your-auth0-client-id"
    static let auth0Audience = "https://api.touchsync.com"
    static let oneSignalAppId = "your-onesignal-app-id"
}
```

### Core Models
```swift
struct User: Codable {
    let id: String
    let auth0Id: String
    let email: String
    let username: String
    let firstName: String
    let dateOfBirth: Date
    let avatarUrl: String?
    let createdAt: Date
}

struct Room: Codable {
    let id: String
    let name: String?
    let createdBy: String
    let creator: User
    let createdAt: Date
    let updatedAt: Date
    let isActive: Bool
    let participants: [RoomParticipant]
}

struct RoomParticipant: Codable {
    let roomId: String
    let userId: String
    let user: User
    let joinedAt: Date
    let leftAt: Date?
    let color: String
    let isActive: Bool
}

struct Element: Codable {
    let id: String
    let roomId: String
    let type: ElementType
    let createdBy: String
    let positionX: Double
    let positionY: Double
    let width: Double
    let height: Double
    let content: String?
    let imageUrl: String?
    let audioUrl: String?
    let duration: Double?
    let createdAt: Date
}

enum ElementType: String, Codable {
    case note = "note"
    case photo = "photo"
    case audio = "audio"
}
```

## Authentication

### Auth0 Setup
```swift
import Auth0

class AuthManager {
    static let shared = AuthManager()
    
    private let auth0 = Auth0.authentication()
    private var credentials: Credentials?
    
    func login(completion: @escaping (Result<Credentials, Error>) -> Void) {
        auth0
            .webAuth()
            .audience(APIConfig.auth0Audience)
            .scope("openid profile email offline_access")
            .start { result in
                switch result {
                case .success(let credentials):
                    self.credentials = credentials
                    self.saveCredentials(credentials)
                    completion(.success(credentials))
                case .failure(let error):
                    completion(.failure(error))
                }
            }
    }
    
    func logout() {
        auth0
            .webAuth()
            .clearSession { result in
                self.credentials = nil
                self.clearCredentials()
            }
    }
    
    func getAccessToken() -> String? {
        return credentials?.accessToken
    }
}
```

### Initial User Flow
```swift
class OnboardingManager {
    func checkUserProfile(completion: @escaping (Bool) -> Void) {
        APIClient.shared.verifyAuth { result in
            switch result {
            case .success(let response):
                if response.profileComplete {
                    // User is ready, proceed to main app
                    completion(true)
                } else {
                    // Need to complete profile
                    completion(false)
                }
            case .failure:
                completion(false)
            }
        }
    }
    
    func completeProfile(
        username: String,
        firstName: String,
        dateOfBirth: Date,
        avatarUrl: String?,
        completion: @escaping (Result<User, Error>) -> Void
    ) {
        let params = [
            "username": username,
            "firstName": firstName,
            "dateOfBirth": ISO8601DateFormatter().string(from: dateOfBirth),
            "avatarUrl": avatarUrl
        ].compactMapValues { $0 }
        
        APIClient.shared.completeProfile(params: params, completion: completion)
    }
}
```

## API Integration

### API Client
```swift
class APIClient {
    static let shared = APIClient()
    
    private let session = URLSession.shared
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()
    
    enum APIError: Error {
        case invalidURL
        case noData
        case decodingError
        case serverError(message: String)
        case unauthorized
    }
    
    private func makeRequest<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: Data? = nil,
        completion: @escaping (Result<T, Error>) -> Void
    ) {
        guard let url = URL(string: "\(APIConfig.baseURL)\(endpoint)") else {
            completion(.failure(APIError.invalidURL))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = AuthManager.shared.getAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = body
        }
        
        session.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(APIError.noData))
                return
            }
            
            if let httpResponse = response as? HTTPURLResponse {
                switch httpResponse.statusCode {
                case 200...299:
                    do {
                        let response = try self.decoder.decode(APIResponse<T>.self, from: data)
                        completion(.success(response.data))
                    } catch {
                        completion(.failure(APIError.decodingError))
                    }
                case 401:
                    completion(.failure(APIError.unauthorized))
                default:
                    if let errorResponse = try? self.decoder.decode(ErrorResponse.self, from: data) {
                        completion(.failure(APIError.serverError(message: errorResponse.error)))
                    } else {
                        completion(.failure(APIError.serverError(message: "Unknown error")))
                    }
                }
            }
        }.resume()
    }
}

// Generic API Response wrapper
struct APIResponse<T: Decodable>: Decodable {
    let data: T
}

struct ErrorResponse: Decodable {
    let error: String
}
```

### API Endpoints
```swift
extension APIClient {
    // Auth
    func verifyAuth(completion: @escaping (Result<AuthResponse, Error>) -> Void) {
        makeRequest(endpoint: "/api/auth/verify", completion: completion)
    }
    
    func completeProfile(params: [String: Any], completion: @escaping (Result<User, Error>) -> Void) {
        let body = try? JSONSerialization.data(withJSONObject: params)
        makeRequest(endpoint: "/api/auth/complete-profile", method: "POST", body: body, completion: completion)
    }
    
    // Users
    func searchUsers(username: String, completion: @escaping (Result<[User], Error>) -> Void) {
        makeRequest(endpoint: "/api/users/search?username=\(username)", completion: completion)
    }
    
    func getUsersWithoutRooms(completion: @escaping (Result<[User], Error>) -> Void) {
        makeRequest(endpoint: "/api/users/without-rooms", completion: completion)
    }
    
    // Rooms
    func createRoom(with userId: String, completion: @escaping (Result<Room, Error>) -> Void) {
        let body = try? JSONSerialization.data(withJSONObject: ["otherUserId": userId])
        makeRequest(endpoint: "/api/rooms", method: "POST", body: body, completion: completion)
    }
    
    func getRoomsGroupedByPerson(completion: @escaping (Result<[PersonWithRooms], Error>) -> Void) {
        makeRequest(endpoint: "/api/rooms/grouped-by-person", completion: completion)
    }
    
    func renameRoom(roomId: String, name: String, completion: @escaping (Result<Room, Error>) -> Void) {
        let body = try? JSONSerialization.data(withJSONObject: ["name": name])
        makeRequest(endpoint: "/api/rooms/\(roomId)/name", method: "PUT", body: body, completion: completion)
    }
    
    // Notifications
    func updateOneSignalPlayerId(playerId: String, completion: @escaping (Result<SuccessResponse, Error>) -> Void) {
        let body = try? JSONSerialization.data(withJSONObject: ["playerId": playerId])
        makeRequest(endpoint: "/api/notifications/player-id", method: "PUT", body: body, completion: completion)
    }
}

struct PersonWithRooms: Decodable {
    let id: String
    let username: String
    let firstName: String
    let email: String
    let avatarUrl: String?
    let rooms: [RoomSummary]
}

struct RoomSummary: Decodable {
    let id: String
    let name: String?
    let createdAt: Date
    let updatedAt: Date
    let isActive: Bool
    let elementCount: Int
}
```

## Real-time Socket.IO

### Socket Manager
```swift
import SocketIO

class SocketManager {
    static let shared = SocketManager()
    
    private var manager: SocketManager?
    private var socket: SocketIOClient?
    
    func connect() {
        guard let token = AuthManager.shared.getAccessToken() else { return }
        
        manager = SocketManager(
            socketURL: URL(string: APIConfig.socketURL)!,
            config: [
                .log(false),
                .compress,
                .connectParams(["token": token]),
                .reconnects(true),
                .reconnectWait(1)
            ]
        )
        
        socket = manager?.defaultSocket
        
        socket?.on(clientEvent: .connect) { data, ack in
            print("Socket connected")
        }
        
        socket?.on(clientEvent: .disconnect) { data, ack in
            print("Socket disconnected")
        }
        
        socket?.on("error") { data, ack in
            if let error = data.first as? String {
                print("Socket error: \(error)")
            }
        }
        
        socket?.connect()
    }
    
    func disconnect() {
        socket?.disconnect()
    }
    
    // Room management
    func joinRoom(roomId: String) {
        socket?.emit("room:join", ["roomId": roomId])
    }
    
    func leaveRoom(roomId: String) {
        socket?.emit("room:leave", ["roomId": roomId])
    }
    
    // Touch events
    func sendTouchMove(roomId: String, x: Double, y: Double, elementId: String? = nil) {
        var data: [String: Any] = [
            "roomId": roomId,
            "x": x,
            "y": y
        ]
        if let elementId = elementId {
            data["elementId"] = elementId
        }
        socket?.emit("touch:move", data)
    }
    
    func sendTouchEnd(roomId: String) {
        socket?.emit("touch:end", ["roomId": roomId])
    }
    
    // Element management
    func createElement(
        roomId: String,
        type: ElementType,
        x: Double,
        y: Double,
        width: Double,
        height: Double,
        content: String? = nil,
        imageUrl: String? = nil,
        audioUrl: String? = nil,
        duration: Double? = nil
    ) {
        var data: [String: Any] = [
            "roomId": roomId,
            "type": type.rawValue,
            "positionX": x,
            "positionY": y,
            "width": width,
            "height": height
        ]
        
        if let content = content { data["content"] = content }
        if let imageUrl = imageUrl { data["imageUrl"] = imageUrl }
        if let audioUrl = audioUrl { data["audioUrl"] = audioUrl }
        if let duration = duration { data["duration"] = duration }
        
        socket?.emit("element:create", data)
    }
    
    func updateElement(roomId: String, elementId: String, x: Double, y: Double) {
        socket?.emit("element:update", [
            "roomId": roomId,
            "elementId": elementId,
            "positionX": x,
            "positionY": y
        ])
    }
    
    func deleteElement(roomId: String, elementId: String) {
        socket?.emit("element:delete", [
            "roomId": roomId,
            "elementId": elementId
        ])
    }
    
    // Event listeners
    func onUserJoined(handler: @escaping (String, User) -> Void) {
        socket?.on("user:joined") { data, ack in
            // Parse user data and call handler
        }
    }
    
    func onUserLeft(handler: @escaping (String) -> Void) {
        socket?.on("user:left") { data, ack in
            // Parse userId and call handler
        }
    }
    
    func onTouchMove(handler: @escaping (TouchMoveData) -> Void) {
        socket?.on("touch:moved") { data, ack in
            // Parse touch data and call handler
        }
    }
    
    func onElementCreated(handler: @escaping (Element) -> Void) {
        socket?.on("element:created") { data, ack in
            // Parse element data and call handler
        }
    }
}
```

## Push Notifications

### OneSignal Integration
```swift
import OneSignalFramework

class NotificationManager {
    static let shared = NotificationManager()
    
    func setupOneSignal(launchOptions: [UIApplication.LaunchOptionsKey: Any]?) {
        // Initialize OneSignal
        OneSignal.initialize(APIConfig.oneSignalAppId, withLaunchOptions: launchOptions)
        
        // Request permission
        OneSignal.Notifications.requestPermission({ accepted in
            print("User accepted notifications: \(accepted)")
        }, fallbackToSettings: true)
        
        // Set up notification handlers
        OneSignal.Notifications.addClickListener { result in
            self.handleNotificationOpened(result: result)
        }
    }
    
    func setUserId(_ userId: String) {
        // Login to OneSignal with external user ID
        OneSignal.login(userId)
        
        // Update player ID on backend
        if let playerId = OneSignal.User.pushSubscription.id {
            updatePlayerIdOnBackend(playerId: playerId)
        }
        
        // Listen for subscription changes
        OneSignal.User.pushSubscription.addObserver(self)
    }
    
    private func updatePlayerIdOnBackend(playerId: String) {
        APIClient.shared.updateOneSignalPlayerId(playerId: playerId) { result in
            switch result {
            case .success:
                print("Player ID updated successfully")
            case .failure(let error):
                print("Failed to update player ID: \(error)")
                // Retry logic here
            }
        }
    }
    
    private func handleNotificationOpened(result: OSNotificationClickResult) {
        guard let data = result.notification.additionalData,
              let type = data["type"] as? String,
              let roomId = data["roomId"] as? String else { return }
        
        switch type {
        case "room_created", "room_renamed", "element_added":
            // Navigate to room
            NotificationCenter.default.post(
                name: .navigateToRoom,
                object: nil,
                userInfo: ["roomId": roomId]
            )
        default:
            break
        }
    }
}

extension NotificationManager: OSPushSubscriptionObserver {
    func onPushSubscriptionDidChange(state: OSPushSubscriptionStateChanges) {
        if let playerId = state.current.id, state.current.optedIn {
            updatePlayerIdOnBackend(playerId: playerId)
        }
    }
}

extension Notification.Name {
    static let navigateToRoom = Notification.Name("navigateToRoom")
}
```

## Media Upload

### Avatar Upload
```swift
class MediaUploader {
    static let shared = MediaUploader()
    
    func uploadAvatar(image: UIImage, completion: @escaping (Result<String, Error>) -> Void) {
        guard let url = URL(string: "\(APIConfig.baseURL)/api/upload/avatar") else {
            completion(.failure(APIError.invalidURL))
            return
        }
        
        guard let imageData = image.jpegData(compressionQuality: 0.8) else {
            completion(.failure(APIError.invalidData))
            return
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        
        if let token = AuthManager.shared.getAccessToken() {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        let boundary = UUID().uuidString
        request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"avatar\"; filename=\"avatar.jpg\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/jpeg\r\n\r\n".data(using: .utf8)!)
        body.append(imageData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        
        request.httpBody = body
        
        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                completion(.failure(error))
                return
            }
            
            guard let data = data else {
                completion(.failure(APIError.noData))
                return
            }
            
            do {
                let response = try JSONDecoder().decode(AvatarUploadResponse.self, from: data)
                completion(.success(response.data.avatarUrl))
            } catch {
                completion(.failure(error))
            }
        }.resume()
    }
    
    func uploadPhoto(image: UIImage, completion: @escaping (Result<String, Error>) -> Void) {
        // Similar implementation for room photos
        // POST /api/upload/photo
    }
    
    func uploadAudio(audioData: Data, duration: TimeInterval, completion: @escaping (Result<String, Error>) -> Void) {
        // Similar implementation for audio
        // POST /api/upload/audio
    }
}

struct AvatarUploadResponse: Decodable {
    let data: AvatarData
}

struct AvatarData: Decodable {
    let avatarUrl: String
}
```

## Error Handling

### Centralized Error Handler
```swift
class ErrorHandler {
    static func handle(_ error: Error, in viewController: UIViewController) {
        let alert = UIAlertController(title: "Error", message: nil, preferredStyle: .alert)
        
        switch error {
        case APIError.unauthorized:
            alert.message = "Session expired. Please login again."
            alert.addAction(UIAlertAction(title: "Login", style: .default) { _ in
                // Navigate to login
            })
            
        case APIError.serverError(let message):
            alert.message = message
            
        case let socketError as SocketError:
            alert.message = "Connection error. Please check your internet."
            
        default:
            alert.message = "Something went wrong. Please try again."
        }
        
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        viewController.present(alert, animated: true)
    }
}
```

## Best Practices

### 1. Token Management
```swift
class TokenManager {
    private let keychain = KeychainSwift()
    
    func saveToken(_ token: String) {
        keychain.set(token, forKey: "access_token")
    }
    
    func getToken() -> String? {
        return keychain.get("access_token")
    }
    
    func clearToken() {
        keychain.delete("access_token")
    }
}
```

### 2. Offline Support
```swift
class SyncManager {
    func syncPendingElements() {
        // Get pending elements from Core Data
        // Attempt to sync with server
        // Update local state on success
    }
}
```

### 3. Image Caching
```swift
import SDWebImage

extension UIImageView {
    func setAvatar(url: String?) {
        guard let url = url else {
            self.image = UIImage(named: "default_avatar")
            return
        }
        
        self.sd_setImage(
            with: URL(string: url),
            placeholderImage: UIImage(named: "default_avatar"),
            options: [.retryFailed, .refreshCached]
        )
    }
}
```

### 4. Network Monitoring
```swift
import Network

class NetworkMonitor {
    static let shared = NetworkMonitor()
    private let monitor = NWPathMonitor()
    private let queue = DispatchQueue.global(qos: .background)
    
    var isConnected = false
    
    func startMonitoring() {
        monitor.pathUpdateHandler = { path in
            self.isConnected = path.status == .satisfied
            
            if self.isConnected {
                // Reconnect socket
                SocketManager.shared.connect()
                // Sync pending data
                SyncManager().syncPendingElements()
            }
        }
        monitor.start(queue: queue)
    }
}
```

### 5. Debug Helpers
```swift
#if DEBUG
extension APIClient {
    func enableLogging() {
        // Log all requests and responses
    }
}
#endif
```

## Testing Checklist

- [ ] Auth0 login/logout flow
- [ ] Profile completion with avatar
- [ ] Room creation between users
- [ ] Real-time touch synchronization
- [ ] Element creation/update/delete
- [ ] Push notifications (all types)
- [ ] Offline mode and sync
- [ ] Token refresh
- [ ] Error scenarios
- [ ] Memory leaks (Instruments)
- [ ] Performance (large rooms)

## Common Issues

1. **Socket disconnections**: Implement exponential backoff for reconnection
2. **Token expiration**: Use Auth0's token refresh
3. **Large images**: Compress before upload
4. **Push notification failures**: Always update player ID on app launch
5. **Race conditions**: Use operation queues for sequential API calls