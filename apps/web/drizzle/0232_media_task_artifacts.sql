-- Durable Media Studio provider provenance and R2 artifact ledger.
-- Additive and idempotent so it can be applied safely after interrupted deploys.

CREATE TABLE IF NOT EXISTS "media_task_artifacts" (
  "id" bigserial PRIMARY KEY,
  "source_kind" varchar(32) NOT NULL,
  "source_task_id" varchar(256) NOT NULL,
  "output_index" integer NOT NULL DEFAULT 0,
  "tenant_id" varchar(36) NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "media_type" varchar(16) NOT NULL,
  "provider" varchar(64),
  "model" varchar(255),
  "provider_original_url" text,
  "provider_status" varchar(24) NOT NULL DEFAULT 'unknown',
  "provider_checked_at" timestamptz,
  "provider_error" text,
  "media_asset_id" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "r2_storage_key" text,
  "r2_status" varchar(24) NOT NULL DEFAULT 'pending',
  "r2_error" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "next_retry_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "media_task_artifacts_owner_source_output_unique"
  ON "media_task_artifacts" ("tenant_id", "user_id", "source_kind", "source_task_id", "output_index");
CREATE INDEX IF NOT EXISTS "media_task_artifacts_tenant_user_created_idx"
  ON "media_task_artifacts" ("tenant_id", "user_id", "created_at");
CREATE INDEX IF NOT EXISTS "media_task_artifacts_status_retry_idx"
  ON "media_task_artifacts" ("r2_status", "next_retry_at");
