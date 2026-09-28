-- Feature 186 follow-up: persist the runtime contract version on the canonical row.
-- This is additive and allows retry/recovery envelopes to preserve compatibility.
ALTER TABLE "worker_jobs" ADD COLUMN IF NOT EXISTS "contractVersion" varchar(40) NOT NULL DEFAULT 'feature-186-v1';
