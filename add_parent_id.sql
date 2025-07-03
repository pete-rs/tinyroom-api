-- Check if parent_id column exists, if not add it
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='comments' AND column_name='parent_id') THEN
        ALTER TABLE "comments" ADD COLUMN "parent_id" TEXT;
    END IF;
END $$;

-- Check if foreign key exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'comments_parent_id_fkey') THEN
        ALTER TABLE "comments" 
        ADD CONSTRAINT "comments_parent_id_fkey" 
        FOREIGN KEY ("parent_id") 
        REFERENCES "comments"("id") 
        ON DELETE CASCADE 
        ON UPDATE CASCADE;
    END IF;
END $$;

-- Check if index exists, if not create it
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'comments_parent_id_idx') THEN
        CREATE INDEX "comments_parent_id_idx" ON "comments"("parent_id");
    END IF;
END $$;