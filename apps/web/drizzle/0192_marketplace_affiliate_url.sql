ALTER TABLE "marketplace_capture_sessions"
  ADD COLUMN IF NOT EXISTS "affiliateUrl" text;

ALTER TABLE "marketplace_candidate_items"
  ADD COLUMN IF NOT EXISTS "affiliateUrl" text;

ALTER TABLE "marketplace_products"
  ADD COLUMN IF NOT EXISTS "affiliateUrl" text;
