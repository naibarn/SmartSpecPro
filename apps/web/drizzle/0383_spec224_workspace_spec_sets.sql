CREATE TABLE IF NOT EXISTS "spec224_conversation_workspaces" (
  "conversationId" integer PRIMARY KEY REFERENCES "conversations"("id") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "runnerId" varchar(160) NOT NULL REFERENCES "runner_nodes"("runnerId") ON DELETE RESTRICT,
  "workspaceId" varchar(200) NOT NULL,
  "snapshotRevision" varchar(128) NOT NULL,
  "revision" integer NOT NULL DEFAULT 1,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec224_conversation_workspaces_revision_check" CHECK ("revision" > 0)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "spec224_conversation_workspaces_scope_idx" ON "spec224_conversation_workspaces" ("tenantId", "actorId");
CREATE INDEX IF NOT EXISTS "spec224_conversation_workspaces_runner_idx" ON "spec224_conversation_workspaces" ("tenantId", "runnerId", "workspaceId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spec224_workspace_spec_set_revisions" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "runnerId" varchar(160) NOT NULL,
  "workspaceId" varchar(200) NOT NULL,
  "revision" integer NOT NULL,
  "parentRevision" integer,
  "digest" varchar(64) NOT NULL,
  "requestDigest" varchar(64) NOT NULL,
  "idempotencyKey" varchar(160) NOT NULL,
  "filesJson" jsonb NOT NULL,
  "replacedPathsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "requirementCount" integer NOT NULL,
  "runnableWorkPackageCount" integer NOT NULL,
  "blockedWorkPackageCount" integer NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "spec224_workspace_spec_set_revision_check" CHECK ("revision" > 0),
  CONSTRAINT "spec224_workspace_spec_set_digest_check" CHECK ("digest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "spec224_workspace_spec_set_request_digest_check" CHECK ("requestDigest" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "spec224_workspace_spec_set_files_size_check" CHECK (octet_length("filesJson"::text) <= 4194304)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "spec224_workspace_spec_set_revision_unique" ON "spec224_workspace_spec_set_revisions" ("tenantId", "actorId", "runnerId", "workspaceId", "revision");
CREATE UNIQUE INDEX IF NOT EXISTS "spec224_workspace_spec_set_idempotency_unique" ON "spec224_workspace_spec_set_revisions" ("tenantId", "actorId", "runnerId", "workspaceId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "spec224_workspace_spec_set_latest_idx" ON "spec224_workspace_spec_set_revisions" ("tenantId", "actorId", "runnerId", "workspaceId", "revision");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "spec224_workspace_spec_set_heads" (
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "runnerId" varchar(160) NOT NULL,
  "workspaceId" varchar(200) NOT NULL,
  "currentRevision" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("tenantId", "actorId", "runnerId", "workspaceId"),
  CONSTRAINT "spec224_workspace_spec_set_heads_revision_check" CHECK ("currentRevision" >= 0)
);
