-- Feature 185: Skill Framework storyboard projects and reusable characters.
-- Additive/idempotent migration. Existing Drama tables and media are untouched.
CREATE TABLE IF NOT EXISTS "storyboard_skill_projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "project_key" varchar(160) NOT NULL,
  "title" varchar(256) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "review_id" integer REFERENCES "media_studio_storyboard_reviews"("id") ON DELETE SET NULL,
  "active_run_id" uuid,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_skill_projects_tenant_key_unique" ON "storyboard_skill_projects" ("tenant_id", "project_key");
CREATE INDEX IF NOT EXISTS "storyboard_skill_projects_owner_status_idx" ON "storyboard_skill_projects" ("tenant_id", "user_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "storyboard_skill_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "project_id" uuid NOT NULL REFERENCES "storyboard_skill_projects"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "idempotency_key" varchar(160) NOT NULL,
  "confirmation_fingerprint" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'awaiting_confirmation',
  "normalized_snapshot" jsonb NOT NULL,
  "skill_snapshot" jsonb NOT NULL,
  "model_snapshot" jsonb NOT NULL,
  "error" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "started_at" timestamptz,
  "completed_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_skill_runs_tenant_idempotency_unique" ON "storyboard_skill_runs" ("tenant_id", "idempotency_key");
CREATE INDEX IF NOT EXISTS "storyboard_skill_runs_project_status_idx" ON "storyboard_skill_runs" ("project_id", "status", "updated_at");
CREATE INDEX IF NOT EXISTS "storyboard_skill_runs_owner_idx" ON "storyboard_skill_runs" ("tenant_id", "user_id", "created_at");

CREATE TABLE IF NOT EXISTS "storyboard_skill_shots" (
  "id" bigserial PRIMARY KEY,
  "run_id" uuid NOT NULL REFERENCES "storyboard_skill_runs"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "shot_number" integer NOT NULL,
  "beat" varchar(80) NOT NULL,
  "context" text NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "skill_input" jsonb NOT NULL,
  "skill_response" jsonb,
  "generation_prompt" text,
  "generation_request" jsonb,
  "effective_generation_request" jsonb,
  "image_asset_id" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "video_prompt" text,
  "video_model_id" varchar(160),
  "attempt" integer NOT NULL DEFAULT 0,
  "error" jsonb,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "storyboard_skill_shots_number_check" CHECK ("shot_number" BETWEEN 1 AND 12)
);
CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_skill_shots_run_number_unique" ON "storyboard_skill_shots" ("run_id", "shot_number");
CREATE INDEX IF NOT EXISTS "storyboard_skill_shots_tenant_status_idx" ON "storyboard_skill_shots" ("tenant_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "character_library_characters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "character_key" varchar(160) NOT NULL,
  "name" varchar(160) NOT NULL,
  "current_revision" integer NOT NULL DEFAULT 1,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "archived_at" timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_library_tenant_key_unique" ON "character_library_characters" ("tenant_id", "character_key");
CREATE INDEX IF NOT EXISTS "character_library_owner_status_idx" ON "character_library_characters" ("tenant_id", "user_id", "status", "updated_at");

CREATE TABLE IF NOT EXISTS "character_library_revisions" (
  "id" bigserial PRIMARY KEY,
  "character_id" uuid NOT NULL REFERENCES "character_library_characters"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "profile_json" jsonb NOT NULL,
  "skill_snapshot" jsonb NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_library_revision_unique" ON "character_library_revisions" ("character_id", "revision");
CREATE INDEX IF NOT EXISTS "character_library_revision_tenant_idx" ON "character_library_revisions" ("tenant_id", "created_at");

CREATE TABLE IF NOT EXISTS "character_library_looks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "character_id" uuid NOT NULL REFERENCES "character_library_characters"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "look_json" jsonb NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "character_library_looks_owner_idx" ON "character_library_looks" ("tenant_id", "character_id", "status");

CREATE TABLE IF NOT EXISTS "character_library_assets" (
  "id" bigserial PRIMARY KEY,
  "character_id" uuid NOT NULL REFERENCES "character_library_characters"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "media_asset_id" bigint NOT NULL REFERENCES "media_assets"("id") ON DELETE RESTRICT,
  "role" varchar(40) NOT NULL DEFAULT 'reference',
  "revision" integer NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "character_library_asset_unique" ON "character_library_assets" ("character_id", "media_asset_id", "role");
CREATE INDEX IF NOT EXISTS "character_library_assets_owner_idx" ON "character_library_assets" ("tenant_id", "character_id");

CREATE TABLE IF NOT EXISTS "storyboard_skill_project_characters" (
  "id" bigserial PRIMARY KEY,
  "project_id" uuid NOT NULL REFERENCES "storyboard_skill_projects"("id") ON DELETE CASCADE,
  "character_id" uuid NOT NULL REFERENCES "character_library_characters"("id") ON DELETE RESTRICT,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revision" integer NOT NULL,
  "name_snapshot" varchar(160) NOT NULL,
  "role_snapshot" varchar(120),
  "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "look_id" uuid REFERENCES "character_library_looks"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE "storyboard_skill_project_characters" ADD COLUMN IF NOT EXISTS "snapshot_json" jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_skill_project_character_unique" ON "storyboard_skill_project_characters" ("project_id", "character_id");
CREATE INDEX IF NOT EXISTS "storyboard_skill_project_characters_owner_idx" ON "storyboard_skill_project_characters" ("tenant_id", "project_id");
