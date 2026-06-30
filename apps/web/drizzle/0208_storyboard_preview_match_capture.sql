CREATE TABLE IF NOT EXISTS "storyboard_preview_match_capture_jobs" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productId" varchar(64) NOT NULL,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "storyboardReviewId" varchar(128) NOT NULL,
  "engine" varchar(80) DEFAULT 'preview_match_browser_capture' NOT NULL,
  "quality" varchar(24) DEFAULT 'standard' NOT NULL,
  "status" varchar(40) DEFAULT 'queued' NOT NULL,
  "stage" varchar(80),
  "progressPercent" integer DEFAULT 0 NOT NULL,
  "failureCode" varchar(120),
  "safeMessage" text,
  "safeDiagnosticsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "idempotencyKey" varchar(256) NOT NULL,
  "previewCompositionHash" varchar(160) NOT NULL,
  "timelineHash" varchar(160) NOT NULL,
  "finalCompositeConfigHash" varchar(160) NOT NULL,
  "payloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outputJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidenceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "billingJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "activeAttemptId" varchar(128),
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completedAt" timestamp with time zone,
  "cancelledAt" timestamp with time zone
);

CREATE UNIQUE INDEX IF NOT EXISTS "storyboard_preview_match_capture_jobs_tenant_idem_unique"
  ON "storyboard_preview_match_capture_jobs" ("tenantId", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "storyboard_preview_match_capture_jobs_lookup_idx"
  ON "storyboard_preview_match_capture_jobs" ("tenantId", "productId", "runId", "storyboardReviewId", "createdAt");

CREATE INDEX IF NOT EXISTS "storyboard_preview_match_capture_jobs_status_idx"
  ON "storyboard_preview_match_capture_jobs" ("tenantId", "status", "createdAt");

CREATE TABLE IF NOT EXISTS "storyboard_preview_match_capture_attempts" (
  "id" varchar(128) PRIMARY KEY NOT NULL,
  "captureJobId" varchar(128) NOT NULL REFERENCES "storyboard_preview_match_capture_jobs"("id") ON DELETE cascade,
  "attemptNumber" integer DEFAULT 1 NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "stage" varchar(80),
  "failureCode" varchar(120),
  "routeTokenHash" varchar(160),
  "assetManifestJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "workspaceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outputJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evidenceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "startedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "completedAt" timestamp with time zone,
  "staleAt" timestamp with time zone,
  "cancelledAt" timestamp with time zone,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "storyboard_preview_match_capture_attempts_job_idx"
  ON "storyboard_preview_match_capture_attempts" ("captureJobId", "attemptNumber");

CREATE INDEX IF NOT EXISTS "storyboard_preview_match_capture_attempts_stale_idx"
  ON "storyboard_preview_match_capture_attempts" ("captureJobId", "staleAt", "cancelledAt");
