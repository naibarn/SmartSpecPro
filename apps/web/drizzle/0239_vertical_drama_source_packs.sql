-- Feature 156: normalized Story Sources & Media aggregate.
-- Expand-only and idempotent. Legacy productTieIn/look fields remain readable.
CREATE TABLE IF NOT EXISTS "vertical_drama_source_pack_sessions" (
  "draftSessionId" varchar(128) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "expiresAt" timestamptz NOT NULL,
  "claimedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_pack_sessions_owner_idx"
  ON "vertical_drama_source_pack_sessions" ("tenantId", "userId", "status", "expiresAt");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_drama_source_packs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "seriesId" bigint REFERENCES "vertical_drama_series"("id") ON DELETE CASCADE,
  "draftSessionId" varchar(128) REFERENCES "vertical_drama_source_pack_sessions"("draftSessionId") ON DELETE SET NULL,
  "profileId" varchar(64) NOT NULL,
  "profileVersion" integer NOT NULL DEFAULT 1,
  "visualVersion" integer NOT NULL DEFAULT 1,
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "attachIdempotencyKey" varchar(256),
  "digestVersion" integer NOT NULL DEFAULT 0,
  "attachedAt" timestamptz,
  "deletedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_source_packs_attach_key_unique"
  ON "vertical_drama_source_packs" ("tenantId", "userId", "attachIdempotencyKey")
  WHERE "attachIdempotencyKey" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_source_packs_active_session_unique"
  ON "vertical_drama_source_packs" ("tenantId", "userId", "draftSessionId")
  WHERE "draftSessionId" IS NOT NULL AND "seriesId" IS NULL AND "deletedAt" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_packs_series_idx"
  ON "vertical_drama_source_packs" ("tenantId", "seriesId");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_drama_source_assets" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "mediaAssetId" bigint REFERENCES "media_assets"("id") ON DELETE SET NULL,
  "clientMutationKey" varchar(128),
  "sourceKind" varchar(32) NOT NULL,
  "title" varchar(180) NOT NULL,
  "description" text,
  "provenanceJson" jsonb,
  "rightsStatus" varchar(32) NOT NULL DEFAULT 'pending',
  "disclosureStatus" varchar(32) NOT NULL DEFAULT 'not_required',
  "analysisStatus" varchar(32) NOT NULL DEFAULT 'not_requested',
  "analysisVersion" integer NOT NULL DEFAULT 0,
  "deletedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_assets_pack_idx"
  ON "vertical_drama_source_assets" ("tenantId", "packId", "deletedAt");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vds_source_assets_mutation_unique"
  ON "vertical_drama_source_assets" ("tenantId", "userId", "packId", "clientMutationKey")
  WHERE "clientMutationKey" IS NOT NULL AND "deletedAt" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_drama_source_slots" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "sourceAssetId" bigint REFERENCES "vertical_drama_source_assets"("id") ON DELETE SET NULL,
  "slotKey" varchar(96) NOT NULL,
  "title" varchar(180) NOT NULL,
  "narrativeDescription" text,
  "sourceKind" varchar(32) NOT NULL DEFAULT 'custom',
  "required" boolean NOT NULL DEFAULT false,
  "usagePolicy" varchar(32) NOT NULL DEFAULT 'reference',
  "status" varchar(32) NOT NULL DEFAULT 'draft',
  "version" integer NOT NULL DEFAULT 1,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "deletedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vds_source_slots_pack_key_unique" UNIQUE ("packId", "slotKey")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_slots_pack_order_idx"
  ON "vertical_drama_source_slots" ("tenantId", "packId", "sortOrder");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_drama_source_analyses" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "sourceAssetId" bigint NOT NULL REFERENCES "vertical_drama_source_assets"("id") ON DELETE CASCADE,
  "policyVersion" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "suggestion" text,
  "evidenceJson" jsonb,
  "errorCode" varchar(96),
  "attemptCount" integer NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "vds_source_analysis_policy_unique" UNIQUE ("tenantId", "sourceAssetId", "policyVersion")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vertical_drama_source_pack_audit_events" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "packId" bigint NOT NULL REFERENCES "vertical_drama_source_packs"("id") ON DELETE CASCADE,
  "eventType" varchar(64) NOT NULL,
  "metadataJson" jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vds_source_pack_events_lookup_idx"
  ON "vertical_drama_source_pack_audit_events" ("tenantId", "packId", "createdAt");
