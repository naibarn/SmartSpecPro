DO $$
BEGIN
  CREATE TYPE "library_context_pack_status" AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_context_pack_source_mode" AS ENUM ('manual', 'view_backed', 'snapshot');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_context_pack_member_mode" AS ENUM ('include', 'exclude', 'pin');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_context_pack_runtime_tier" AS ENUM ('durable_memory', 'retrieved_evidence');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_context_pack_readiness_status" AS ENUM ('draft', 'review_pending', 'trusted', 'stale');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_context_pack_relation_policy" AS ENUM ('none', 'manual_only', 'one_hop_gated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_knowledge_relation_kind" AS ENUM ('wikilink', 'markdown');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_knowledge_resolution_status" AS ENUM ('resolved', 'ambiguous', 'unresolved', 'forbidden');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_knowledge_matched_by" AS ENUM ('logical_path', 'title', 'alias');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_knowledge_backfill_run_status" AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_saved_view_visibility" AS ENUM ('private', 'team');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE TYPE "library_saved_view_scope" AS ENUM ('all', 'my_library', 'private_vault', 'shared_with_me', 'shared_groups');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_saved_views" (
  "id" serial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "managing_group_id" integer REFERENCES "user_groups"("id") ON DELETE SET NULL,
  "slug" varchar(160) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "visibility_mode" "library_saved_view_visibility" NOT NULL DEFAULT 'private',
  "scope_mode" "library_saved_view_scope" NOT NULL DEFAULT 'all',
  "query_definition" json NOT NULL DEFAULT '{}'::json,
  "presentation_definition" json NOT NULL DEFAULT '{}'::json,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_saved_views_tenant_slug_unique"
  ON "library_saved_views" ("tenant_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_saved_views_tenant_owner_idx"
  ON "library_saved_views" ("tenant_id", "owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_saved_views_tenant_visibility_idx"
  ON "library_saved_views" ("tenant_id", "visibility_mode", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_context_packs" (
  "id" serial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "managing_group_id" integer REFERENCES "user_groups"("id") ON DELETE SET NULL,
  "slug" varchar(160) NOT NULL,
  "title" varchar(255) NOT NULL,
  "description" text,
  "status" "library_context_pack_status" NOT NULL DEFAULT 'draft',
  "source_mode" "library_context_pack_source_mode" NOT NULL,
  "saved_view_id" integer,
  "relation_expansion_policy" "library_context_pack_relation_policy" NOT NULL DEFAULT 'none',
  "default_runtime_tier" "library_context_pack_runtime_tier" NOT NULL DEFAULT 'retrieved_evidence',
  "budget_profile" varchar(32) NOT NULL DEFAULT 'retrieval',
  "max_note_count" integer,
  "max_token_hint" integer,
  "freshness_expectation" varchar(32),
  "readiness_status" "library_context_pack_readiness_status" NOT NULL DEFAULT 'draft',
  "approved_for_agents" boolean NOT NULL DEFAULT false,
  "submitted_for_review_at" timestamptz,
  "reviewed_at" timestamptz,
  "approved_at" timestamptz,
  "reviewer_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "last_source_mutation_at" timestamptz,
  "fresh_until" timestamptz,
  "metadata" json NOT NULL DEFAULT '{}'::json,
  "archived_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "library_context_packs"
  ADD COLUMN IF NOT EXISTS "submitted_for_review_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reviewed_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "approved_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "reviewer_user_id" integer,
  ADD COLUMN IF NOT EXISTS "last_source_mutation_at" timestamptz,
  ADD COLUMN IF NOT EXISTS "fresh_until" timestamptz;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_context_packs_saved_view_fk'
  ) THEN
    ALTER TABLE "library_context_packs"
      ADD CONSTRAINT "library_context_packs_saved_view_fk"
      FOREIGN KEY ("saved_view_id") REFERENCES "library_saved_views"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'library_context_packs_reviewer_user_fk'
  ) THEN
    ALTER TABLE "library_context_packs"
      ADD CONSTRAINT "library_context_packs_reviewer_user_fk"
      FOREIGN KEY ("reviewer_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_context_packs_tenant_slug_unique"
  ON "library_context_packs" ("tenant_id", "slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_packs_tenant_status_idx"
  ON "library_context_packs" ("tenant_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_packs_tenant_owner_idx"
  ON "library_context_packs" ("tenant_id", "owner_user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_packs_tenant_readiness_idx"
  ON "library_context_packs" ("tenant_id", "readiness_status", "approved_for_agents");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_packs_saved_view_idx"
  ON "library_context_packs" ("saved_view_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_context_pack_members" (
  "id" serial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "context_pack_id" integer NOT NULL REFERENCES "library_context_packs"("id") ON DELETE CASCADE,
  "library_item_id" integer NOT NULL REFERENCES "library_items"("id") ON DELETE CASCADE,
  "member_mode" "library_context_pack_member_mode" NOT NULL,
  "order_index" integer NOT NULL DEFAULT 0,
  "rationale" text,
  "snapshot_metadata" json NOT NULL DEFAULT '{}'::json,
  "created_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "library_context_pack_members_unique"
  ON "library_context_pack_members" ("context_pack_id", "library_item_id", "member_mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_pack_members_pack_idx"
  ON "library_context_pack_members" ("context_pack_id", "member_mode", "order_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_pack_members_item_idx"
  ON "library_context_pack_members" ("library_item_id", "member_mode");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_context_pack_members_tenant_idx"
  ON "library_context_pack_members" ("tenant_id", "context_pack_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_knowledge_notes" (
  "library_item_id" integer PRIMARY KEY REFERENCES "library_items"("id") ON DELETE CASCADE,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "logical_path" varchar(512),
  "normalized_title" varchar(512) NOT NULL,
  "aliases" json NOT NULL DEFAULT '[]'::json,
  "tags" json NOT NULL DEFAULT '[]'::json,
  "properties" json NOT NULL DEFAULT '{}'::json,
  "headings" json NOT NULL DEFAULT '[]'::json,
  "diagnostics" json NOT NULL DEFAULT '{}'::json,
  "content_fingerprint" varchar(128),
  "source_updated_at" timestamptz NOT NULL,
  "last_extracted_at" timestamptz NOT NULL DEFAULT now(),
  "last_visibility_refresh_at" timestamptz,
  "last_backfilled_at" timestamptz,
  "is_stale" boolean NOT NULL DEFAULT false,
  "stale_reason" varchar(64),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_logical_path_idx"
  ON "library_knowledge_notes" ("tenant_id", "logical_path");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_title_idx"
  ON "library_knowledge_notes" ("tenant_id", "normalized_title");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_notes_tenant_stale_idx"
  ON "library_knowledge_notes" ("tenant_id", "is_stale", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_knowledge_relations" (
  "id" serial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "source_library_item_id" integer NOT NULL REFERENCES "library_items"("id") ON DELETE CASCADE,
  "target_library_item_id" integer REFERENCES "library_items"("id") ON DELETE CASCADE,
  "relation_kind" "library_knowledge_relation_kind" NOT NULL,
  "raw_reference" text NOT NULL,
  "display_text" text,
  "target_path" varchar(512),
  "target_heading" varchar(255),
  "resolution_status" "library_knowledge_resolution_status" NOT NULL,
  "matched_by" "library_knowledge_matched_by",
  "matched_value" varchar(512),
  "candidate_library_item_ids" json NOT NULL DEFAULT '[]'::json,
  "diagnostics" json NOT NULL DEFAULT '{}'::json,
  "extracted_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_relations_source_idx"
  ON "library_knowledge_relations" ("source_library_item_id", "relation_kind");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_relations_target_idx"
  ON "library_knowledge_relations" ("target_library_item_id", "resolution_status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_relations_tenant_status_idx"
  ON "library_knowledge_relations" ("tenant_id", "resolution_status", "updated_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "library_knowledge_backfill_runs" (
  "id" serial PRIMARY KEY,
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "requested_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "status" "library_knowledge_backfill_run_status" NOT NULL DEFAULT 'queued',
  "total_notes" integer NOT NULL DEFAULT 0,
  "processed_notes" integer NOT NULL DEFAULT 0,
  "successful_notes" integer NOT NULL DEFAULT 0,
  "failed_notes" integer NOT NULL DEFAULT 0,
  "retry_count" integer NOT NULL DEFAULT 0,
  "last_cursor_library_item_id" integer,
  "last_error" text,
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_backfill_runs_tenant_status_idx"
  ON "library_knowledge_backfill_runs" ("tenant_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "library_knowledge_backfill_runs_tenant_started_idx"
  ON "library_knowledge_backfill_runs" ("tenant_id", "started_at");
