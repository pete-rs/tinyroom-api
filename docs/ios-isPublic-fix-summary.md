# Fix: Room isPublic Field Not Returning Correct Value

## Issue
iOS was receiving `isPublic: false` for rooms that had `is_public: true` in the database.

## Root Cause
The `getMyRooms` endpoint was using a raw SQL query that wasn't selecting the `is_public` field. When a field is missing from the query results, it defaults to the schema default value (false).

## What Was Fixed

### 1. Added `is_public` to SQL SELECT
```sql
SELECT 
  r.id,
  r.name,
  r.is_public,  -- ADDED THIS
  ...
```

### 2. Added to TypeScript interface
```typescript
interface {
  is_public: boolean;  // ADDED THIS
  ...
}
```

### 3. Added to GROUP BY clause
```sql
GROUP BY r.id, r.name, ..., r.is_public  -- ADDED THIS
```

### 4. Added to response mapping
```typescript
return {
  isPublic: room.is_public,  // ADDED THIS
  ...
}
```

## Affected Endpoints

### ✅ Fixed
- `GET /api/rooms/my-rooms` - Now returns correct `isPublic` value

### ✅ Already Working
- `GET /api/rooms/:id` - Was already returning correct value (uses Prisma include)
- `POST /api/rooms` - Returns correct value
- `PUT /api/rooms/:id/visibility` - Returns correct value

## For iOS

No changes needed on your side! The API now returns the correct `isPublic` value. 

Test it:
1. Call `GET /api/rooms/my-rooms` 
2. Rooms with `is_public: true` in DB will now show `isPublic: true` in response
3. Your settings toggle should now show the correct state

## Debug Logging Added

For `GET /api/rooms/:id`, I've added debug logging:
```
🔍 [GET ROOM xxx] Room from DB: { id: 'xxx', name: 'xxx', isPublic: true, ... }
```

This will help verify the correct value is being returned from the database.