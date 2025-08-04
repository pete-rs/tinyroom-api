-- Add contentAddedAt field to track when content (elements or background) was added
ALTER TABLE "rooms" ADD COLUMN "content_added_at" TIMESTAMP(3);

-- Migrate existing data: Set contentAddedAt to the latest of objectAddedAt or createdAt
UPDATE "rooms" SET "content_added_at" = GREATEST("object_added_at", "created_at");

-- Drop old tracking fields that are no longer needed
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "comments_updated_at";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "object_added_at";

-- Remove lastVisitedAt from room_participants (no longer tracking unread per room)
ALTER TABLE "room_participants" DROP COLUMN IF EXISTS "last_visited_at";

-- Add index for the new contentAddedAt field for efficient sorting
CREATE INDEX IF NOT EXISTS "idx_rooms_content_added" ON "rooms"("content_added_at" DESC NULLS LAST);

-- Add new notification type for background changes
ALTER TYPE "NotificationType" ADD VALUE 'BACKGROUND_CHANGED';