# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TouchSync is a real-time collaborative canvas backend API for iOS applications. It enables users to create "rooms" (shared canvases) where they can share notes, photos, videos, voice notes, links, horoscopes, and touch interactions in real-time with built-in social features.

Key features:
- Rooms support 2+ participants with add/remove functionality
- Rich media elements: notes, photos, audio, video (10s), links, horoscopes
- Social features: comments, reactions, following system, mentions
- Real-time messaging with heart reactions and read receipts
- Touch tracking and element synchronization via Socket.io
- In-app notifications with deep linking
- Public rooms and following feed for discovery
- Element transforms: rotation, scaling, z-index management
- Push notifications via OneSignal

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js v5.1.0
- **Database**: PostgreSQL with Prisma ORM v6.9.0
- **Real-time**: Socket.io v4.8.1
- **Authentication**: Auth0 (supports both JWT and opaque tokens)
- **File Storage**: Cloudinary (images, audio, video, backgrounds)
- **Push Notifications**: OneSignal
- **AI Integration**: Claude API (horoscope generation)
- **Image Processing**: Sharp v0.34.2
- **Key Libraries**: express-rate-limit, cors, multer, jsonwebtoken, jwks-rsa

## Project Structure

```
src/
├── config/          # Configuration files
│   ├── index.ts             # App config
│   ├── prisma.ts           # Prisma client singleton
│   └── elementTransforms.ts # Transform settings
├── controllers/     # Request handlers
│   ├── authController.ts
│   ├── userController.ts
│   ├── roomController.ts
│   ├── uploadController.ts
│   ├── notificationController.ts
│   ├── horoscopeController.ts
│   ├── followController.ts
│   ├── commentsController.ts
│   └── reactionsController.ts
├── middleware/      # Express middleware
│   ├── auth.ts             # JWT/opaque token auth
│   ├── errorHandler.ts     # Global error handling
│   └── validation.ts       # Request validation
├── routes/          # API route definitions
├── services/        # Business logic
│   ├── claudeService.ts    # AI integration
│   ├── horoscopeService.ts
│   ├── notificationService.ts
│   └── socketService.ts
├── sockets/         # Socket.io handlers
│   ├── socketAuth.ts
│   ├── roomHandlers.ts
│   └── roomHandlers-optimized.ts
├── types/           # TypeScript definitions
├── utils/           # Utilities
│   ├── asyncHandler.ts     # Async route wrapper
│   ├── colors.ts          # 15+ distinct colors
│   ├── pagination.ts      # Pagination helpers
│   └── prismaSelects.ts   # Reusable queries
├── app.ts          # Express app setup
└── index.ts        # Server entry point

docs/               # iOS integration guides
prisma/             # Schema and migrations
scripts/            # Utility scripts
```

## Key Commands

```bash
# Development
npm run dev                    # Start dev server with hot reload (port 3000)

# Build & Production
npm run build                  # Compile TypeScript to dist/
npm start                      # Run production server
rm -rf dist/                   # Clean build artifacts

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

Main entities:
- **User**: Auth0 ID, email, username, profile (firstName, dateOfBirth), avatarUrl, oneSignalPlayerId
  - Denormalized counts: followersCount, followingCount
- **Room**: Collaborative canvas rooms (2+ participants)
  - `name`: REQUIRED room name
  - `isPublic`: Public visibility for discovery
  - `createdBy`: Room creator (special permissions)
  - `backgroundColor`, `backgroundImageUrl`, `backgroundImageThumbUrl`: Customization
  - `updatedAt`: Auto-updates on any change
  - Denormalized: `_count.likes`
- **RoomParticipant**: Links users to rooms
  - `lastVisitedAt`: For unread tracking
  - `lastReadAt`: For message read receipts
  - `color`: Unique color per participant
- **Element**: Canvas items (soft-deleted)
  - Types: NOTE, PHOTO, AUDIO, VIDEO, LINK, HOROSCOPE
  - Transform fields: rotation, scaleX, scaleY, originX, originY
  - Denormalized: `_count.comments`
- **Message**: Room text messages (1000 char limit)
  - Soft delete support
  - Heart reactions via MessageReaction
- **Comment**: Element comments (140 char limit)
  - Mentions support (@username)
  - Likes via CommentLike
- **Follow**: User following relationships
  - Triggers maintain denormalized counts
- **Notification**: In-app notification feed
  - 11 types for various events
  - Deep linking support

## Authentication & Profile Flow

### Authentication
Dual authentication modes:
1. **JWT Tokens** (preferred): When iOS includes `audience` parameter
2. **Opaque Tokens** (fallback): Validated via Auth0's `/userinfo` endpoint

The auth middleware (`src/middleware/auth.ts`) automatically detects and handles both types.

### Profile Completion Requirements
New users must complete profile before accessing features:
- **Username**: 3-20 characters, alphanumeric + underscore only, unique
- **First Name**: Required, non-empty
- **Date of Birth**: Required, user must be 13+ years old

Users with incomplete profiles (username starting with `user_`) are blocked from most endpoints.

## API Endpoints

### Public Endpoints
- `GET /health` - Health check
- `POST /api/test/token` - Debug token issues (development only)

### Auth Endpoints
- `POST /api/auth/verify` - Verify token and create/get user
- `POST /api/auth/complete-profile` - Complete profile setup
- `GET /api/auth/check-username?username=xxx` - Check availability

### User Endpoints
Profile NOT required:
- `GET /api/users/me` - Get current user with `profileComplete` flag
- `PUT /api/users/me` - Update profile

Profile REQUIRED:
- `GET /api/users/search?username=xxx` - Search with follow status
- `GET /api/users/all` - List all users
- `GET /api/users/without-rooms` - Users for new room creation
- `GET /api/users/:id` - Get user profile
- `GET /api/users/:id/followers` - User's followers (paginated)
- `GET /api/users/:id/following` - Who user follows (paginated)

### Following System
- `POST /api/following/follow` - Follow user (body: `{ userId }`)
- `POST /api/following/unfollow` - Unfollow user
- `GET /api/following/feed` - Public rooms from followed users (paginated)

### Room Endpoints
- `GET /api/rooms/my-rooms` - **PRIMARY** All rooms with unread indicators
- `POST /api/rooms` - Create room
  - Body: `{ name: "Required", participantIds: ["userId1", "userId2"] }`
- `GET /api/rooms/:id` - Room details with elements
- `PUT /api/rooms/:id/name` - Update room name
- `PUT /api/rooms/:id/background` - Update background
- `POST /api/rooms/:id/join` - Join room (updates lastVisitedAt)
- `POST /api/rooms/:id/leave` - Leave room
- `DELETE /api/rooms/:id` - Delete room (creator only)
- `POST /api/rooms/:id/permanently-leave` - Permanent leave (non-creators)
- `GET /api/rooms/:id/elements` - Get elements
- `POST /api/rooms/:id/participants` - Add participant (any member)
- `DELETE /api/rooms/:id/participants/:userId` - Remove participant

### Element Comments & Reactions
- `GET /api/rooms/:roomId/elements/:elementId/comments` - Get comments
- `POST /api/rooms/:roomId/elements/:elementId/comments` - Add comment
- `DELETE /api/rooms/:roomId/elements/:elementId/comments/:commentId` - Delete
- `POST /api/rooms/:roomId/elements/:elementId/comments/:commentId/like` - Like
- `DELETE /api/rooms/:roomId/elements/:elementId/comments/:commentId/like` - Unlike
- `POST /api/rooms/:roomId/elements/:elementId/reactions` - Add reaction
- `DELETE /api/rooms/:roomId/elements/:elementId/reactions` - Remove reaction

### Room-Level Interactions
- `POST /api/rooms/:id/like` - Like room
- `DELETE /api/rooms/:id/like` - Unlike room
- `POST /api/rooms/:id/reactions` - Add room reaction (body: `{ emoji }`)
- `DELETE /api/rooms/:id/reactions` - Remove room reaction

### Messaging
- `GET /api/rooms/:id/messages` - Get messages (30 per page)
- `POST /api/rooms/:id/messages` - Send message (1000 char limit)
- `DELETE /api/rooms/:id/messages/:messageId` - Delete message
- `POST /api/rooms/:id/messages/:messageId/heart` - Heart message
- `DELETE /api/rooms/:id/messages/:messageId/heart` - Remove heart
- `PUT /api/rooms/:id/messages/read` - Mark messages as read

### Notifications
- `PUT /api/notifications/player-id` - Update OneSignal player ID
- `GET /api/notifications` - Get notifications (paginated)
- `PUT /api/notifications/:id/read` - Mark as read
- `GET /api/notifications/unread-count` - Get unread count

### Upload Endpoints
- `POST /api/upload/image` - Upload image (10MB max)
- `POST /api/upload/audio` - Upload audio (25MB max)
- `POST /api/upload/video` - Upload video (25MB max, 10s limit)
- `POST /api/upload/background` - Upload room background (10MB max)

### Horoscope
- `POST /api/horoscope/generate` - Generate horoscope for room participants

## Real-time Features (Socket.io)

### Connection
```javascript
const socket = io('http://localhost:3000', {
  auth: { token: 'Bearer <token>' }
});
```

### Client Events
**Room Management:**
- `room:join` - Join room (REQUIRED before other operations)
- `room:leave` - Leave current room

**Touch Tracking:**
- `touch:move` - Send position `{ x, y, elementId? }`
- `touch:end` - End touch

**Element Operations:**
- `element:create` - Create element (server generates ID)
  - Types: "note", "photo", "audio", "video", "link", "horoscope"
  - Required: type, positionX, positionY, width, height
  - Optional: content, imageUrl, audioUrl, duration, rotation, scale
- `element:update` - Update element (use sparingly)
- `element:delete` - Soft delete
- `element:bring-to-front` - Move to top z-index
- `element:transforming` - Preview transform (high frequency)
- `element:transform` - Commit transform to database

**Comments & Reactions:**
- `comment:add` - Add comment (140 chars)
- `comment:delete` - Delete comment
- `reaction:add` - Add element reaction
- `reaction:remove` - Remove reaction

**Messaging:**
- `message:send` - Send message (1000 chars)
- `message:delete` - Delete message
- `message:heart` - Toggle heart reaction
- `typing:start` - Start typing indicator
- `typing:stop` - Stop typing indicator

**Room Operations:**
- `room:clear` - Clear all elements (creator only)
- `room:background` - Update background

### Server Broadcasts
- `user:joined/left` - User presence
- `touch:moved/ended` - Touch updates
- `element:created/updated/deleted` - Element changes
- `element:z-index-changed` - Z-index updates
- `element:transform-preview` - Transform preview
- `element:transformed` - Transform committed
- `comment:added/deleted` - Comment updates
- `reaction:added/removed` - Reaction updates
- `message:received/deleted/hearted` - Message events
- `user:typing` - Typing indicators
- `room:background-changed` - Background updates
- `room:cleared` - All elements cleared
- `error` - Error messages

## Push Notifications

OneSignal notifications sent for:
1. **Room Events**: Created, renamed, deleted
2. **Element Events**: Added (batched), comments, reactions
3. **Social Events**: New follower, mentions
4. **Message Events**: New messages, hearts

iOS implementation:
1. Initialize OneSignal with app ID
2. Set external user ID: `OneSignal.login(userId)`
3. Send player ID to backend: `PUT /api/notifications/player-id`
4. Handle deep links to navigate to specific content

## Performance Optimizations

1. **Denormalized Counts**: Database triggers maintain counts
2. **Efficient Queries**: Prisma selects minimize data transfer
3. **Transform Preview**: Two-phase system for smooth dragging
4. **Message Pagination**: 30 messages per page
5. **Notification Batching**: Groups element additions
6. **Optimized Socket Handlers**: Separate file for performance-critical paths

## Security Features

1. **Rate Limiting**: 100 requests per 15 minutes per IP
2. **CORS**: Configured for all origins in development
3. **Authentication**: All API routes require Auth0 tokens (except health)
4. **Soft Deletes**: Elements, messages, comments use `deletedAt`
5. **Age Verification**: Users must be 13+ years old
6. **Profile Completion**: Enforced before user interaction

## Development Tips

- Server listens on `0.0.0.0:3000` for mobile device access
- Auth middleware has extensive logging for debugging
- Use `/api/test/token` to debug authentication
- Prisma Studio for visual database management
- Clean build artifacts after major refactoring: `rm -rf dist/`

## Common Tasks

### Adding New API Endpoint
1. Create controller in `src/controllers/`
2. Add route in `src/routes/`
3. Import route in `src/app.ts`
4. Use `asyncHandler` wrapper
5. Apply auth middleware

### Adding Socket.io Event
1. Add handler in `src/sockets/roomHandlers.ts`
2. Verify room participant
3. Use `io.to(roomId).emit()` for broadcasts
4. Update room `updatedAt` if needed

### Database Changes
1. Modify `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name <description>`
3. Run `npm run prisma:generate`
4. Update relevant controllers and types

## Environment Variables

Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection
- `AUTH0_DOMAIN` - Auth0 tenant domain
- `AUTH0_AUDIENCE` - API identifier
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `ONESIGNAL_APP_ID`, `ONESIGNAL_API_KEY` - Push notifications
- `CLAUDE_API_KEY` - AI features
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (development/production)

## Troubleshooting

### Token Issues
- Check `/api/test/token` for format analysis
- Ensure iOS sends audience parameter for JWT tokens
- Console logs show detailed auth flow

### Socket Issues
- Must emit `room:join` before other operations
- Check for emoji-prefixed console logs
- Common problems:
  - No sync: Forgot `room:join`
  - Wrong IDs: Use server-generated element IDs
  - Lag: Use `touch:move` for dragging, not `element:update`

### Database Issues
- Run `npm run prisma:generate` after schema changes
- Check `DATABASE_URL` format
- Use `npx prisma db push` for quick sync in dev

## Architecture Decisions

1. **No Friendship System**: Direct room creation with any user
2. **Multi-Person Rooms**: 2+ participants with dynamic management
3. **Public Rooms**: Discovery through following feed
4. **Soft Deletes**: Data integrity and recovery
5. **Dual Token Support**: JWT preferred, opaque for compatibility
6. **Server-Generated IDs**: Prevent conflicts
7. **Profile Completion**: Ensure valid usernames and age verification
8. **Stateless Touch Events**: Performance optimization
9. **Denormalized Counts**: Reduce query complexity
10. **Transform Preview**: Smooth UI without database writes