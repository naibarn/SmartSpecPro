SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint

-- Shared, exact sliding-window state for API/system limits across app instances.
CREATE TABLE IF NOT EXISTS "rate_limit_events" (
  "namespace" varchar(80) NOT NULL,
  "subject_hash" varchar(64) NOT NULL,
  "units" integer NOT NULL DEFAULT 1,
  "value_hash" varchar(64),
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "rate_limit_events_subject_time_idx"
  ON "rate_limit_events" ("namespace", "subject_hash", "occurred_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "public_api_events" (
  "id" bigserial PRIMARY KEY,
  "tenantId" varchar(36) NOT NULL,
  "eventType" varchar(50) NOT NULL,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "public_api_events_tenant_id_idx"
  ON "public_api_events" ("tenantId", "id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rate_limit_slots" (
  "id" uuid PRIMARY KEY,
  "namespace" varchar(80) NOT NULL,
  "subject_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "rate_limit_slots_scope_expiry_idx"
  ON "rate_limit_slots" ("namespace", "subject_hash", "expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "runtime_feature_flags" (
  "scopeKey" varchar(220) PRIMARY KEY,
  "flagName" varchar(128) NOT NULL,
  "value" jsonb NOT NULL,
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

-- MCP HTTP transport sessions and replayable tool responses are short-lived,
-- but must be shared across web instances without Redis.
CREATE TABLE IF NOT EXISTS "mcp_http_sessions" (
  "id" uuid PRIMARY KEY,
  "session" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_http_sessions_expiry_idx"
  ON "mcp_http_sessions" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mcp_tool_idempotency" (
  "key_hash" varchar(64) PRIMARY KEY,
  "result" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_tool_idempotency_expiry_idx"
  ON "mcp_tool_idempotency" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "api_idempotency_responses" (
  "key_hash" varchar(64) PRIMARY KEY,
  "claim_id" uuid,
  "status" varchar(16) NOT NULL,
  "response" jsonb,
  "lease_until" timestamptz,
  "expires_at" timestamptz NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "api_idempotency_responses_expiry_idx"
  ON "api_idempotency_responses" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "runtime_dedupe_keys" (
  "namespace" varchar(100) NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("namespace", "key_hash")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "runtime_dedupe_keys_expiry_idx"
  ON "runtime_dedupe_keys" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "browser_policy_audit_heads" (
  "scope_key" varchar(600) PRIMARY KEY,
  "event_hash" varchar(128) NOT NULL,
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  "expires_at" timestamptz NOT NULL
);
--> statement-breakpoint

-- Seed the new head store from durable audit events so the cutover preserves
-- the last database-backed hash for each tenant/execution/trace scope.
INSERT INTO "browser_policy_audit_heads" ("scope_key", "event_hash", "updated_at", "expires_at")
SELECT DISTINCT ON (
  "tenantId",
  COALESCE("executionId", 'no-execution'),
  COALESCE("traceId", 'no-trace')
)
  "tenantId" || ':' || COALESCE("executionId", 'no-execution') || ':' || COALESCE("traceId", 'no-trace'),
  "eventHash",
  "createdAt",
  "createdAt" + interval '30 days'
FROM "browser_policy_decisions"
WHERE "createdAt" > now() - interval '30 days'
ORDER BY
  "tenantId",
  COALESCE("executionId", 'no-execution'),
  COALESCE("traceId", 'no-trace'),
  "createdAt" DESC,
  "id" DESC
ON CONFLICT ("scope_key") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "mcp_download_grants" (
  "token_hash" varchar(64) PRIMARY KEY,
  "grant" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "mcp_download_grants_expiry_idx"
  ON "mcp_download_grants" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "runtime_ephemeral_values" (
  "namespace" varchar(100) NOT NULL,
  "key_hash" varchar(64) NOT NULL,
  "value" jsonb NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("namespace", "key_hash")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "runtime_ephemeral_values_expiry_idx"
  ON "runtime_ephemeral_values" ("expires_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "credit_reservation_snapshots" (
  "reservation_id" varchar(256) PRIMARY KEY,
  "payload" jsonb NOT NULL,
  "status" varchar(16) NOT NULL DEFAULT 'active',
  "expires_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "credit_reservation_snapshots_status_check"
    CHECK ("status" IN ('active', 'refunding', 'committing', 'refunded', 'committed'))
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "credit_reservation_snapshots_expiry_idx"
  ON "credit_reservation_snapshots" ("expires_at");
