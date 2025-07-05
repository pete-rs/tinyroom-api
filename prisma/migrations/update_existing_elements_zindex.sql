-- Update existing elements to have sequential z-index values based on creation order
WITH ranked_elements AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY room_id ORDER BY created_at ASC) - 1 as new_z_index
  FROM elements
  WHERE z_index IS NULL
)
UPDATE elements
SET z_index = ranked_elements.new_z_index
FROM ranked_elements
WHERE elements.id = ranked_elements.id;

-- Ensure no NULL values remain
UPDATE elements SET z_index = 0 WHERE z_index IS NULL;