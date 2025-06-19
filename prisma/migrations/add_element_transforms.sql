-- Add transformation columns to elements table
-- These columns support phased rollout of pinch-to-scale and rotation features

-- Add rotation in degrees (0-360)
ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Add scale factors (1 = original size)
ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "scale_x" DOUBLE PRECISION NOT NULL DEFAULT 1;

ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "scale_y" DOUBLE PRECISION NOT NULL DEFAULT 1;

-- Add transform origin (0.5 = center, 0 = top/left, 1 = bottom/right)
ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "origin_x" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

ALTER TABLE "elements" 
ADD COLUMN IF NOT EXISTS "origin_y" DOUBLE PRECISION NOT NULL DEFAULT 0.5;

-- Add indexes for potential future queries
CREATE INDEX IF NOT EXISTS "elements_type_rotation_idx" ON "elements"("type", "rotation");

-- Add check constraints to ensure valid values
ALTER TABLE "elements" 
ADD CONSTRAINT "elements_scale_positive" 
CHECK ("scale_x" > 0 AND "scale_y" > 0);

ALTER TABLE "elements" 
ADD CONSTRAINT "elements_origin_range" 
CHECK ("origin_x" >= 0 AND "origin_x" <= 1 AND "origin_y" >= 0 AND "origin_y" <= 1);

-- Comment the columns for clarity
COMMENT ON COLUMN "elements"."rotation" IS 'Element rotation in degrees (0-360)';
COMMENT ON COLUMN "elements"."scale_x" IS 'Horizontal scale factor (1 = original size)';
COMMENT ON COLUMN "elements"."scale_y" IS 'Vertical scale factor (1 = original size)';
COMMENT ON COLUMN "elements"."origin_x" IS 'Transform origin X (0 = left, 0.5 = center, 1 = right)';
COMMENT ON COLUMN "elements"."origin_y" IS 'Transform origin Y (0 = top, 0.5 = center, 1 = bottom)';