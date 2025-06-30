-- AlterTable: Add object_added_at field and seed with current updated_at values
ALTER TABLE "rooms" ADD COLUMN "object_added_at" TIMESTAMP(3);

-- Update existing rooms to have object_added_at match their updated_at
UPDATE "rooms" SET "object_added_at" = "updated_at";

-- Make the column NOT NULL after populating it
ALTER TABLE "rooms" ALTER COLUMN "object_added_at" SET NOT NULL;

-- Set default for new rooms
ALTER TABLE "rooms" ALTER COLUMN "object_added_at" SET DEFAULT CURRENT_TIMESTAMP;