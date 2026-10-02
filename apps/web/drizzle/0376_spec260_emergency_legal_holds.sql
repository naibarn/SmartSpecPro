SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_evidence_tenant_case_id_unique" ON "emergency_evidence_assets" ("tenantId", "caseId", "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_legal_holds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "evidenceId" varchar(36) REFERENCES "emergency_evidence_assets"("id") ON DELETE RESTRICT,
  "reason" varchar(1000) NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "placedByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "releasedByUserId" integer REFERENCES "users"("id") ON DELETE RESTRICT,
  "releaseReason" varchar(1000),
  "idempotencyKey" varchar(200) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "releasedAt" timestamptz,
  CONSTRAINT "emergency_legal_hold_status_check" CHECK ("status" IN ('active', 'released')),
  CONSTRAINT "emergency_legal_hold_release_check" CHECK (("status" = 'active' AND "releasedAt" IS NULL AND "releasedByUserId" IS NULL AND "releaseReason" IS NULL) OR ("status" = 'released' AND "releasedAt" IS NOT NULL AND "releasedByUserId" IS NOT NULL AND "releaseReason" IS NOT NULL)),
  CONSTRAINT "emergency_legal_hold_case_tenant_fk" FOREIGN KEY ("tenantId", "caseId") REFERENCES "emergency_cases"("tenantId", "id") ON DELETE RESTRICT,
  CONSTRAINT "emergency_legal_hold_evidence_case_fk" FOREIGN KEY ("tenantId", "caseId", "evidenceId") REFERENCES "emergency_evidence_assets"("tenantId", "caseId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_legal_hold_tenant_key_unique" ON "emergency_legal_holds" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "emergency_legal_hold_case_status_idx" ON "emergency_legal_holds" ("tenantId", "caseId", "status");
CREATE INDEX IF NOT EXISTS "emergency_legal_hold_evidence_status_idx" ON "emergency_legal_holds" ("tenantId", "evidenceId", "status");
