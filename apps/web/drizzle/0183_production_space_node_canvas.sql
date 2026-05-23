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

ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "id" bigserial;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "tenantId" varchar(36);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "userId" integer;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "productionRunId" varchar(128);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "space" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "changeKind" varchar(40) DEFAULT 'space';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "changedFields" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "spaceHash" varchar(128);
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "status" varchar(40) DEFAULT 'goal_draft';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "archivedAt" timestamp with time zone;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "deletedAt" timestamp with time zone;
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(32) DEFAULT '1.0.0';
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "createdAt" timestamp with time zone DEFAULT now();
ALTER TABLE "media_production_spaces" ADD COLUMN IF NOT EXISTS "updatedAt" timestamp with time zone DEFAULT now();

UPDATE "media_production_spaces"
SET
  "version" = COALESCE("version", 1),
  "space" = COALESCE("space", '{}'::jsonb),
  "changeKind" = COALESCE("changeKind", 'space'),
  "changedFields" = COALESCE("changedFields", '[]'::jsonb),
  "status" = COALESCE("status", 'goal_draft'),
  "contractVersion" = COALESCE("contractVersion", '1.0.0'),
  "createdAt" = COALESCE("createdAt", now()),
  "updatedAt" = COALESCE("updatedAt", now());

CREATE UNIQUE INDEX IF NOT EXISTS "media_production_spaces_unique"
  ON "media_production_spaces" ("tenantId", "productionRunId", "version");

CREATE INDEX IF NOT EXISTS "media_production_spaces_run_idx"
  ON "media_production_spaces" ("tenantId", "productionRunId", "createdAt");

CREATE INDEX IF NOT EXISTS "media_production_spaces_user_status_idx"
  ON "media_production_spaces" ("userId", "status", "updatedAt");
