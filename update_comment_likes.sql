-- Update existing comments to have 0 like_count if NULL
UPDATE comments 
SET like_count = 0 
WHERE like_count IS NULL;