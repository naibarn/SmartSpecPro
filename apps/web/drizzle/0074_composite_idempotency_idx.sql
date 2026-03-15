-- Drop the old global unique index (scoped only to idempotencyKey)
DROP INDEX IF EXISTS "automation_jobs_idempotency_idx";

-- Create a composite unique index scoped to tenant so the same idempotency
-- key can be reused across different tenants without collision.
CREATE UNIQUE INDEX "automation_jobs_idempotency_idx" ON "automation_jobs"("tenantId", "idempotencyKey");
