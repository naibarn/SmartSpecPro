SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

-- Helper location is deliberately coarse and temporary. API writes must snap
-- coordinates to the public privacy grid before persistence.
CREATE TABLE IF NOT EXISTS "emergency_helper_profiles" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "optIn" boolean NOT NULL DEFAULT false,
  "capabilityCodes" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "coarseLocation" geography(Point,4326),
  "jurisdictionRef" varchar(160),
  "availableUntil" timestamptz,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_helper_profile_tenant_user_unique" ON "emergency_helper_profiles" ("tenantId", "userId");
CREATE INDEX IF NOT EXISTS "emergency_helper_profile_location_gist_idx" ON "emergency_helper_profiles" USING gist ("coarseLocation");
CREATE INDEX IF NOT EXISTS "emergency_helper_profile_active_idx" ON "emergency_helper_profiles" ("tenantId", "optIn", "availableUntil", "revokedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_disclosure_grants" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "subjectRef" varchar(160) NOT NULL,
  "recipientRef" varchar(160) NOT NULL,
  "purpose" varchar(96) NOT NULL,
  "resourceType" varchar(64) NOT NULL,
  "resourceRef" varchar(160) NOT NULL,
  "fields" jsonb NOT NULL,
  "jurisdictionRef" varchar(160) NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "revokedBy" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "auditEventId" varchar(36) REFERENCES "emergency_audit_events"("id") ON DELETE RESTRICT,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_disclosure_grant_fields_check" CHECK (jsonb_typeof("fields") = 'array' AND jsonb_array_length("fields") > 0)
);
CREATE INDEX IF NOT EXISTS "emergency_disclosure_grant_scope_idx" ON "emergency_disclosure_grants" ("tenantId", "recipientRef", "resourceType", "resourceRef", "expiresAt", "revokedAt");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_federation_partners" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "partnerRef" varchar(160) NOT NULL,
  "displayName" varchar(200) NOT NULL,
  "contractVersion" varchar(48) NOT NULL,
  "jurisdictionRefs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "capabilityRefs" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "status" varchar(24) NOT NULL DEFAULT 'pending',
  "trustLevel" varchar(24) NOT NULL DEFAULT 'unverified',
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_federation_partner_status_check" CHECK ("status" IN ('pending', 'active', 'paused', 'revoked')),
  CONSTRAINT "emergency_federation_partner_trust_check" CHECK ("trustLevel" IN ('unverified', 'verified', 'trusted'))
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_federation_partner_tenant_ref_unique" ON "emergency_federation_partners" ("tenantId", "partnerRef");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_federation_shares" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "partnerId" varchar(36) NOT NULL REFERENCES "emergency_federation_partners"("id") ON DELETE RESTRICT,
  "sourceTenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "sourceResourceType" varchar(64) NOT NULL,
  "sourceResourceRef" varchar(160) NOT NULL,
  "projectionJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "jurisdictionRef" varchar(160) NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "revokedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "emergency_federation_share_scope_idx" ON "emergency_federation_shares" ("tenantId", "partnerId", "expiresAt", "revokedAt");
CREATE INDEX IF NOT EXISTS "emergency_federation_share_source_idx" ON "emergency_federation_shares" ("sourceTenantId", "sourceResourceType", "sourceResourceRef");
