-- Keep fresh dev-active databases aligned with the canonical marketplace
-- affiliate-link table: preserve the existing link and allow multiple rows
-- for each product/user pair.
DROP INDEX IF EXISTS "idx_marketplace_product_affiliate_links_unique";

CREATE INDEX IF NOT EXISTS "idx_marketplace_product_affiliate_links_product_user_created"
  ON "marketplace_product_affiliate_links" ("productId", "userId", "createdAt");
