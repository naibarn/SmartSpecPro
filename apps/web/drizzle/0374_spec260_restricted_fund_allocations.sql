SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "emergency_support_pools_tenant_id_unique" ON "emergency_support_pools" ("tenantId", "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "emergency_fund_allocations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "poolId" varchar(36) NOT NULL REFERENCES "emergency_support_pools"("id") ON DELETE RESTRICT,
  "purposeCode" varchar(64) NOT NULL,
  "restriction" varchar(500) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "currency" varchar(3) NOT NULL DEFAULT 'THB',
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "journalEntryId" varchar(36) NOT NULL REFERENCES "economic_journal_entries"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(200) NOT NULL,
  "createdByUserId" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "closedAt" timestamptz,
  CONSTRAINT "emergency_fund_allocation_amount_check" CHECK ("amountMinorUnits" > 0 AND "currency" = 'THB'),
  CONSTRAINT "emergency_fund_allocation_status_check" CHECK ("status" IN ('active', 'closed', 'cancelled')),
  CONSTRAINT "emergency_fund_allocation_pool_tenant_fk" FOREIGN KEY ("tenantId", "poolId") REFERENCES "emergency_support_pools"("tenantId", "id") ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS "emergency_fund_allocation_tenant_idempotency_unique" ON "emergency_fund_allocations" ("tenantId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "emergency_fund_allocation_pool_status_idx" ON "emergency_fund_allocations" ("tenantId", "poolId", "status", "createdAt");
