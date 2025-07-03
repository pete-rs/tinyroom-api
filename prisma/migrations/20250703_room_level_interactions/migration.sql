-- Drop old tables (data loss accepted)
DROP TABLE IF EXISTS comment_likes CASCADE;
DROP TABLE IF EXISTS element_comments CASCADE;
DROP TABLE IF EXISTS element_reactions CASCADE;
DROP TABLE IF EXISTS message_reads CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS messages CASCADE;

-- Create new comments table (replacing messages)
CREATE TABLE comments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  text TEXT NOT NULL CHECK (char_length(text) <= 500),
  referenced_element_id TEXT REFERENCES elements(id) ON DELETE CASCADE,
  referenced_element_type "ElementType",
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  CONSTRAINT valid_element_reference CHECK (
    (referenced_element_id IS NULL AND referenced_element_type IS NULL) OR
    (referenced_element_id IS NOT NULL AND referenced_element_type IS NOT NULL)
  )
);

-- Create room reactions table
CREATE TABLE room_reactions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  emoji VARCHAR(10) NOT NULL DEFAULT '❤️',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(room_id, user_id)
);

-- Update rooms table
ALTER TABLE rooms 
  DROP COLUMN IF EXISTS messages_updated_at,
  ADD COLUMN comments_updated_at TIMESTAMP,
  ADD COLUMN reaction_count INTEGER DEFAULT 0 CHECK (reaction_count >= 0),
  ADD COLUMN last_reaction_at TIMESTAMP;

-- Add indexes for performance
CREATE INDEX idx_comments_room_created ON comments(room_id, created_at DESC);
CREATE INDEX idx_comments_element ON comments(referenced_element_id) WHERE referenced_element_id IS NOT NULL;
CREATE INDEX idx_comments_user ON comments(user_id);
CREATE INDEX idx_room_reactions_room ON room_reactions(room_id);
CREATE INDEX idx_room_reactions_user ON room_reactions(user_id);