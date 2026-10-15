-- Extends the existing Feature 186 provider reservation ledger for per-call
-- Codex Subscription admission. The reservation rows remain owned by the
-- canonical worker_job and attempt; this is not a separate quota ledger.
ALTER TABLE "worker_job_provider_reservations"
  DROP CONSTRAINT IF EXISTS "worker_job_provider_reservations_kind_check";--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  ADD CONSTRAINT "worker_job_provider_reservations_kind_check"
  CHECK ("reservationKind" IN ('submission', 'running', 'poll', 'model_call'));--> statement-breakpoint

-- Existing uniqueness rules describe one submission/running/poll operation
-- per attempt. Model turns are numerous, so they are keyed independently by
-- their stable modelCallId while those old constraints keep their semantics.
DROP INDEX IF EXISTS "worker_job_provider_reservations_job_attempt_kind_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "worker_job_provider_reservations_job_attempt_kind_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "attemptId", "reservationKind")
  WHERE "reservationKind" <> 'model_call';--> statement-breakpoint
DROP INDEX IF EXISTS "worker_job_provider_reservations_job_business_attempt_kind_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "worker_job_provider_reservations_job_business_attempt_kind_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "businessAttempt", "reservationKind")
  WHERE "reservationKind" <> 'model_call';--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  ADD COLUMN IF NOT EXISTS "modelCallId" varchar(160),
  ADD COLUMN IF NOT EXISTS "leaseFencingVersion" integer,
  ADD COLUMN IF NOT EXISTS "dispatchState" varchar(16),
  ADD COLUMN IF NOT EXISTS "modelPhase" varchar(40),
  ADD COLUMN IF NOT EXISTS "modelRole" varchar(64),
  ADD COLUMN IF NOT EXISTS "requestedModel" varchar(120),
  ADD COLUMN IF NOT EXISTS "reasoningEffort" varchar(24),
  ADD COLUMN IF NOT EXISTS "modelSelectionJson" jsonb,
  ADD COLUMN IF NOT EXISTS "threadId" varchar(160),
  ADD COLUMN IF NOT EXISTS "turnId" varchar(160),
  ADD COLUMN IF NOT EXISTS "tokenWindowStartedAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "reservedTokens" integer,
  ADD COLUMN IF NOT EXISTS "inputTokens" integer,
  ADD COLUMN IF NOT EXISTS "cachedInputTokens" integer,
  ADD COLUMN IF NOT EXISTS "outputTokens" integer,
  ADD COLUMN IF NOT EXISTS "usageState" varchar(16),
  ADD COLUMN IF NOT EXISTS "usageReceiptJson" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_model_call_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "attemptId", "modelCallId")
  WHERE "modelCallId" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  DROP CONSTRAINT IF EXISTS "worker_job_provider_reservations_model_usage_check",
  DROP CONSTRAINT IF EXISTS "worker_job_provider_reservations_usage_counts_check";--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  ADD CONSTRAINT "worker_job_provider_reservations_model_usage_check"
  CHECK ("reservationKind" <> 'model_call' OR
    ("attemptId" IS NOT NULL AND "leaseFencingVersion" > 0 AND "reservedTokens" > 0 AND "modelCallId" IS NOT NULL AND "modelPhase" IS NOT NULL
      AND "modelRole" IS NOT NULL AND "requestedModel" IS NOT NULL AND "reasoningEffort" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  DROP CONSTRAINT IF EXISTS "worker_job_provider_reservations_usage_counts_check";--> statement-breakpoint
ALTER TABLE "worker_job_provider_reservations"
  ADD CONSTRAINT "worker_job_provider_reservations_usage_counts_check"
  CHECK (COALESCE("reservedTokens", 0) >= 0 AND COALESCE("inputTokens", 0) >= 0
    AND COALESCE("cachedInputTokens", 0) >= 0 AND COALESCE("outputTokens", 0) >= 0);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_provider_reservations_codex_window_idx"
  ON "worker_job_provider_reservations" ("providerName", "userKey", "tokenWindowStartedAt", "reservationStatus")
  WHERE "reservationKind" = 'model_call';
