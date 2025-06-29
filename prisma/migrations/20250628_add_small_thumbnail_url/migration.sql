-- AlterTable: Add small thumbnail URL field
ALTER TABLE "elements" ADD COLUMN "small_thumbnail_url" TEXT;

-- CreateIndex: Add index for efficient recent elements query
CREATE INDEX "elements_room_id_created_at_idx" ON "elements"("room_id", "created_at" DESC);