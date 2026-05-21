ALTER TABLE "marketplace_product_price_snapshots"
  ADD COLUMN IF NOT EXISTS "capturedByUserId" integer REFERENCES "users"("id") ON DELETE set null,
  ADD COLUMN IF NOT EXISTS "ratingScore" numeric(4, 2),
  ADD COLUMN IF NOT EXISTS "reviewCountText" varchar(128),
  ADD COLUMN IF NOT EXISTS "reviewCountNormalized" integer;

CREATE TABLE IF NOT EXISTS "marketplace_product_group_shares" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "groupId" integer NOT NULL REFERENCES "user_groups"("id") ON DELETE cascade,
  "sharedByUserId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "platform" marketplace_platform NOT NULL,
  "permission" varchar(32) NOT NULL DEFAULT 'read_update',
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "marketplace_user_share_settings" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
  "platform" marketplace_platform NOT NULL,
  "enabled" boolean NOT NULL DEFAULT true,
  "groupIdsJson" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "permission" varchar(32) NOT NULL DEFAULT 'read_update',
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_marketplace_product_price_snapshots_user"
  ON "marketplace_product_price_snapshots" ("capturedByUserId", "capturedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_product_group_shares_unique"
  ON "marketplace_product_group_shares" ("productId", "groupId");
CREATE INDEX IF NOT EXISTS "idx_marketplace_product_group_shares_group"
  ON "marketplace_product_group_shares" ("tenantId", "groupId", "platform");
CREATE INDEX IF NOT EXISTS "idx_marketplace_product_group_shares_product"
  ON "marketplace_product_group_shares" ("productId");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_user_share_settings_unique"
  ON "marketplace_user_share_settings" ("userId", "tenantId", "platform");
CREATE INDEX IF NOT EXISTS "idx_marketplace_user_share_settings_user"
  ON "marketplace_user_share_settings" ("userId", "tenantId");

DO $$ BEGIN
  ALTER TABLE "marketplace_product_price_snapshots"
    ADD CONSTRAINT "marketplace_price_snapshots_review_count_nonnegative"
    CHECK ("reviewCountNormalized" IS NULL OR "reviewCountNormalized" >= 0);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "marketplace_product_price_snapshots"
    ADD CONSTRAINT "marketplace_price_snapshots_rating_bounds"
    CHECK ("ratingScore" IS NULL OR ("ratingScore" >= 0 AND "ratingScore" <= 5));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
