-- Feature 186 follow-up: retain soft/hard timeout policy on the canonical row.
-- This is additive; existing timeoutSeconds remains the compatibility fallback.
ALTER TABLE "worker_jobs"
  ADD COLUMN IF NOT EXISTS "timeoutPolicyJson" jsonb NOT NULL
  DEFAULT '{"softTimeoutMs":0,"hardTimeoutMs":3600000}'::jsonb;

UPDATE "worker_jobs"
SET "timeoutPolicyJson" = jsonb_build_object(
  'softTimeoutMs', 0,
  'hardTimeoutMs', GREATEST("timeoutSeconds", 1) * 1000
)
WHERE "timeoutPolicyJson" = '{"softTimeoutMs":0,"hardTimeoutMs":3600000}'::jsonb
  AND "timeoutSeconds" <> 3600;
