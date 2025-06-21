# Public Room Access - Technical Documentation

## Overview

Public rooms can be accessed by anyone, not just participants. This enables discovery through the following feed and allows users to join public rooms from people they follow.

## Key Changes

### 1. GET /api/rooms/:id
Now allows viewing public rooms even if you're not a participant:
- First checks if user is a participant (existing behavior)
- If not a participant, checks if room is public
- Returns 404 if neither condition is met

### 2. POST /api/rooms/:id/join
Now allows joining public rooms as a new participant:
- Existing participants: Updates their status to active
- Non-participants + Public room: Adds them as a new participant with an assigned color
- Non-participants + Private room: Returns 403 error

## Access Rules

### Private Rooms (isPublic: false)
- **View (GET)**: Only participants
- **Join (POST)**: Only existing participants
- **Elements/Messages**: Only participants

### Public Rooms (isPublic: true)
- **View (GET)**: Anyone
- **Join (POST)**: Anyone (adds as participant if not already)
- **Elements/Messages**: Only participants (must join first)

## Flow for Following Feed

1. User sees public room in following feed
2. User taps to view room → `GET /api/rooms/:id` (allowed for public rooms)
3. User wants to interact → `POST /api/rooms/:id/join` (adds them as participant)
4. User can now:
   - Create elements
   - Send messages
   - See real-time updates

## Implementation Details

### Join Room Logic
```typescript
if (!existingParticipant) {
  // For public rooms, allow non-participants to join
  if (!room.isPublic) {
    throw new AppError(403, 'NOT_PARTICIPANT', 'You are not a participant in this room');
  }
  
  // Add user as a new participant to the public room
  const color = getAvailableColor(room.participants.map(p => p.color));
  await prisma.roomParticipant.create({
    data: {
      roomId: id,
      userId: req.user.id,
      color,
      isActive: true,
      lastVisitedAt: new Date(),
    },
  });
}
```

### Get Room Logic
```typescript
// First try to find the room with user as participant
let room = await prisma.room.findFirst({
  where: { id, participants: { some: { userId: req.user.id } } },
  include: { /* ... */ }
});

// If not found as participant, check if it's a public room
if (!room) {
  room = await prisma.room.findFirst({
    where: { id, isPublic: true },
    include: { /* ... */ }
  });
}
```

## Security Considerations

1. **Read-only by default**: Non-participants can only view public rooms
2. **Explicit join required**: Must join to create content
3. **Private rooms protected**: No change to private room access
4. **Participant limits**: Consider adding max participants for public rooms

## iOS Implementation

### Viewing Public Room from Feed
```swift
// 1. Get room details (works for public rooms now)
let room = await api.getRoom(roomId: roomId)

// 2. Check if user is participant
let isParticipant = room.participants.contains { $0.userId == currentUserId }

// 3. Show join button if not participant
if !isParticipant {
    showJoinButton()
}
```

### Joining Public Room
```swift
// Join room (automatically adds as participant if public)
await api.joinRoom(roomId: roomId)

// Now user can interact with room
canCreateElements = true
canSendMessages = true
```

## Error Handling

### 403 NOT_PARTICIPANT
Only thrown when:
- Trying to join a private room without being a participant
- Other participant-only actions on private rooms

### 404 ROOM_NOT_FOUND
Thrown when:
- Room doesn't exist
- Room is private and user is not a participant