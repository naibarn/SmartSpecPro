-- SPEC-293: persist trusted GitWorkspace scope against the existing canonical Project,
-- repository identity, registered Runner and opaque Runner workspace identity.
BEGIN;

CREATE UNIQUE INDEX "runner_nodes_tenant_runner_unique"
  ON "runner_nodes" ("tenantId", "runnerId");

CREATE TABLE "canonical_project_workspace_bindings" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" varchar(36) NOT NULL,
  "project_id" varchar(36) NOT NULL,
  "repository_id" varchar(160) NOT NULL,
  "scope" varchar(32) NOT NULL,
  "runner_id" varchar(160) NOT NULL,
  "workspace_id" varchar(200) NOT NULL,
  "lifecycle" varchar(16) NOT NULL DEFAULT 'ACTIVE',
  "created_by_principal_id" varchar(160) NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "revoked_at" timestamp with time zone,
  CONSTRAINT "canonical_project_workspace_bindings_project_fk"
    FOREIGN KEY ("tenant_id", "project_id")
    REFERENCES "canonical_projects"("tenant_id", "project_id") ON DELETE CASCADE,
  CONSTRAINT "canonical_project_workspace_bindings_runner_fk"
    FOREIGN KEY ("tenant_id", "runner_id")
    REFERENCES "runner_nodes"("tenantId", "runnerId") ON DELETE RESTRICT,
  CONSTRAINT "canonical_project_workspace_bindings_identity_unique"
    UNIQUE ("tenant_id", "project_id", "repository_id", "scope", "runner_id", "workspace_id"),
  CONSTRAINT "canonical_project_workspace_bindings_scope_check"
    CHECK ("scope" IN ('PLATFORM_ENGINEERING', 'PLATFORM_MANAGED', 'ADMIN_CREATOR', 'TENANT', 'USER', 'CUSTOMER_EXTERNAL_ORG')),
  CONSTRAINT "canonical_project_workspace_bindings_lifecycle_check"
    CHECK (("lifecycle" = 'ACTIVE' AND "revoked_at" IS NULL) OR ("lifecycle" = 'REVOKED' AND "revoked_at" IS NOT NULL)),
  CONSTRAINT "canonical_project_workspace_bindings_creator_check"
    CHECK (length(btrim("created_by_principal_id")) > 0)
);

CREATE INDEX "canonical_project_workspace_bindings_scope_idx"
  ON "canonical_project_workspace_bindings" ("tenant_id", "scope", "lifecycle");

COMMIT;
