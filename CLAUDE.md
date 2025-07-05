# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TouchSync is a real-time collaborative canvas backend API for iOS applications. It enables users to create "rooms" (shared canvases) with other users where they can share notes, photos, voice notes, and touch interactions in real-time. 

Key features:
- Rooms support 2+ participants (no longer limited to 2)
- Room-based navigation: "My Rooms" shows all rooms with unread indicators
- Room names are REQUIRED when creating (no longer optional)
- Multiple rooms can exist with the same participants
- No friendship system - users can create rooms with any other users directly
- Real-time touch tracking and element synchronization via Socket.io
- Unread indicators track new content since last visit per user

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Real-time**: Socket.io
- **Authentication**: Auth0 (supports both JWT and opaque tokens)
- **Image Storage**: Cloudinary
- **Key Libraries**: express-rate-limit, cors, multer, jsonwebtoken, jwks-rsa

## Project Structure

```
src/
├── config/          # Configuration files (app config, Prisma client)
├── controllers/     # Request handlers for each route
├── middleware/      # Auth, error handling, validation
├── routes/          # Express route definitions
├── sockets/         # Socket.io event handlers
├── types/           # TypeScript type definitions
├── utils/           # Utility functions:
│   ├── asyncHandler.ts  # Wraps async route handlers
│   ├── colors.ts       # Color palette for participants (8 predefined colors)
│   └── pagination.ts   # Pagination helpers
├── app.ts          # Express app setup
└── index.ts        # Server entry point
```

## Key Commands

```bash
# Development
npm run dev                    # Start development server with hot reload (port 3000)

# Build & Production
npm run build                  # Compile TypeScript to dist/
npm start                      # Run production server (requires build)
rm -rf dist/                   # Clean build artifacts (useful after major refactoring)

# Database
npm run prisma:generate        # Generate Prisma client
npm run prisma:migrate         # Run database migrations  
npm run prisma:studio          # Open Prisma Studio GUI (http://localhost:5555)

# Database Operations
npx prisma migrate dev --name <migration-name>  # Create new migration
npx prisma db push --force-reset               # Reset DB and push schema (WARNING: deletes all data)
npx prisma migrate reset --force               # Reset all migrations and data

# Testing & Debugging
curl http://localhost:3000/health              # Health check
curl -X POST http://localhost:3000/api/test/token -H "Authorization: Bearer <token>" # Test token format

# Installation
npm install                    # Install dependencies
cp .env.example .env          # Create environment file
```

## Database Schema

The app uses these main entities:
- **User**: Auth0 ID, email, username, profile info (firstName, dateOfBirth), avatarUrl, oneSignalPlayerId
- **Room**: Collaborative canvas rooms (2+ participants)
  - `name`: REQUIRED room name (no longer optional)
  - `updatedAt`: Auto-updates when room or its elements change
- **RoomParticipant**: Links users to rooms with assigned colors
  - `lastVisitedAt`: Tracks when user last visited (for unread indicators)
  - `leftAt`: When user left room
  - `color`: Unique color per participant (supports 15+ distinct colors)
- **Element**: Notes, photos, and audio on the canvas (soft-deleted with `deletedAt`)
  - Types: NOTE, PHOTO, AUDIO
  - Fields: content (for notes), imageUrl (for photos), audioUrl & duration (for audio)

## Authentication & Profile Flow

### Authentication
The backend supports dual authentication modes:
1. **JWT Tokens** (preferred): When iOS app includes `audience` parameter
2. **Opaque Tokens** (fallback): Validated via Auth0's `/userinfo` endpoint

The auth middleware (`src/middleware/auth.ts`) automatically detects and handles both token types.

### Profile Completion Requirements
New users must complete their profile before accessing most features:
- **Username**: 3-20 characters, alphanumeric + underscore only
- **First Name**: Required, cannot be empty
- **Date of Birth**: Required, user must be 13+ years old

Users with incomplete profiles (username starting with `user_`) are blocked from accessing rooms and user lists.

## API Endpoints

### Public Endpoints
- `GET /health` - Health check
- `POST /api/test/token` - Debug token issues (development only)

### Protected Endpoints (require Auth0 token)

#### Auth Endpoints
- `POST /api/auth/verify` - Verify token and create/get user (returns `profileComplete` status)
- `POST /api/auth/complete-profile` - Complete profile setup (requires: username, firstName, dateOfBirth)
- `GET /api/auth/check-username?username=xxx` - Check username availability

#### User Endpoints (Profile completion NOT required for /me)
- `GET /api/users/me` - Get current user with `profileComplete` flag
- `PUT /api/users/me` - Update profile (firstName, dateOfBirth)

#### User Endpoints (Profile completion REQUIRED)
- `GET /api/users/search?username=xxx` - Search users by username
- `GET /api/users/all` - List all users with completed profiles
- `GET /api/users/without-rooms` - List users you don't have rooms with (for + button)

#### Notification Endpoints
- `PUT /api/notifications/player-id` - Update OneSignal player ID (body: `{ playerId }`)

#### Room Endpoints (Profile completion REQUIRED)
- `GET /api/rooms/my-rooms` - **PRIMARY** Get all user's rooms with unread indicators
  - Returns rooms sorted by updatedAt with participants, element counts, and unread counts
  - Includes `hasUnread` boolean and `unreadCount` for notification indicators
- `POST /api/rooms` - Create new room (**UPDATED**)
  - Body: `{ name: "Room Name", participantIds: ["userId1", "userId2"] }`
  - `name` is now REQUIRED (no longer optional)
  - `participantIds` is an array (supports 2+ participants)
  - Creator should NOT be included in participantIds
- `GET /api/rooms/grouped-by-person` - **LEGACY** Get rooms organized by person
- `GET /api/rooms` - List user's rooms (legacy, kept for compatibility)
- `GET /api/rooms/:id` - Get room details with elements
- `PUT /api/rooms/:id/name` - Update room name (body: `{ name }`)
- `POST /api/rooms/:id/join` - Join a room (updates lastVisitedAt for unread tracking)
- `POST /api/rooms/:id/leave` - Leave a room
- `GET /api/rooms/:id/elements` - Get room elements

#### Upload Endpoints (Profile completion REQUIRED)
- `POST /api/upload/image` - Upload image to Cloudinary
  - Method: POST
  - Content-Type: multipart/form-data (DO NOT set manually in iOS, let system set it)
  - Field name: "image" (required)
  - Max size: 10MB
  - Supported formats: JPEG, PNG, GIF, WebP

- `POST /api/upload/audio` - Upload audio/voice note to Cloudinary
  - Method: POST
  - Content-Type: multipart/form-data (DO NOT set manually in iOS, let system set it)
  - Field name: "audio" (required)
  - Max size: 25MB
  - Supported formats: MP3, M4A, WAV, WebM, OGG, AAC
  - Returns: URL, duration (in seconds), format, size

## Real-time Features (Socket.io)

### Connection
- Authenticate with Auth0 token in handshake (supports both JWT and opaque tokens)
- Socket.io auth middleware validates tokens and enforces profile completion

### Client Events (sent by iOS app)
- `room:join` - Join a room (required before any room operations)
- `room:leave` - Leave a room
- `touch:move` - Send touch position (x, y, elementId?)
  - For finger tracking: send just x, y
  - For element dragging: include elementId for smooth real-time updates
- `touch:end` - End touch tracking
- `element:create` - Create new element (server generates ID)
  - Types: "note", "photo", "audio"
  - Required fields: type, positionX, positionY, width, height
  - Optional fields: content (for notes), imageUrl (for photos), audioUrl & duration (for audio)
  - Server automatically assigns z-index (new elements on top)
- `element:update` - Update element position/content (writes to database, use sparingly)
- `element:delete` - Soft delete element
- `element:bring-to-front` - Move element to top layer (highest z-index)
  - Required: roomId, elementId
  - Updates z-index to be higher than all other elements
- `room:clear` - Clear all elements (creator only)

### Server Broadcasts
- `user:joined` - User joined room (includes username, color)
- `user:left` - User left room
- `touch:moved` - Touch position update from other user (includes elementId if dragging)
- `touch:ended` - Touch ended from other user
- `element:created` - New element created (includes server-generated ID and z-index)
- `element:updated` - Element position/content changed
- `element:deleted` - Element removed
- `element:z-index-changed` - Element z-index updated (includes elementId, zIndex)
- `room:cleared` - All elements cleared
- `room:rejoin-needed` - Socket needs to rejoin room (includes roomId)
- `error` - Error message

### Critical Socket.io Flow
1. Client MUST emit `room:join` when entering a room
2. Server sends all existing elements as `element:created` events
3. Elements use server-generated UUIDs, not client-generated IDs
4. All broadcasts include room-scoped delivery via `io.to(roomId)`

## Room Lifecycle & Design

1. **Room Creation**: 
   - Created between exactly 2 users via `POST /api/rooms` with `otherUserId`
   - Always creates a new room (multiple rooms allowed between same users)
   - Each participant gets a pre-assigned color (#FF6B6B for creator, #4ECDC4 for other)
   - Rooms start unnamed (can be named later via PUT /api/rooms/:id/name)

2. **Room States**:
   - **Active**: At least one participant is present (`isActive: true`)
   - **Inactive**: All participants have left (`isActive: false`)
   - Inactive rooms can still be accessed and modified

3. **Participant Tracking**:
   - `isActive`: Currently in the room
   - `leftAt`: Timestamp when user left (null if still active)
   - Room becomes inactive when last participant leaves but remains accessible

4. **Room Updates**:
   - `updatedAt` timestamp updates when:
     - Elements are created, updated, or deleted
     - Room name is changed
   - Rooms in person view are sorted by most recently updated

## Push Notifications

The app uses OneSignal for push notifications. Notifications are sent when:
1. **Room Created**: "Pete created a new room with you"
2. **Room Renamed**: "Pete renamed your room to Italian Vacation"
3. **Element Added**: "Pete added a photo in Italian Vacation"

iOS app must:
1. Initialize OneSignal with app ID
2. Set external user ID using `OneSignal.login(userId)`
3. Send player ID to backend via `PUT /api/notifications/player-id`
4. Handle notification clicks to navigate to rooms

## Key Security Features

1. **Rate Limiting**: 100 requests per 15 minutes per IP
2. **CORS**: Configured for development (all origins) - tighten for production
3. **Authentication**: All API routes except health check require Auth0 tokens
4. **Soft Deletes**: Elements are marked as deleted, not removed from DB

## Development Tips

- Server listens on `0.0.0.0:3000` for network access from mobile devices
- Extensive console logging in auth middleware for debugging token issues
- Use `/api/test/token` endpoint to debug authentication problems
- Prisma Studio (`npm run prisma:studio`) for visual database management

## Common Tasks

### Adding a New API Endpoint
1. Create controller in `src/controllers/`
2. Add route in `src/routes/`
3. Import route in `src/app.ts`
4. Use `asyncHandler` wrapper for async routes
5. Apply auth middleware as needed

### Adding Socket.io Events
1. Add handler in `src/sockets/roomHandlers.ts`
2. Verify user is room participant before processing
3. Room `updatedAt` timestamp updates automatically via Prisma @updatedAt
4. Broadcast to room using `io.to(roomId).emit()`
5. No need to check room lock status - rooms are always accessible

### Database Changes
1. Modify `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Run `npm run prisma:generate`

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection string
- `AUTH0_DOMAIN` - Auth0 tenant domain
- `AUTH0_AUDIENCE` - API identifier (e.g., https://api.touchsync.com)
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `ONESIGNAL_APP_ID` - OneSignal app ID
- `ONESIGNAL_API_KEY` - OneSignal REST API key
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Troubleshooting

### Token Issues
- Check `/api/test/token` for token format analysis
- Opaque tokens need audience parameter in iOS auth request
- Console logs show detailed auth flow for debugging

### CORS Issues
- Currently allows all origins (`*`) in development
- Check browser/app sends proper `Authorization: Bearer <token>` header

### Database Issues
- Run `npm run prisma:generate` after schema changes
- Check `DATABASE_URL` connection string
- Use `npx prisma db push` for quick schema sync in development

### Socket Connection Issues
- Ensure auth token is passed in socket handshake: `{ auth: { token: 'Bearer ...' } }`
- iOS app MUST call `room:join` after connecting to receive/send room events
- Check console for emoji-prefixed logs: 🔌 connection, 🚪 room join, 📦 element creation
- Common issues:
  - "jwt malformed": iOS sending opaque token (fixed with dual token support)
  - No sync between users: Forgot to emit `room:join`
  - Element update fails: Using client-generated IDs instead of server IDs
  - Element dragging lag: Use `touch:move` with elementId instead of `element:update`

## Architecture Decisions

1. **No Friendship System**: Simplified UX - users can create rooms with anyone
2. **2-Person Room Limit**: Focused on intimate collaboration experience
3. **Always Accessible Rooms**: Rooms remain accessible for adding content anytime (no locking)
4. **Person-Based Navigation**: Rooms grouped by person for intuitive organization
5. **Multiple Rooms Per Person**: Users can create unlimited rooms with the same person
6. **Soft Deletes for Elements**: Maintains data integrity and allows recovery
7. **Opaque Token Support**: Backwards compatibility while iOS app transitions to JWT tokens
8. **Server-Generated Element IDs**: Prevents ID conflicts, ensures consistency across clients
9. **Profile Completion Enforcement**: Ensures all users have valid usernames and age verification before interaction
10. **Stateless Touch Events**: Element dragging uses touch:move with elementId for real-time performance without database writes