-- Additive, idempotent persistence for Marketplace -> Vertical Drama idea-card history.
CREATE TABLE IF NOT EXISTS "vertical_drama_marketplace_review_idea_runs" (
  "id" bigserial PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "seriesId" bigint NOT NULL REFERENCES "vertical_drama_series"("id") ON DELETE cascade,
  "productId" varchar(128) NOT NULL,
  "variationSeed" varchar(128) NOT NULL,
  "inputFingerprint" varchar(64) NOT NULL,
  "status" varchar(24) NOT NULL DEFAULT 'succeeded',
  "input" jsonb NOT NULL,
  "output" jsonb NOT NULL,
  "selectedIdeaId" varchar(128),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "vds_marketplace_review_idea_run_lookup_idx" ON "vertical_drama_marketplace_review_idea_runs" ("tenantId", "userId", "seriesId", "createdAt");
CREATE INDEX IF NOT EXISTS "vds_marketplace_review_idea_run_product_idx" ON "vertical_drama_marketplace_review_idea_runs" ("tenantId", "seriesId", "productId");
