DROP INDEX IF EXISTS "idx_marketplace_capture_sessions_user_source_unique";
DROP INDEX IF EXISTS "idx_marketplace_capture_sessions_user_product_pair_unique";

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_source_unique"
  ON "marketplace_capture_sessions" ("userId", "platform", "externalProductId", "sourceUrl")
  WHERE "externalProductId" IS NOT NULL AND "status" NOT IN ('confirmed', 'discarded');

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_capture_sessions_user_product_pair_unique"
  ON "marketplace_capture_sessions" ("userId", "platform", "externalShopId", "externalProductId")
  WHERE "externalShopId" IS NOT NULL AND "externalProductId" IS NOT NULL AND "status" NOT IN ('confirmed', 'discarded');
