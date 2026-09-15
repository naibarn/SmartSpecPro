-- Feature 186: bind provider reservations to the business attempt and enforce
-- every configured submission window. This is additive and preserves all
-- existing reservation/provider evidence.

ALTER TABLE "worker_job_provider_reservations"
  ADD COLUMN IF NOT EXISTS "businessAttempt" integer;
--> statement-breakpoint

UPDATE "worker_job_provider_reservations" r
SET "businessAttempt" = COALESCE(
  (SELECT a."attempt"
   FROM "worker_job_attempts" a
   WHERE a."id" = r."attemptId"
     AND a."workerJobId" = r."workerJobId"),
  (SELECT j."attempt" FROM "worker_jobs" j WHERE j."id" = r."workerJobId"),
  1
)
WHERE r."businessAttempt" IS NULL;
--> statement-breakpoint

ALTER TABLE "worker_job_provider_reservations"
  ALTER COLUMN "businessAttempt" SET DEFAULT 1,
  ALTER COLUMN "businessAttempt" SET NOT NULL;
--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'worker_job_provider_reservations_business_attempt_check'
  ) THEN
    ALTER TABLE "worker_job_provider_reservations"
      ADD CONSTRAINT "worker_job_provider_reservations_business_attempt_check"
      CHECK ("businessAttempt" >= 1);
  END IF;
END $$;
--> statement-breakpoint

DROP INDEX IF EXISTS "worker_job_provider_reservations_job_kind_null_attempt_unique";
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_job_business_attempt_kind_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "businessAttempt", "reservationKind");
