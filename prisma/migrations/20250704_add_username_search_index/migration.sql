-- Add index for fast username prefix search
-- Using varchar_pattern_ops for LIKE queries with prefix matching
CREATE INDEX IF NOT EXISTS "users_username_prefix_idx" 
ON "users" ("username" varchar_pattern_ops);

-- Also add a lowercase index for case-insensitive search
CREATE INDEX IF NOT EXISTS "users_username_lower_idx" 
ON "users" (LOWER("username") varchar_pattern_ops);