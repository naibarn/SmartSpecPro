-- Add model field to gallery_items table
-- This stores the AI model used to generate the content

ALTER TABLE gallery_items ADD COLUMN IF NOT EXISTS model VARCHAR(128);

-- Add index for faster model-based filtering
CREATE INDEX IF NOT EXISTS idx_gallery_items_model ON gallery_items(model);
