SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_intel_sources" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceRef" varchar(160) NOT NULL,
  "displayName" varchar(200) NOT NULL,
  "sourceType" varchar(32) NOT NULL,
  "canonicalOrigin" varchar(512),
  "independenceGroup" varchar(160) NOT NULL,
  "jurisdictionRef" varchar(160) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'disabled',
  "policyJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_intel_source_type_check" CHECK ("sourceType" IN ('official', 'partner', 'field', 'manual')),
  CONSTRAINT "emergency_intel_source_status_check" CHECK ("status" IN ('disabled', 'pending_review', 'active', 'paused', 'revoked'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_source_tenant_ref_unique" ON "emergency_intel_sources" ("tenantId", "sourceRef");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_source_tenant_id_unique" ON "emergency_intel_sources" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "emergency_intel_source_status_idx" ON "emergency_intel_sources" ("tenantId", "status", "updatedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_intel_captures" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceId" varchar(36) NOT NULL REFERENCES "emergency_intel_sources"("id") ON DELETE RESTRICT,
  "sourceItemRef" varchar(512) NOT NULL,
  "contentHash" varchar(64) NOT NULL,
  "objectRef" varchar(1024),
  "mediaType" varchar(128) NOT NULL,
  "byteLength" bigint NOT NULL,
  "observedAt" timestamptz,
  "capturedAt" timestamptz NOT NULL DEFAULT now(),
  "provenanceJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "expiresAt" timestamptz,
  CONSTRAINT "emergency_intel_capture_hash_check" CHECK ("contentHash" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "emergency_intel_capture_length_check" CHECK ("byteLength" > 0 AND "byteLength" <= 10485760),
  CONSTRAINT "emergency_intel_capture_source_tenant_fk" FOREIGN KEY ("tenantId", "sourceId") REFERENCES "emergency_intel_sources"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_capture_source_item_hash_unique" ON "emergency_intel_captures" ("tenantId", "sourceId", "sourceItemRef", "contentHash");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_capture_tenant_id_unique" ON "emergency_intel_captures" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "emergency_intel_capture_source_time_idx" ON "emergency_intel_captures" ("tenantId", "sourceId", "capturedAt");
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_situations_tenant_id_unique" ON "emergency_situations" ("tenantId", "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_intel_claims" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "claimRef" varchar(32) NOT NULL,
  "situationId" varchar(36) REFERENCES "emergency_situations"("id") ON DELETE RESTRICT,
  "claimText" varchar(1200) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'unreviewed',
  "confidence" numeric(5,4),
  "independenceGroupCount" integer NOT NULL DEFAULT 0,
  "revision" integer NOT NULL DEFAULT 0,
  "correctionOfClaimId" varchar(36) REFERENCES "emergency_intel_claims"("id") ON DELETE RESTRICT,
  "publicProjectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "reviewedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "reviewedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_intel_claim_status_check" CHECK ("status" IN ('unreviewed', 'under_review', 'verified', 'disputed', 'retracted', 'superseded')),
  CONSTRAINT "emergency_intel_claim_confidence_check" CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1)),
  CONSTRAINT "emergency_intel_claim_revision_check" CHECK ("revision" >= 0 AND "independenceGroupCount" >= 0),
  CONSTRAINT "emergency_intel_claim_situation_tenant_fk" FOREIGN KEY ("tenantId", "situationId") REFERENCES "emergency_situations"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_claim_tenant_ref_unique" ON "emergency_intel_claims" ("tenantId", "claimRef");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_intel_claim_tenant_id_unique" ON "emergency_intel_claims" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "emergency_intel_claim_review_idx" ON "emergency_intel_claims" ("tenantId", "status", "createdAt");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'emergency_intel_claim_correction_tenant_fk') THEN
    ALTER TABLE "emergency_intel_claims" ADD CONSTRAINT "emergency_intel_claim_correction_tenant_fk"
      FOREIGN KEY ("tenantId", "correctionOfClaimId") REFERENCES "emergency_intel_claims"("tenantId", "id") ON DELETE RESTRICT;
  END IF;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_intel_claim_sources" (
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "claimId" varchar(36) NOT NULL REFERENCES "emergency_intel_claims"("id") ON DELETE RESTRICT,
  "captureId" varchar(36) NOT NULL REFERENCES "emergency_intel_captures"("id") ON DELETE RESTRICT,
  "sourceRole" varchar(24) NOT NULL DEFAULT 'supports',
  "independenceGroup" varchar(160) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_intel_claim_source_pk" PRIMARY KEY ("tenantId", "claimId", "captureId"),
  CONSTRAINT "emergency_intel_claim_source_role_check" CHECK ("sourceRole" IN ('supports', 'contradicts', 'context')),
  CONSTRAINT "emergency_intel_claim_source_claim_tenant_fk" FOREIGN KEY ("tenantId", "claimId") REFERENCES "emergency_intel_claims"("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "emergency_intel_claim_source_capture_tenant_fk" FOREIGN KEY ("tenantId", "captureId") REFERENCES "emergency_intel_captures"("tenantId", "id") ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS "emergency_intel_claim_source_group_idx" ON "emergency_intel_claim_sources" ("tenantId", "claimId", "independenceGroup");
