DO $$ BEGIN
  CREATE TYPE marketplace_platform AS ENUM ('shopee', 'tiktok_shop');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_page_type AS ENUM ('product', 'category', 'search', 'shop', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_capture_status AS ENUM ('captured', 'uploading_assets', 'analyzing', 'analyzed', 'confirmed', 'failed', 'discarded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_asset_kind AS ENUM ('screenshot', 'main_image', 'description_image', 'review_image', 'html_snapshot', 'raw_payload', 'category_grid_screenshot');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_product_image_type AS ENUM ('main', 'description', 'review', 'related_excluded');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE marketplace_pairing_status AS ENUM ('active', 'revoked', 'expired');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "marketplace_extension_pairings" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "extensionId" varchar(160),
  "origin" text,
  "status" marketplace_pairing_status NOT NULL DEFAULT 'active',
  "lastUsedAt" timestamp with time zone,
  "expiresAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketplace_capture_sessions" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "platform" marketplace_platform NOT NULL,
  "pageType" marketplace_page_type NOT NULL,
  "sourceUrl" text NOT NULL,
  "pageTitle" text,
  "externalProductId" varchar(128),
  "externalShopId" varchar(128),
  "status" marketplace_capture_status NOT NULL DEFAULT 'captured',
  "rawDomText" text,
  "rawPayloadJson" jsonb,
  "htmlBlocksJson" jsonb,
  "imageCandidatesJson" jsonb,
  "llmResultJson" jsonb,
  "normalizedResultJson" jsonb,
  "confidenceJson" jsonb,
  "validationWarningsJson" jsonb,
  "categoryContextJson" jsonb,
  "errorMessage" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketplace_capture_assets" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "captureId" varchar(64) NOT NULL REFERENCES "marketplace_capture_sessions"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "kind" marketplace_asset_kind NOT NULL,
  "section" varchar(64),
  "storageKey" text NOT NULL,
  "url" text NOT NULL,
  "sourceUrl" text,
  "contentType" varchar(128),
  "byteSize" integer,
  "width" integer,
  "height" integer,
  "sortOrder" integer DEFAULT 0,
  "metadataJson" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_capture_assets_byte_size_positive" CHECK ("byteSize" IS NULL OR "byteSize" >= 0),
  CONSTRAINT "marketplace_capture_assets_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0))
);

CREATE TABLE IF NOT EXISTS "marketplace_candidate_batches" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "platform" marketplace_platform NOT NULL,
  "sourceUrl" text NOT NULL,
  "categoryName" text,
  "sortMode" varchar(100),
  "filtersJson" jsonb,
  "count" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_candidate_batches_count_nonnegative" CHECK ("count" >= 0)
);

CREATE TABLE IF NOT EXISTS "marketplace_candidate_items" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "batchId" varchar(64) NOT NULL REFERENCES "marketplace_candidate_batches"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" marketplace_platform NOT NULL,
  "sourceUrl" text NOT NULL,
  "externalProductId" varchar(128),
  "externalShopId" varchar(128),
  "title" text NOT NULL,
  "priceText" varchar(128),
  "soldCountText" varchar(128),
  "discountText" varchar(64),
  "imageUrl" text,
  "badgesJson" jsonb,
  "score" integer NOT NULL DEFAULT 0,
  "scoreReasonsJson" jsonb,
  "position" integer DEFAULT 0,
  "rawJson" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_candidate_items_score_bounds" CHECK ("score" >= 0 AND "score" <= 100)
);

CREATE TABLE IF NOT EXISTS "marketplace_products" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "captureId" varchar(64) REFERENCES "marketplace_capture_sessions"("id") ON DELETE set null,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "platform" marketplace_platform NOT NULL,
  "sourceUrl" text NOT NULL,
  "externalProductId" varchar(128),
  "externalShopId" varchar(128),
  "productName" text NOT NULL,
  "brand" text,
  "shopName" text,
  "isMall" boolean,
  "priceCurrent" numeric(12, 2),
  "priceOriginal" numeric(12, 2),
  "currency" varchar(16) DEFAULT 'THB',
  "discountText" varchar(64),
  "ratingScore" numeric(4, 2),
  "reviewCountText" varchar(128),
  "soldCountText" varchar(128),
  "soldCountNormalized" integer,
  "descriptionText" text,
  "descriptionJson" jsonb,
  "specsJson" jsonb,
  "platformRawJson" jsonb,
  "coverImageAssetId" varchar(64) REFERENCES "marketplace_capture_assets"("id") ON DELETE set null,
  "status" varchar(32) DEFAULT 'active',
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_products_price_nonnegative" CHECK (("priceCurrent" IS NULL OR "priceCurrent" >= 0) AND ("priceOriginal" IS NULL OR "priceOriginal" >= 0)),
  CONSTRAINT "marketplace_products_rating_bounds" CHECK ("ratingScore" IS NULL OR ("ratingScore" >= 0 AND "ratingScore" <= 5)),
  CONSTRAINT "marketplace_products_sold_count_nonnegative" CHECK ("soldCountNormalized" IS NULL OR "soldCountNormalized" >= 0)
);

CREATE TABLE IF NOT EXISTS "marketplace_product_images" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "captureAssetId" varchar(64) REFERENCES "marketplace_capture_assets"("id") ON DELETE set null,
  "type" marketplace_product_image_type NOT NULL,
  "url" text NOT NULL,
  "storageKey" text,
  "originalSourceUrl" text,
  "sortOrder" integer DEFAULT 0,
  "width" integer,
  "height" integer,
  "metadataJson" jsonb,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_product_images_dimensions_positive" CHECK (("width" IS NULL OR "width" > 0) AND ("height" IS NULL OR "height" > 0))
);

CREATE TABLE IF NOT EXISTS "marketplace_product_price_snapshots" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "captureId" varchar(64) REFERENCES "marketplace_capture_sessions"("id") ON DELETE set null,
  "priceCurrent" numeric(12, 2),
  "priceOriginal" numeric(12, 2),
  "currency" varchar(16) DEFAULT 'THB',
  "discountText" varchar(64),
  "soldCountText" varchar(128),
  "soldCountNormalized" integer,
  "capturedAt" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "marketplace_price_snapshots_price_nonnegative" CHECK (("priceCurrent" IS NULL OR "priceCurrent" >= 0) AND ("priceOriginal" IS NULL OR "priceOriginal" >= 0)),
  CONSTRAINT "marketplace_price_snapshots_sold_count_nonnegative" CHECK ("soldCountNormalized" IS NULL OR "soldCountNormalized" >= 0)
);

CREATE INDEX IF NOT EXISTS "idx_marketplace_extension_pairings_user" ON "marketplace_extension_pairings" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_extension_pairings_status" ON "marketplace_extension_pairings" ("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user" ON "marketplace_capture_sessions" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_platform_product" ON "marketplace_capture_sessions" ("platform", "externalProductId");
CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_tenant" ON "marketplace_capture_sessions" ("tenantId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_source_unique"
  ON "marketplace_capture_sessions" ("userId", "platform", "externalProductId", "sourceUrl")
  WHERE "externalProductId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_product_pair_unique"
  ON "marketplace_capture_sessions" ("userId", "platform", "externalShopId", "externalProductId")
  WHERE "externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_assets_capture" ON "marketplace_capture_assets" ("captureId", "sortOrder");
CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_assets_user" ON "marketplace_capture_assets" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_candidate_batches_user" ON "marketplace_candidate_batches" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_candidate_items_batch" ON "marketplace_candidate_items" ("batchId", "score");
CREATE INDEX IF NOT EXISTS "idx_marketplace_candidate_items_user" ON "marketplace_candidate_items" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_products_user" ON "marketplace_products" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_marketplace_products_platform_product" ON "marketplace_products" ("platform", "externalProductId");
CREATE INDEX IF NOT EXISTS "idx_marketplace_products_tenant" ON "marketplace_products" ("tenantId", "createdAt");
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_products_user_product_unique"
  ON "marketplace_products" ("userId", "platform", "externalProductId")
  WHERE "externalProductId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_products_user_product_pair_unique"
  ON "marketplace_products" ("userId", "platform", "externalShopId", "externalProductId")
  WHERE "externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_marketplace_product_images_product" ON "marketplace_product_images" ("productId", "sortOrder");
CREATE INDEX IF NOT EXISTS "idx_marketplace_product_price_snapshots_product" ON "marketplace_product_price_snapshots" ("productId", "capturedAt");
