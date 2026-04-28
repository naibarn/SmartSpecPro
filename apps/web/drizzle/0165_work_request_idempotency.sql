ALTER TABLE "work_requests"
  ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(180),
  ADD COLUMN IF NOT EXISTS "idempotencyFingerprint" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "work_requests_tenant_idempotency_unique"
  ON "work_requests" ("tenantId", "idempotencyKey")
  WHERE "idempotencyKey" IS NOT NULL;
