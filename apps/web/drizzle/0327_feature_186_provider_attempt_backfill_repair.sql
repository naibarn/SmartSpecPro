-- Feature 186: repair business-attempt backfill for provider reservations
-- created before attempt identity was persisted. This is additive: it keeps
-- reservation evidence and only repairs the derived attempt projection from
-- the authoritative worker_job_attempts row when one exists.

DROP INDEX IF EXISTS "worker_job_provider_reservations_job_business_attempt_kind_unique";
--> statement-breakpoint

UPDATE "worker_job_provider_reservations" r
SET "businessAttempt" = COALESCE(
  (SELECT a."attempt"
   FROM "worker_job_attempts" a
   WHERE a."id" = r."attemptId"
     AND a."workerJobId" = r."workerJobId"),
  (SELECT j."attempt" FROM "worker_jobs" j WHERE j."id" = r."workerJobId"),
  1
);
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_job_business_attempt_kind_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "businessAttempt", "reservationKind");
