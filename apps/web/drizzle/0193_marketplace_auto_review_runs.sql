CREATE TABLE IF NOT EXISTS "marketplace_auto_review_runs" (
  "id" varchar(64) PRIMARY KEY,
  "tenantId" varchar(36),
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "productionRunId" varchar(128) NOT NULL,
  "outputMode" varchar(32) NOT NULL,
  "frameStrategy" varchar(40) NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "currentStage" varchar(64) NOT NULL DEFAULT 'queued',
  "stageIndex" integer NOT NULL DEFAULT 0,
  "stageCount" integer NOT NULL DEFAULT 0,
  "selectedConceptId" varchar(128),
  "storyboardReviewId" varchar(128),
  "videoEditorProjectId" varchar(128),
  "renderJobId" varchar(128),
  "resultLibraryItemId" integer,
  "resultJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "metadataJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" text,
  "idempotencyKey" varchar(192) NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  "completedAt" timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_runs_idempotency_unique"
  ON "marketplace_auto_review_runs" ("userId", "idempotencyKey");
CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_runs_active_unique"
  ON "marketplace_auto_review_runs" ("userId", "productId")
  WHERE "status" IN ('queued', 'running', 'waiting_provider');
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_runs_product_idx"
  ON "marketplace_auto_review_runs" ("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_runs_user_status_idx"
  ON "marketplace_auto_review_runs" ("userId", "status", "updatedAt");
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_runs_production_idx"
  ON "marketplace_auto_review_runs" ("productionRunId");

CREATE TABLE IF NOT EXISTS "marketplace_auto_review_stages" (
  "id" bigserial PRIMARY KEY,
  "runId" varchar(64) NOT NULL REFERENCES "marketplace_auto_review_runs"("id") ON DELETE cascade,
  "stageKey" varchar(64) NOT NULL,
  "stageOrder" integer NOT NULL,
  "status" varchar(32) NOT NULL DEFAULT 'queued',
  "providerTaskIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "outputJson" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "errorMessage" text,
  "startedAt" timestamptz,
  "completedAt" timestamptz,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_auto_review_stages_unique"
  ON "marketplace_auto_review_stages" ("runId", "stageKey");
CREATE INDEX IF NOT EXISTS "marketplace_auto_review_stages_run_idx"
  ON "marketplace_auto_review_stages" ("runId", "stageOrder");
