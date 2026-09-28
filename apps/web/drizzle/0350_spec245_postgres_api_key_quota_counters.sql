SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
--> statement-breakpoint
CREATE TABLE "api_key_quota_counters" (
  "tenantId" varchar(36) NOT NULL,
  "apiKeyId" varchar(36) NOT NULL,
  "window" varchar(16) NOT NULL,
  "periodKey" varchar(16) NOT NULL,
  "requestCount" integer DEFAULT 0 NOT NULL,
  "warnedAt" timestamp with time zone,
  "expiresAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "api_key_quota_counters_window_check"
    CHECK ("window" IN ('hourly', 'daily', 'weekly', 'monthly')),
  CONSTRAINT "api_key_quota_counters_count_check"
    CHECK ("requestCount" >= 0),
  CONSTRAINT "api_key_quota_counters_pk"
    PRIMARY KEY ("apiKeyId", "window", "periodKey")
);
--> statement-breakpoint
CREATE INDEX "api_key_quota_counters_expires_idx"
  ON "api_key_quota_counters" ("expiresAt");
