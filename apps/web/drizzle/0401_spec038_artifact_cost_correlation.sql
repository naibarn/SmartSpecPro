ALTER TABLE provider_usage_log ADD COLUMN IF NOT EXISTS "contentGenerationId" uuid;
ALTER TABLE content_artifacts ADD COLUMN IF NOT EXISTS "contentGenerationId" uuid;
CREATE INDEX IF NOT EXISTS provider_usage_log_content_generation_id_idx ON provider_usage_log ("contentGenerationId");
CREATE INDEX IF NOT EXISTS content_artifacts_content_generation_id_idx ON content_artifacts ("contentGenerationId");
