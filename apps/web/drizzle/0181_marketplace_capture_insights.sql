CREATE TABLE IF NOT EXISTS "marketplace_capture_insights" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "captureId" varchar(64) REFERENCES "marketplace_capture_sessions"("id") ON DELETE cascade,
  "productId" varchar(64) REFERENCES "marketplace_products"("id") ON DELETE set null,
  "platform" "marketplace_platform" NOT NULL,
  "sourceUrl" text NOT NULL,
  "insightType" varchar(64) NOT NULL,
  "provider" varchar(64) NOT NULL,
  "status" varchar(32) DEFAULT 'ready' NOT NULL,
  "schemaVersion" varchar(16) DEFAULT '1.0' NOT NULL,
  "payloadHash" varchar(128) NOT NULL,
  "idempotencyKey" varchar(160) NOT NULL,
  "parentInsightIdsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "payloadJson" jsonb NOT NULL,
  "rawCaptureJson" jsonb,
  "rawCaptureIncluded" boolean DEFAULT false NOT NULL,
  "storytellingReadiness" varchar(64),
  "claimResolutionsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "extensionVersion" varchar(80),
  "insightCreatedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_idempotency"
  ON "marketplace_capture_insights" ("userId", COALESCE("tenantId", 'personal'), "idempotencyKey");

CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_capture"
  ON "marketplace_capture_insights" ("captureId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_product"
  ON "marketplace_capture_insights" ("productId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_user"
  ON "marketplace_capture_insights" ("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_readiness"
  ON "marketplace_capture_insights" ("userId", "storytellingReadiness");
