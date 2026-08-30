-- Preserve original presentation export URLs for audit while making the
-- protected R2 proxy URL the only canonical playback URL.
ALTER TABLE "presentation_exports"
  ADD COLUMN IF NOT EXISTS "output_original_url" text;

CREATE INDEX IF NOT EXISTS "presentation_exports_tenant_user_storage_idx"
  ON "presentation_exports" ("tenant_id", "user_id", "output_storage_key");
