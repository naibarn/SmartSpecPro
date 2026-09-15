-- Feature 186: indexes for atomic per-tenant/class and global admission checks.
-- The control plane still owns the limits; these indexes keep the guarded
-- count query bounded as the lifecycle ledger grows.

CREATE INDEX IF NOT EXISTS "worker_jobs_admission_tenant_class_status_idx"
  ON "worker_jobs" ("tenantId", "executionClass", "status")
  WHERE "status" IN (
    'pending', 'queued', 'leased', 'claimed', 'preparing', 'running',
    'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing'
  );--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "worker_jobs_admission_class_status_idx"
  ON "worker_jobs" ("executionClass", "status")
  WHERE "status" IN (
    'pending', 'queued', 'leased', 'claimed', 'preparing', 'running',
    'waiting_external', 'retry_scheduled', 'uploading', 'publishing', 'indexing'
  );
