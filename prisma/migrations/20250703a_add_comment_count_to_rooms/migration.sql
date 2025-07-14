-- Add comment_count column to rooms table
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "comment_count" INTEGER NOT NULL DEFAULT 0;

-- Update comment_count for existing rooms
UPDATE "rooms" 
SET "comment_count" = (
    SELECT COUNT(*) 
    FROM "comments" 
    WHERE "comments"."room_id" = "rooms"."id" 
    AND "comments"."deleted_at" IS NULL
);