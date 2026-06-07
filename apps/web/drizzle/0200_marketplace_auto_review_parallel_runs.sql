DROP INDEX IF EXISTS "marketplace_auto_review_runs_active_unique";

CREATE INDEX IF NOT EXISTS "marketplace_auto_review_runs_user_product_status_idx"
  ON "marketplace_auto_review_runs" ("userId", "productId", "status", "updatedAt");
