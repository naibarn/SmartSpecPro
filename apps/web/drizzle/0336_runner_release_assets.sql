-- Feature 205 registry bootstrap. Older deployments may already have these
-- tables from manual_smartaihub_runner_registry.sql; every statement is safe
-- to re-run before adding the release/update foreign keys.
CREATE TABLE IF NOT EXISTS "runner_nodes" (
  "runnerId" varchar(160) PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "ownerUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "nodeKind" varchar(32) NOT NULL,
  "profile" varchar(32) NOT NULL,
  "deviceId" varchar(160),
  "displayName" varchar(255) NOT NULL,
  "trustState" varchar(32) NOT NULL DEFAULT 'pending',
  "status" varchar(32) NOT NULL DEFAULT 'offline',
  "currentSnapshotRevision" varchar(128),
  "currentSnapshotJson" jsonb,
  "snapshotObservedAt" timestamptz,
  "snapshotExpiresAt" timestamptz,
  "lastSeenAt" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenantId", "deviceId")
);
CREATE INDEX IF NOT EXISTS "runner_nodes_tenant_status_idx" ON "runner_nodes" ("tenantId", "status");
CREATE TABLE IF NOT EXISTS "runner_capability_snapshots" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "runnerId" varchar(160) NOT NULL REFERENCES "runner_nodes"("runnerId") ON DELETE CASCADE,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "revision" varchar(128) NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "observedAt" timestamptz NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "snapshotJson" jsonb NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("runnerId", "revision"),
  UNIQUE ("runnerId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS "runner_snapshots_tenant_created_idx" ON "runner_capability_snapshots" ("tenantId", "createdAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "runner_release_assets" (
  "id" serial PRIMARY KEY NOT NULL,
  "version" varchar(64) NOT NULL,
  "platform" varchar(24) NOT NULL,
  "architecture" varchar(24) NOT NULL,
  "profile" varchar(32) NOT NULL,
  "channel" varchar(24) NOT NULL DEFAULT 'stable',
  "assetKind" varchar(24) NOT NULL,
  "fileName" varchar(260) NOT NULL,
  "contentType" varchar(256) NOT NULL DEFAULT 'application/octet-stream',
  "storageKey" text NOT NULL,
  "fileSizeBytes" bigint NOT NULL,
  "fileSha256" varchar(64) NOT NULL,
  "signature" text,
  "contractVersion" varchar(64) NOT NULL DEFAULT 'sah-runner-v1',
  "manifestJson" jsonb,
  "validationStatus" varchar(24) NOT NULL DEFAULT 'valid',
  "validationChecksJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "provenanceJson" jsonb NOT NULL,
  "releaseNotes" text,
  "isPublished" boolean NOT NULL DEFAULT false,
  "publishedAt" timestamptz,
  "withdrawnAt" timestamptz,
  "uploadedBy" integer REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION,
  "uploadedAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "runner_release_assets_identity_unique"
  ON "runner_release_assets" ("version", "platform", "architecture", "profile", "channel", "assetKind");
CREATE UNIQUE INDEX IF NOT EXISTS "runner_release_assets_storage_key_unique"
  ON "runner_release_assets" ("storageKey");
CREATE INDEX IF NOT EXISTS "runner_release_assets_latest_idx"
  ON "runner_release_assets" ("platform", "architecture", "profile", "channel", "isPublished", "withdrawnAt", "version");
