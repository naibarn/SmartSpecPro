-- Feature 186 follow-up: persist the bounded operator-review reason on the
-- canonical job row. This is additive and safe for already-applied 0307.
ALTER TABLE "worker_jobs"
  ADD COLUMN IF NOT EXISTS "operatorReviewReason" text;
