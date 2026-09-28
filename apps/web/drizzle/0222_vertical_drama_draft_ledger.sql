-- Durable pre-create Vertical Drama draft ledger.
-- Every version is immutable; the manifest row is advanced with a locked
-- currentVersion so concurrent workers cannot silently overwrite one another.
CREATE TABLE IF NOT EXISTS "vertical_drama_draft_ledgers" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "draftSessionId" varchar(120) NOT NULL,
  "currentVersion" integer NOT NULL DEFAULT 0,
  "currentStage" varchar(40) NOT NULL DEFAULT 'created',
  "currentJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "currentMarkdownKey" text,
  "currentJsonKey" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vdd_ledger_owner_session_unique" UNIQUE ("tenantId", "userId", "draftSessionId")
);

-- A wizard session may intentionally create multiple generations over time;
-- draftId remains the collision-free identity. Keep only a lookup index for
-- the owner/session pair, not a uniqueness constraint.
ALTER TABLE "vertical_drama_draft_ledgers"
  DROP CONSTRAINT IF EXISTS "vdd_ledger_owner_session_unique";

CREATE INDEX IF NOT EXISTS "vdd_ledger_owner_updated_idx"
  ON "vertical_drama_draft_ledgers" ("tenantId", "userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "vertical_drama_draft_versions" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "draftId" varchar(36) NOT NULL REFERENCES "vertical_drama_draft_ledgers"("id") ON DELETE CASCADE,
  "version" integer NOT NULL,
  "stage" varchar(40) NOT NULL,
  "contentJson" jsonb NOT NULL,
  "markdown" text NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "jsonStorageKey" text NOT NULL,
  "markdownStorageKey" text NOT NULL,
  "parentVersion" integer,
  "jobId" varchar(36),
  "runId" varchar(36),
  "changedPaths" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vdd_versions_draft_version_unique" UNIQUE ("draftId", "version")
);

CREATE INDEX IF NOT EXISTS "vdd_versions_draft_created_idx"
  ON "vertical_drama_draft_versions" ("draftId", "createdAt");
CREATE INDEX IF NOT EXISTS "vdd_versions_hash_idx"
  ON "vertical_drama_draft_versions" ("contentHash");
