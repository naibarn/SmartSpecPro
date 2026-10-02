SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_cases_tenant_id_unique" ON "emergency_cases" ("tenantId", "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_case_review_items" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "caseId" varchar(36) NOT NULL REFERENCES "emergency_cases"("id") ON DELETE RESTRICT,
  "kind" varchar(24) NOT NULL,
  "state" varchar(24) NOT NULL DEFAULT 'open',
  "caseRevision" integer NOT NULL,
  "basisJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "dueAt" timestamptz,
  "openedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "resolvedByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "resolutionReason" varchar(500),
  "resolvedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "emergency_case_review_item_kind_check" CHECK ("kind" IN ('verification', 'reassessment', 'no_response')),
  CONSTRAINT "emergency_case_review_item_state_check" CHECK ("state" IN ('open', 'completed', 'cancelled')),
  CONSTRAINT "emergency_case_review_item_revision_check" CHECK ("caseRevision" >= 0),
  CONSTRAINT "emergency_case_review_item_tenant_case_fk" FOREIGN KEY ("tenantId", "caseId") REFERENCES "emergency_cases"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_case_review_item_tenant_id_unique" ON "emergency_case_review_items" ("tenantId", "id");
CREATE INDEX IF NOT EXISTS "emergency_case_review_item_queue_idx" ON "emergency_case_review_items" ("tenantId", "state", "kind", "dueAt", "createdAt");
CREATE INDEX IF NOT EXISTS "emergency_case_review_item_case_idx" ON "emergency_case_review_items" ("tenantId", "caseId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_case_review_item_open_unique" ON "emergency_case_review_items" ("tenantId", "caseId", "kind") WHERE "state" = 'open';
