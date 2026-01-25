-- Add callbackUrl field to media_providers table
-- This field stores the webhook URL for async operations like Kie.ai task completion

ALTER TABLE media_providers ADD COLUMN IF NOT EXISTS "callbackUrl" VARCHAR(512);

-- Add comment for documentation
COMMENT ON COLUMN media_providers."callbackUrl" IS 'Callback URL for async operations (e.g., Kie.ai task completion webhook). Used when running behind a tunnel like cloudflared.';
