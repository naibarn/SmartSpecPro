-- Feature 129: Marketplace Intelligence persistence.
-- Additive migration only. Existing Marketplace Capture tables are not rewritten.

CREATE TABLE IF NOT EXISTS "marketplace_connector_grants" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "status" varchar(40) DEFAULT 'not_connected' NOT NULL,
  "grantHash" varchar(128),
  "authorizationAttemptHash" varchar(128),
  "scopesJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "providerAccountLabel" text,
  "defaultRegion" varchar(10) DEFAULT 'TH' NOT NULL,
  "defaultLocale" varchar(20) DEFAULT 'th-TH' NOT NULL,
  "defaultResultLimit" integer DEFAULT 10 NOT NULL,
  "preferredSourceMode" varchar(40) DEFAULT 'recorded_mcp_sample' NOT NULL,
  "lastStatusRefreshAt" timestamp with time zone,
  "lastProbeAt" timestamp with time zone,
  "lastMarketplaceCaptureEnrichmentAt" timestamp with time zone,
  "startedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "expiresAt" timestamp with time zone,
  "revokedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_connector_grants_user_provider_unique"
  ON "marketplace_connector_grants" ("tenantId", "userId", "provider");
CREATE INDEX IF NOT EXISTS "marketplace_connector_grants_status_idx"
  ON "marketplace_connector_grants" ("tenantId", "provider", "status", "expiresAt");
CREATE INDEX IF NOT EXISTS "marketplace_connector_grants_user_idx"
  ON "marketplace_connector_grants" ("userId", "updatedAt");

CREATE TABLE IF NOT EXISTS "marketplace_connector_grant_events" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "grantId" varchar(64) NOT NULL REFERENCES "marketplace_connector_grants"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "eventType" varchar(80) NOT NULL,
  "status" varchar(40) NOT NULL,
  "safeMessage" text,
  "metadataJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_connector_grant_events_grant_idx"
  ON "marketplace_connector_grant_events" ("grantId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_connector_grant_events_user_idx"
  ON "marketplace_connector_grant_events" ("tenantId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_connector_field_samples" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "sourceMode" varchar(40) NOT NULL,
  "keyword" varchar(160) NOT NULL,
  "region" varchar(10) NOT NULL,
  "locale" varchar(20) NOT NULL,
  "capabilityVersion" varchar(120) NOT NULL,
  "payloadHash" varchar(128) NOT NULL,
  "shapeHash" varchar(128) NOT NULL,
  "fieldCoverageJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "capabilitySummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "redactionState" varchar(40) DEFAULT 'raw_not_stored' NOT NULL,
  "rawPayloadExpiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_connector_field_samples_payload_unique"
  ON "marketplace_connector_field_samples" ("tenantId", "userId", "provider", "payloadHash");
CREATE INDEX IF NOT EXISTS "marketplace_connector_field_samples_user_idx"
  ON "marketplace_connector_field_samples" ("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_connector_field_samples_keyword_idx"
  ON "marketplace_connector_field_samples" ("provider", "keyword", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_search_snapshots" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "sourceMode" varchar(40) NOT NULL,
  "keyword" varchar(160) NOT NULL,
  "region" varchar(10) NOT NULL,
  "locale" varchar(20) NOT NULL,
  "status" varchar(40) DEFAULT 'ready' NOT NULL,
  "capabilityVersion" varchar(120) NOT NULL,
  "itemCount" integer DEFAULT 0 NOT NULL,
  "fieldCoveragePercent" integer DEFAULT 0 NOT NULL,
  "unknownFieldCount" integer DEFAULT 0 NOT NULL,
  "metricsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "payloadHash" varchar(128) NOT NULL,
  "idempotencyKey" varchar(192) NOT NULL,
  "sourceCapturedAt" timestamp with time zone,
  "capturedAt" timestamp with time zone DEFAULT now() NOT NULL,
  "rawPayloadRedactedAt" timestamp with time zone,
  "rawPayloadExpiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_search_snapshots_item_count_nonnegative" CHECK ("itemCount" >= 0),
  CONSTRAINT "marketplace_search_snapshots_field_coverage_bounds" CHECK ("fieldCoveragePercent" >= 0 AND "fieldCoveragePercent" <= 100),
  CONSTRAINT "marketplace_search_snapshots_unknown_count_nonnegative" CHECK ("unknownFieldCount" >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_search_snapshots_idempotency_unique"
  ON "marketplace_search_snapshots" ("tenantId", "userId", "provider", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshots_user_idx"
  ON "marketplace_search_snapshots" ("tenantId", "userId", "capturedAt");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshots_keyword_idx"
  ON "marketplace_search_snapshots" ("provider", "region", "keyword", "capturedAt");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshots_source_idx"
  ON "marketplace_search_snapshots" ("sourceMode", "status", "capturedAt");

CREATE TABLE IF NOT EXISTS "marketplace_search_snapshot_items" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "snapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "rank" integer NOT NULL,
  "title" text NOT NULL,
  "sellerName" text,
  "brand" text,
  "price" numeric(14,2),
  "originalPrice" numeric(14,2),
  "discount" integer,
  "monthlySoldCount" integer,
  "historicalSoldCount" integer,
  "rating" numeric(6,4),
  "reviewCount" integer,
  "shopeeVerified" boolean DEFAULT false NOT NULL,
  "estimatedDeliveryTimeText" text,
  "image" text,
  "externalProductId" varchar(128),
  "externalShopId" varchar(128),
  "externalModelId" varchar(128),
  "itemType" varchar(80),
  "matchedKeywordsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "normalizedJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rawDiagnosticJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_search_snapshot_items_rank_positive" CHECK ("rank" > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_search_snapshot_items_rank_unique"
  ON "marketplace_search_snapshot_items" ("snapshotId", "rank");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshot_items_snapshot_idx"
  ON "marketplace_search_snapshot_items" ("snapshotId", "rank");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshot_items_user_idx"
  ON "marketplace_search_snapshot_items" ("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_search_snapshot_items_external_idx"
  ON "marketplace_search_snapshot_items" ("provider", "externalShopId", "externalProductId", "externalModelId");

CREATE TABLE IF NOT EXISTS "marketplace_search_snapshot_product_links" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "snapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "snapshotItemId" varchar(80) NOT NULL REFERENCES "marketplace_search_snapshot_items"("id") ON DELETE cascade,
  "productId" varchar(64) REFERENCES "marketplace_products"("id") ON DELETE set null,
  "candidateItemId" varchar(64) REFERENCES "marketplace_candidate_items"("id") ON DELETE set null,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "confidence" numeric(5,4) NOT NULL,
  "linkBasis" varchar(80) NOT NULL,
  "reviewState" varchar(40) DEFAULT 'needs_review' NOT NULL,
  "evidenceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_snapshot_product_links_unique"
  ON "marketplace_search_snapshot_product_links" ("snapshotItemId", "productId", "candidateItemId");
CREATE INDEX IF NOT EXISTS "marketplace_snapshot_product_links_snapshot_idx"
  ON "marketplace_search_snapshot_product_links" ("snapshotId", "reviewState");
CREATE INDEX IF NOT EXISTS "marketplace_snapshot_product_links_product_idx"
  ON "marketplace_search_snapshot_product_links" ("productId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_snapshot_product_links_user_idx"
  ON "marketplace_search_snapshot_product_links" ("tenantId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_product_metric_connector_snapshots" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "snapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "snapshotItemId" varchar(80) NOT NULL REFERENCES "marketplace_search_snapshot_items"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "capturedAt" timestamp with time zone NOT NULL,
  "price" numeric(14,2),
  "monthlySoldCount" integer,
  "historicalSoldCount" integer,
  "rating" numeric(6,4),
  "reviewCount" integer,
  "rank" integer,
  "confidence" numeric(5,4) NOT NULL,
  "provenanceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_product_metric_connector_unique"
  ON "marketplace_product_metric_connector_snapshots" ("productId", "snapshotItemId");
CREATE INDEX IF NOT EXISTS "marketplace_product_metric_connector_product_idx"
  ON "marketplace_product_metric_connector_snapshots" ("productId", "capturedAt");
CREATE INDEX IF NOT EXISTS "marketplace_product_metric_connector_user_idx"
  ON "marketplace_product_metric_connector_snapshots" ("tenantId", "userId", "capturedAt");

CREATE TABLE IF NOT EXISTS "marketplace_keyword_discoveries" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "snapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "keyword" varchar(160) NOT NULL,
  "status" varchar(40) DEFAULT 'ready' NOT NULL,
  "opportunitiesJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "summaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "capturedAt" timestamp with time zone NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_keyword_discoveries_snapshot_unique"
  ON "marketplace_keyword_discoveries" ("snapshotId", "userId");
CREATE INDEX IF NOT EXISTS "marketplace_keyword_discoveries_user_idx"
  ON "marketplace_keyword_discoveries" ("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_keyword_discoveries_keyword_idx"
  ON "marketplace_keyword_discoveries" ("provider", "keyword", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_keyword_discovery_clusters" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "discoveryId" varchar(64) NOT NULL REFERENCES "marketplace_keyword_discoveries"("id") ON DELETE cascade,
  "snapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "clusterType" varchar(60) DEFAULT 'brand_family' NOT NULL,
  "label" text NOT NULL,
  "rank" integer NOT NULL,
  "confidence" numeric(5,4) DEFAULT 0.7000 NOT NULL,
  "representativeSnapshotItemIdsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "evidenceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metricsJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_keyword_discovery_clusters_rank_unique"
  ON "marketplace_keyword_discovery_clusters" ("discoveryId", "rank", "label");
CREATE INDEX IF NOT EXISTS "marketplace_keyword_discovery_clusters_discovery_idx"
  ON "marketplace_keyword_discovery_clusters" ("discoveryId", "rank");
CREATE INDEX IF NOT EXISTS "marketplace_keyword_discovery_clusters_user_idx"
  ON "marketplace_keyword_discovery_clusters" ("tenantId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_search_reports" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "reportType" varchar(80) NOT NULL,
  "status" varchar(40) DEFAULT 'ready' NOT NULL,
  "title" text NOT NULL,
  "latestSnapshotId" varchar(64) NOT NULL REFERENCES "marketplace_search_snapshots"("id") ON DELETE cascade,
  "baselineSnapshotId" varchar(64) REFERENCES "marketplace_search_snapshots"("id") ON DELETE set null,
  "intermediateSnapshotIdsJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "aspectRatio" varchar(12) DEFAULT '1:1' NOT NULL,
  "imageModel" varchar(80) DEFAULT 'gpt-image-2' NOT NULL,
  "payloadHash" varchar(128) NOT NULL,
  "reportJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "promptPayloadJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sourceSummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_search_reports_payload_unique"
  ON "marketplace_search_reports" ("tenantId", "userId", "reportType", "payloadHash");
CREATE INDEX IF NOT EXISTS "marketplace_search_reports_snapshot_idx"
  ON "marketplace_search_reports" ("latestSnapshotId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_search_reports_user_idx"
  ON "marketplace_search_reports" ("tenantId", "userId", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_search_report_exports" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "reportId" varchar(64) NOT NULL REFERENCES "marketplace_search_reports"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "exportType" varchar(40) NOT NULL,
  "templateKey" varchar(120) NOT NULL,
  "aspectRatio" varchar(12) NOT NULL,
  "status" varchar(40) DEFAULT 'queued' NOT NULL,
  "providerModel" varchar(80) DEFAULT 'gpt-image-2' NOT NULL,
  "promptHash" varchar(128) NOT NULL,
  "payloadHash" varchar(128) NOT NULL,
  "storageKey" text,
  "storageUrl" text,
  "sourceSummaryJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "errorMessage" text,
  "expiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_search_report_exports_payload_unique"
  ON "marketplace_search_report_exports" ("reportId", "exportType", "payloadHash");
CREATE INDEX IF NOT EXISTS "marketplace_search_report_exports_user_idx"
  ON "marketplace_search_report_exports" ("tenantId", "userId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_search_report_exports_status_idx"
  ON "marketplace_search_report_exports" ("status", "createdAt");

CREATE TABLE IF NOT EXISTS "marketplace_intelligence_watchlists" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "provider" varchar(40) NOT NULL,
  "keyword" varchar(160) NOT NULL,
  "region" varchar(10) DEFAULT 'TH' NOT NULL,
  "cadence" varchar(40) DEFAULT 'daily' NOT NULL,
  "status" varchar(40) DEFAULT 'active' NOT NULL,
  "alertRulesJson" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "lastSnapshotId" varchar(64) REFERENCES "marketplace_search_snapshots"("id") ON DELETE set null,
  "lastRunAt" timestamp with time zone,
  "nextRunAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "marketplace_intelligence_watchlists_unique"
  ON "marketplace_intelligence_watchlists" ("tenantId", "userId", "provider", "keyword", "region");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_watchlists_user_idx"
  ON "marketplace_intelligence_watchlists" ("tenantId", "userId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_intelligence_watchlists_due_idx"
  ON "marketplace_intelligence_watchlists" ("status", "nextRunAt");

CREATE TABLE IF NOT EXISTS "marketplace_intelligence_watchlist_events" (
  "id" varchar(80) PRIMARY KEY NOT NULL,
  "watchlistId" varchar(64) NOT NULL REFERENCES "marketplace_intelligence_watchlists"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "eventType" varchar(80) NOT NULL,
  "severity" varchar(40) DEFAULT 'info' NOT NULL,
  "baselineSnapshotId" varchar(64) REFERENCES "marketplace_search_snapshots"("id") ON DELETE set null,
  "latestSnapshotId" varchar(64) REFERENCES "marketplace_search_snapshots"("id") ON DELETE set null,
  "summary" text NOT NULL,
  "evidenceJson" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "marketplace_watchlist_events_watchlist_idx"
  ON "marketplace_intelligence_watchlist_events" ("watchlistId", "createdAt");
CREATE INDEX IF NOT EXISTS "marketplace_watchlist_events_user_idx"
  ON "marketplace_intelligence_watchlist_events" ("tenantId", "userId", "createdAt");
