-- Add emoji column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'element_reactions' 
                   AND column_name = 'emoji') THEN
        ALTER TABLE "element_reactions" ADD COLUMN "emoji" TEXT;
    END IF;
END $$;

-- Update existing HEART reactions to ❤️ emoji if type column exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'element_reactions' 
               AND column_name = 'type') THEN
        UPDATE "element_reactions" SET "emoji" = '❤️' WHERE "type" = 'HEART';
        ALTER TABLE "element_reactions" DROP COLUMN "type";
    END IF;
END $$;

-- Make emoji column required if not already
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'element_reactions' 
               AND column_name = 'emoji' 
               AND is_nullable = 'YES') THEN
        ALTER TABLE "element_reactions" ALTER COLUMN "emoji" SET NOT NULL;
    END IF;
END $$;

-- Drop enum type if it exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ReactionType') THEN
        DROP TYPE "ReactionType";
    END IF;
END $$;