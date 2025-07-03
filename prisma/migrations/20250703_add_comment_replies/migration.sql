-- Add parent_id column to comments table for reply functionality
ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;

-- Add foreign key constraint
ALTER TABLE "comments" 
ADD CONSTRAINT "comments_parent_id_fkey" 
FOREIGN KEY ("parent_id") 
REFERENCES "comments"("id") 
ON DELETE CASCADE 
ON UPDATE CASCADE;

-- Create index for efficient reply lookups
CREATE INDEX IF NOT EXISTS "comments_parent_id_idx" ON "comments"("parent_id");