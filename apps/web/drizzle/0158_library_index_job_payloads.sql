ALTER TABLE "library_index_jobs"
  ADD COLUMN IF NOT EXISTS "payload_version" varchar(16) NOT NULL DEFAULT 'v2',
  ADD COLUMN IF NOT EXISTS "payload_json" json NOT NULL DEFAULT '{}'::json,
  ADD COLUMN IF NOT EXISTS "source" varchar(255),
  ADD COLUMN IF NOT EXISTS "source_metadata_json" json NOT NULL DEFAULT '{}'::json,
  ADD COLUMN IF NOT EXISTS "dedupe_key" varchar(255),
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_reason" varchar(64),
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_status" varchar(32),
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_attempt_count" integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_requested_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_completed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "knowledge_refresh_error" text;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "library_index_jobs_knowledge_refresh_idx"
  ON "library_index_jobs" ("tenant_id", "knowledge_refresh_status", "knowledge_refresh_requested_at");
