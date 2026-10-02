-- Canonical admission of the previously unjournaled Feature 207 schema.
-- This forward migration intentionally refuses to run if any economic table
-- already exists; existing installations require schema inspection/adoption,
-- never blind replay of the historical 0340 SQL.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'economic_intents',
        'economic_budgets',
        'economic_holds',
        'economic_ledger_accounts',
        'economic_journal_entries',
        'economic_journal_lines',
        'economic_events',
        'economic_reconciliations'
      )
  ) THEN
    RAISE EXCEPTION 'Economic schema already exists; refusing replay and requiring explicit schema adoption';
  END IF;
END $$;--> statement-breakpoint

CREATE TABLE "economic_intents" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "actorId" varchar(160) NOT NULL,
  "actorType" varchar(24) NOT NULL,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) NOT NULL REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(128) NOT NULL,
  "effectType" varchar(48) NOT NULL,
  "resourceRef" varchar(255) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "currency" varchar(3) NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'admitted',
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_intents_amount_nonnegative_check" CHECK ("amountMinorUnits" >= 0),
  CONSTRAINT "economic_intents_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$'),
  CONSTRAINT "economic_intents_actor_type_check" CHECK ("actorType" IN ('user', 'agent', 'system')),
  CONSTRAINT "economic_intents_idempotency_length_check" CHECK (length("idempotencyKey") BETWEEN 8 AND 128)
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_intents_tenant_idempotency_unique"
  ON "economic_intents" ("tenantId", "idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_intents_job_attempt_idx"
  ON "economic_intents" ("tenantId", "workerJobId", "attemptId", "createdAt");--> statement-breakpoint

CREATE TABLE "economic_budgets" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "scopeType" varchar(32) NOT NULL,
  "scopeRef" varchar(160) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "limitMinorUnits" bigint NOT NULL,
  "heldMinorUnits" bigint NOT NULL DEFAULT 0,
  "capturedMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'active',
  "version" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_budgets_amounts_nonnegative_check" CHECK ("limitMinorUnits" >= 0 AND "heldMinorUnits" >= 0 AND "capturedMinorUnits" >= 0),
  CONSTRAINT "economic_budgets_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_budgets_scope_unique"
  ON "economic_budgets" ("tenantId", "scopeType", "scopeRef", "currency");--> statement-breakpoint

CREATE TABLE "economic_holds" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "intentId" varchar(36) NOT NULL REFERENCES "economic_intents"("id") ON DELETE RESTRICT,
  "budgetId" varchar(36) NOT NULL REFERENCES "economic_budgets"("id") ON DELETE RESTRICT,
  "workerJobId" varchar(36) NOT NULL REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) NOT NULL REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "currency" varchar(3) NOT NULL,
  "amountMinorUnits" bigint NOT NULL,
  "capturedMinorUnits" bigint NOT NULL DEFAULT 0,
  "releasedMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'held',
  "idempotencyKey" varchar(128) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_holds_amounts_check" CHECK ("amountMinorUnits" >= 0 AND "capturedMinorUnits" >= 0 AND "releasedMinorUnits" >= 0 AND "capturedMinorUnits" + "releasedMinorUnits" <= "amountMinorUnits"),
  CONSTRAINT "economic_holds_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_holds_intent_unique"
  ON "economic_holds" ("tenantId", "intentId");--> statement-breakpoint
CREATE UNIQUE INDEX "economic_holds_idempotency_unique"
  ON "economic_holds" ("tenantId", "idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_holds_active_idx"
  ON "economic_holds" ("tenantId", "status", "updatedAt");--> statement-breakpoint

CREATE TABLE "economic_ledger_accounts" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "accountType" varchar(32) NOT NULL,
  "ownerRef" varchar(160) NOT NULL,
  "currency" varchar(3) NOT NULL,
  "balanceMinorUnits" bigint NOT NULL DEFAULT 0,
  "status" varchar(24) NOT NULL DEFAULT 'open',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_ledger_accounts_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_ledger_accounts_identity_unique"
  ON "economic_ledger_accounts" ("tenantId", "accountType", "ownerRef", "currency");--> statement-breakpoint

CREATE TABLE "economic_journal_entries" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "idempotencyKey" varchar(200) NOT NULL,
  "description" varchar(512) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'posted',
  "reversalOfEntryId" varchar(36),
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_journal_entries_tenant_idempotency_unique"
  ON "economic_journal_entries" ("tenantId", "idempotencyKey");--> statement-breakpoint
CREATE INDEX "economic_journal_entries_correlation_idx"
  ON "economic_journal_entries" ("tenantId", "workerJobId", "attemptId", "createdAt");--> statement-breakpoint

CREATE TABLE "economic_journal_lines" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "entryId" varchar(36) NOT NULL REFERENCES "economic_journal_entries"("id") ON DELETE RESTRICT,
  "accountId" varchar(36) NOT NULL REFERENCES "economic_ledger_accounts"("id") ON DELETE RESTRICT,
  "currency" varchar(3) NOT NULL,
  "debitMinorUnits" bigint NOT NULL DEFAULT 0,
  "creditMinorUnits" bigint NOT NULL DEFAULT 0,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "economic_journal_lines_nonnegative_check" CHECK ("debitMinorUnits" >= 0 AND "creditMinorUnits" >= 0),
  CONSTRAINT "economic_journal_lines_one_side_check" CHECK (("debitMinorUnits" > 0 AND "creditMinorUnits" = 0) OR ("creditMinorUnits" > 0 AND "debitMinorUnits" = 0)),
  CONSTRAINT "economic_journal_lines_currency_format_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);--> statement-breakpoint
CREATE INDEX "economic_journal_lines_entry_idx"
  ON "economic_journal_lines" ("tenantId", "entryId");--> statement-breakpoint

CREATE TABLE "economic_events" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "eventType" varchar(64) NOT NULL,
  "idempotencyKey" varchar(200) NOT NULL,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "actorId" varchar(160) NOT NULL,
  "policyVersion" varchar(64) NOT NULL,
  "payloadJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX "economic_events_tenant_idempotency_unique"
  ON "economic_events" ("tenantId", "idempotencyKey");--> statement-breakpoint

CREATE TABLE "economic_reconciliations" (
  "id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "workerJobId" varchar(36) REFERENCES "worker_jobs"("id") ON DELETE RESTRICT,
  "attemptId" varchar(36) REFERENCES "worker_job_attempts"("id") ON DELETE RESTRICT,
  "holdId" varchar(36) REFERENCES "economic_holds"("id") ON DELETE RESTRICT,
  "status" varchar(32) NOT NULL DEFAULT 'pending',
  "reasonCode" varchar(100) NOT NULL,
  "externalReference" varchar(255),
  "detailsJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "resolvedAt" timestamptz
);--> statement-breakpoint
CREATE INDEX "economic_reconciliations_pending_idx"
  ON "economic_reconciliations" ("tenantId", "status", "createdAt");
