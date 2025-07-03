-- Drop the last_read_at column from room_participants
ALTER TABLE room_participants DROP COLUMN IF EXISTS last_read_at;