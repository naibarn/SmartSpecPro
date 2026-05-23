CREATE TABLE IF NOT EXISTS "media_production_spaces" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "version" integer NOT NULL,
  "space" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "changeKind" varchar(40) DEFAULT 'space' NOT NULL,
  "changedFields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "spaceHash" varchar(128) NOT NULL,
  "status" varchar(40) DEFAULT 'goal_draft' NOT NULL,
  "archivedAt" timestamp with time zone,
  "deletedAt" timestamp with time zone,
  "contractVersion" varchar(32) DEFAULT '1.0.0' NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "media_production_spaces_unique"
  ON "media_production_spaces" ("tenantId", "productionRunId", "version");

CREATE INDEX IF NOT EXISTS "media_production_spaces_run_idx"
  ON "media_production_spaces" ("tenantId", "productionRunId", "createdAt");

CREATE INDEX IF NOT EXISTS "media_production_spaces_user_status_idx"
  ON "media_production_spaces" ("userId", "status", "updatedAt");
