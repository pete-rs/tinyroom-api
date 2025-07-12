-- Add sticker element reference to rooms
ALTER TABLE "rooms" ADD COLUMN "sticker_element_id" TEXT;

-- Add foreign key constraint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_sticker_element_id_fkey" 
FOREIGN KEY ("sticker_element_id") REFERENCES "elements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for faster lookups
CREATE INDEX "rooms_sticker_element_id_idx" ON "rooms"("sticker_element_id");