-- Allow up to 10 per-user affiliate URLs for each marketplace product.
-- Existing rows are retained; the old unique product/user index prevented
-- storing a user's second link.
DROP INDEX IF EXISTS "idx_marketplace_product_affiliate_links_unique";

CREATE INDEX IF NOT EXISTS "idx_marketplace_product_affiliate_links_product_user_created"
  ON "marketplace_product_affiliate_links" ("productId", "userId", "createdAt");
