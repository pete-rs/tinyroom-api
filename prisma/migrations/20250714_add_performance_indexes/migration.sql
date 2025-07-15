-- Add composite index for room participant lookups (speeds up room queries)
CREATE INDEX IF NOT EXISTS "idx_room_participants_user_room" ON "room_participants"("user_id", "room_id");

-- Add index for element queries with soft deletes (speeds up element listings)
CREATE INDEX IF NOT EXISTS "idx_elements_room_deleted" ON "elements"("room_id", "deleted_at") WHERE "deleted_at" IS NULL;

-- Add index for unread notifications (speeds up notification count queries)
CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread" ON "notifications"("user_id", "is_read") WHERE "is_read" = FALSE;

-- Add composite index for follow lookups (speeds up follow operations)
CREATE INDEX IF NOT EXISTS "idx_follows_follower_following" ON "follows"("follower_id", "following_id");