-- Feature 186: durable provider accounts, admission reservations, fair
-- scheduling state, and callback-free polling evidence.
-- Additive only. Existing provider rows remain the logical catalog; existing
-- credentials are copied only into the encrypted account slot 1 boundary.

CREATE TABLE IF NOT EXISTS "llm_provider_accounts" (
  "id" serial PRIMARY KEY,
  "providerId" integer NOT NULL REFERENCES "llm_providers"("id") ON DELETE RESTRICT,
  "accountSlot" integer NOT NULL CHECK ("accountSlot" BETWEEN 1 AND 5),
  "accountLabel" varchar(120),
  "accountHint" varchar(120),
  "apiKeyEncrypted" text,
  "hasApiKey" boolean NOT NULL DEFAULT false,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "healthStatus" varchar(32) NOT NULL DEFAULT 'healthy',
  "cooldownUntil" timestamptz,
  "capabilityJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "limitConfigJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastHealthCheck" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "llm_provider_accounts_provider_slot_unique"
  ON "llm_provider_accounts" ("providerId", "accountSlot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_provider_accounts_provider_enabled_idx"
  ON "llm_provider_accounts" ("providerId", "isEnabled", "healthStatus");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "media_provider_accounts" (
  "id" serial PRIMARY KEY,
  "providerId" integer NOT NULL REFERENCES "media_providers"("id") ON DELETE RESTRICT,
  "accountSlot" integer NOT NULL CHECK ("accountSlot" BETWEEN 1 AND 5),
  "accountLabel" varchar(120),
  "accountHint" varchar(120),
  "apiKeyEncrypted" text,
  "hasApiKey" boolean NOT NULL DEFAULT false,
  "isEnabled" boolean NOT NULL DEFAULT true,
  "healthStatus" varchar(32) NOT NULL DEFAULT 'healthy',
  "cooldownUntil" timestamptz,
  "capabilityJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "limitConfigJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "lastHealthCheck" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "media_provider_accounts_provider_slot_unique"
  ON "media_provider_accounts" ("providerId", "accountSlot");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_provider_accounts_provider_enabled_idx"
  ON "media_provider_accounts" ("providerId", "isEnabled", "healthStatus");--> statement-breakpoint

-- Existing single-key providers become account slot 1. The parent row remains
-- readable during rollout, so this can be rerun safely during deployment.
INSERT INTO "llm_provider_accounts" (
  "providerId", "accountSlot", "accountLabel", "apiKeyEncrypted", "hasApiKey",
  "isEnabled", "healthStatus", "createdAt", "updatedAt"
)
SELECT "id", 1, "displayName", "apiKeyEncrypted", "hasApiKey",
       "isEnabled", 'healthy', "createdAt", "updatedAt"
FROM "llm_providers"
WHERE NOT EXISTS (
  SELECT 1 FROM "llm_provider_accounts" a
  WHERE a."providerId" = "llm_providers"."id" AND a."accountSlot" = 1
);--> statement-breakpoint

INSERT INTO "media_provider_accounts" (
  "providerId", "accountSlot", "accountLabel", "apiKeyEncrypted", "hasApiKey",
  "isEnabled", "healthStatus", "createdAt", "updatedAt"
)
SELECT "id", 1, "displayName", "apiKeyEncrypted", "hasApiKey",
       "isEnabled", 'healthy', "createdAt", "updatedAt"
FROM "media_providers"
WHERE NOT EXISTS (
  SELECT 1 FROM "media_provider_accounts" a
  WHERE a."providerId" = "media_providers"."id" AND a."accountSlot" = 1
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "worker_job_provider_reservations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE SET NULL,
  "providerKind" varchar(16) NOT NULL CHECK ("providerKind" IN ('llm', 'media')),
  "providerName" varchar(64) NOT NULL,
  "providerAccountId" integer,
  "reservationKind" varchar(24) NOT NULL CHECK ("reservationKind" IN ('submission', 'running', 'poll')),
  "reservationStatus" varchar(24) NOT NULL DEFAULT 'reserved' CHECK ("reservationStatus" IN ('reserved', 'released', 'unknown', 'quarantined')),
  "userKey" varchar(128),
  "operationKey" varchar(200) NOT NULL,
  "providerJobId" varchar(255),
  "pollerLeaseTokenHash" varchar(128),
  "pollerLeaseExpiresAt" timestamptz,
  "nextPollAt" timestamptz,
  "pollAttempt" integer NOT NULL DEFAULT 0 CHECK ("pollAttempt" >= 0),
  "providerDeadlineAt" timestamptz,
  "lastObservedStatus" varchar(64),
  "lastObservedAt" timestamptz,
  "releasedAt" timestamptz,
  "safeErrorCode" varchar(100),
  "operatorReviewReason" varchar(500),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_operation_unique"
  ON "worker_job_provider_reservations" ("operationKey");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_job_attempt_kind_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "attemptId", "reservationKind");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "worker_job_provider_reservations_job_kind_null_attempt_unique"
  ON "worker_job_provider_reservations" ("workerJobId", "reservationKind")
  WHERE "attemptId" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_provider_reservations_due_poll_idx"
  ON "worker_job_provider_reservations" ("reservationStatus", "nextPollAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_provider_reservations_provider_account_idx"
  ON "worker_job_provider_reservations" ("providerName", "providerAccountId", "reservationStatus");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "worker_job_provider_reservations_user_active_idx"
  ON "worker_job_provider_reservations" ("providerName", "userKey", "reservationStatus");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_admission_windows" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "providerKind" varchar(16) NOT NULL CHECK ("providerKind" IN ('llm', 'media')),
  "providerName" varchar(64) NOT NULL,
  "providerAccountId" integer,
  "windowKind" varchar(24) NOT NULL,
  "windowStartedAt" timestamptz NOT NULL,
  "windowSeconds" integer NOT NULL CHECK ("windowSeconds" > 0),
  "usedCount" integer NOT NULL DEFAULT 0 CHECK ("usedCount" >= 0),
  "maxCount" integer NOT NULL CHECK ("maxCount" > 0),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_admission_windows_scope_unique"
  ON "provider_admission_windows" ("providerKind", "providerName", "providerAccountId", "windowKind", "windowStartedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_admission_windows_due_idx"
  ON "provider_admission_windows" ("providerName", "providerAccountId", "windowStartedAt");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "provider_scheduler_states" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "providerKind" varchar(16) NOT NULL CHECK ("providerKind" IN ('llm', 'media')),
  "providerPoolKey" varchar(160) NOT NULL,
  "userKey" varchar(128) NOT NULL,
  "activeCount" integer NOT NULL DEFAULT 0 CHECK ("activeCount" >= 0),
  "lastServedAt" timestamptz,
  "fairnessEligibleAt" timestamptz,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "provider_scheduler_states_pool_user_unique"
  ON "provider_scheduler_states" ("providerPoolKey", "userKey");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_scheduler_states_pool_fairness_idx"
  ON "provider_scheduler_states" ("providerPoolKey", "fairnessEligibleAt", "lastServedAt");
