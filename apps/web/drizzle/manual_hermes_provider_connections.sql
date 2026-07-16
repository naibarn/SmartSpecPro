-- Feature 135 (Hermes Grok media worker) — section-02-db-schema.
-- New table `hermes_provider_connections` + two new enums. Purely additive:
-- no existing table/column touched, so no data-loss risk and no backup of
-- existing tables is required (Database Safety Protocol §Risk
-- Classification: ADD TABLE is not in the risk table at all — it is the
-- lowest-risk category, equivalent to "new object, zero blast radius").
--
-- Hand-authored from drizzle/schema.ts because `drizzle-kit generate` is
-- blocked by the same pre-existing meta-journal collision (0146/0147)
-- documented for the prior manual migrations in this directory (see
-- manual_vertical_drama_series_watermark.sql and siblings). Verified via
-- `npx drizzle-kit generate` failing with:
--   "Error: [drizzle/meta/0146_snapshot.json, drizzle/meta/0147_snapshot.json]
--    are pointing to a parent snapshot: drizzle/meta/0146_snapshot.json/snapshot.json
--    which is a collision."
-- This collision predates this change (git status shows drizzle/meta/* and
-- drizzle/*.sql unmodified at HEAD) and is out of scope for section-02 to fix.
--
-- Not seeded into drizzle.__drizzle_migrations — following the established
-- convention for this repo's manual_*.sql files (none of the 14 prior
-- manual_*.sql migrations are hash-seeded either; they are applied directly
-- via psql and tracked only by this file's presence + git history).
--
-- Idempotent + transactional, matching the manual_video_intelligence_tables.sql
-- sibling convention: whole file wrapped in BEGIN;...COMMIT;, CREATE TABLE and
-- all CREATE [UNIQUE] INDEX statements use IF NOT EXISTS, and both CREATE TYPE
-- statements are guarded via DO $$ ... EXCEPTION WHEN duplicate_object THEN
-- NULL; END $$; (Postgres has no CREATE TYPE IF NOT EXISTS). Safe to re-run.

BEGIN;

DO $$ BEGIN
  CREATE TYPE "hermes_connection_scope" AS ENUM (
    'server_shared',
    'server_personal',
    'private_worker'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "hermes_connection_status" AS ENUM (
    'pending',
    'authorized',
    'reauth_required',
    'entitlement_restricted',
    'disconnected',
    'error'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "hermes_provider_connections" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ownerUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "scope" "hermes_connection_scope" NOT NULL,
  "providerType" varchar(64) NOT NULL DEFAULT 'xai_grok',
  "adapterType" varchar(64) NOT NULL DEFAULT 'hermes_cli',
  "authenticationType" varchar(64) NOT NULL DEFAULT 'oauth_device_code',
  "status" "hermes_connection_status" NOT NULL DEFAULT 'pending',
  "assignedWorkerId" varchar(36) REFERENCES "workers"("id") ON DELETE SET NULL,
  "profileReference" varchar(255) NOT NULL,
  "accountLabel" varchar(120),
  "accountHint" varchar(120),
  "entitlementStatus" varchar(64),
  "capabilitiesJson" jsonb,
  "defaultForImage" boolean NOT NULL DEFAULT false,
  "defaultForVideo" boolean NOT NULL DEFAULT false,
  "dailyJobQuota" integer,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "authorizedAt" timestamp with time zone,
  "lastProbeAt" timestamp with time zone,
  "disconnectedAt" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "hermes_provider_connections_tenant_owner_status_idx"
  ON "hermes_provider_connections" ("tenantId", "ownerUserId", "status");

CREATE INDEX IF NOT EXISTS "hermes_provider_connections_tenant_scope_status_idx"
  ON "hermes_provider_connections" ("tenantId", "scope", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "hermes_provider_connections_default_image_unique"
  ON "hermes_provider_connections" ("tenantId", "ownerUserId")
  WHERE "defaultForImage" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted');

CREATE UNIQUE INDEX IF NOT EXISTS "hermes_provider_connections_default_video_unique"
  ON "hermes_provider_connections" ("tenantId", "ownerUserId")
  WHERE "defaultForVideo" = true AND "status" IN ('authorized', 'reauth_required', 'entitlement_restricted');

COMMIT;
