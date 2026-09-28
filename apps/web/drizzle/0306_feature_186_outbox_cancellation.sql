-- Feature 186 follow-up: make cancellation of unpublished dispatch intent durable.
-- A cancelled outbox row must never be republished after a late broker delivery
-- or reconciler sweep. Published references remain unchanged.
ALTER TABLE "worker_job_outbox"
  ADD COLUMN IF NOT EXISTS "cancelledAt" timestamptz;

-- 0303 created this index with the pre-cancellation column set. Replace the
-- index definition explicitly so an already-migrated database also receives
-- the cancellation/quarantine predicates used by the publisher.
DROP INDEX IF EXISTS "worker_job_outbox_due_idx";
CREATE INDEX "worker_job_outbox_due_idx"
  ON "worker_job_outbox" ("publishedAt", "cancelledAt", "quarantinedAt", "nextAttemptAt");
