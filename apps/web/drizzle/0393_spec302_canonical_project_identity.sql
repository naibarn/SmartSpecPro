-- SPEC-302 Wave 1: additive canonical project identity, ACL and App binding.
-- Existing domain project records remain their own lifecycle authorities.

BEGIN;

CREATE UNIQUE INDEX "app_identities_tenant_app_id_unique"
  ON "app_identities" ("tenant_id", "app_id");

CREATE TABLE "canonical_projects" (
  "project_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "project_type" varchar(40) NOT NULL,
  "title" varchar(200) NOT NULL,
  "owner_principal_id" varchar(160) NOT NULL,
  "aliases" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "lifecycle" varchar(24) NOT NULL DEFAULT 'ACTIVE',
  "identity_version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "canonical_projects_tenant_project_unique" UNIQUE ("tenant_id", "project_id"),
  CONSTRAINT "canonical_projects_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'ARCHIVED', 'DELETED_PENDING_RETENTION', 'RETIRED')),
  CONSTRAINT "canonical_projects_title_nonempty_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "canonical_projects_owner_nonempty_check" CHECK (length(btrim("owner_principal_id")) > 0),
  CONSTRAINT "canonical_projects_type_nonempty_check" CHECK (length(btrim("project_type")) > 0)
);

CREATE INDEX "canonical_projects_owner_idx"
  ON "canonical_projects" ("tenant_id", "owner_principal_id", "lifecycle", "updated_at" DESC);

CREATE TABLE "canonical_project_memberships" (
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "principal_id" varchar(160) NOT NULL,
  "role" varchar(16) NOT NULL,
  "lifecycle" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  CONSTRAINT "canonical_project_memberships_pk" PRIMARY KEY ("tenant_id", "project_id", "principal_id"),
  CONSTRAINT "canonical_project_memberships_project_fk" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "canonical_project_memberships_role_check" CHECK ("role" IN ('owner', 'editor', 'viewer')),
  CONSTRAINT "canonical_project_memberships_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'REVOKED')),
  CONSTRAINT "canonical_project_memberships_revocation_check" CHECK (("lifecycle" = 'ACTIVE' AND "revoked_at" IS NULL) OR ("lifecycle" = 'REVOKED' AND "revoked_at" IS NOT NULL))
);

CREATE INDEX "canonical_project_memberships_principal_idx"
  ON "canonical_project_memberships" ("tenant_id", "principal_id", "lifecycle");

CREATE TABLE "canonical_project_app_bindings" (
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "app_id" varchar(128) NOT NULL,
  "relation" varchar(32) NOT NULL DEFAULT 'USES',
  "lifecycle" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "canonical_project_app_bindings_pk" PRIMARY KEY ("tenant_id", "project_id", "app_id"),
  CONSTRAINT "canonical_project_app_bindings_project_fk" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "canonical_project_app_bindings_app_fk" FOREIGN KEY ("tenant_id", "app_id") REFERENCES "app_identities"("tenant_id", "app_id") ON DELETE CASCADE,
  CONSTRAINT "canonical_project_app_bindings_relation_check" CHECK (length(btrim("relation")) > 0),
  CONSTRAINT "canonical_project_app_bindings_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'REVOKED'))
);

CREATE TABLE "mini_app_research_notes" (
  "note_id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "app_id" varchar(128) NOT NULL,
  "owner_principal_id" varchar(160) NOT NULL,
  "title" varchar(200) NOT NULL,
  "content" text NOT NULL DEFAULT '',
  "ai_summary" text,
  "lifecycle" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "mini_app_research_notes_tenant_note_unique" UNIQUE ("tenant_id", "note_id"),
  CONSTRAINT "mini_app_research_notes_project_fk" FOREIGN KEY ("tenant_id", "project_id") REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "mini_app_research_notes_app_fk" FOREIGN KEY ("tenant_id", "app_id") REFERENCES "app_identities"("tenant_id", "app_id") ON DELETE CASCADE,
  CONSTRAINT "mini_app_research_notes_lifecycle_check" CHECK ("lifecycle" IN ('ACTIVE', 'ARCHIVED')),
  CONSTRAINT "mini_app_research_notes_title_nonempty_check" CHECK (length(btrim("title")) > 0),
  CONSTRAINT "mini_app_research_notes_owner_nonempty_check" CHECK (length(btrim("owner_principal_id")) > 0),
  CONSTRAINT "mini_app_research_notes_content_size_check" CHECK (octet_length("content") <= 262144)
);

CREATE INDEX "mini_app_research_notes_project_updated_idx"
  ON "mini_app_research_notes" ("tenant_id", "project_id", "updated_at" DESC, "note_id");

COMMIT;
