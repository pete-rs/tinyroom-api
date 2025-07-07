-- Create PhotoStyle enum
CREATE TYPE "PhotoStyle" AS ENUM ('squared_photo', 'rounded_photo', 'polaroid_photo', 'cutout', 'cutout_white_sticker', 'cutout_black_sticker');

-- Add photo style fields to elements table
ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "image_alpha_mask_url" TEXT,
ADD COLUMN IF NOT EXISTS "image_thumbnail_alpha_mask_url" TEXT,
ADD COLUMN IF NOT EXISTS "selected_style" "PhotoStyle" DEFAULT 'squared_photo';

-- Add index for photo elements with masks
CREATE INDEX IF NOT EXISTS "elements_type_alpha_mask_idx" 
ON "elements"("type", "image_alpha_mask_url") 
WHERE "type" = 'PHOTO' AND "image_alpha_mask_url" IS NOT NULL;