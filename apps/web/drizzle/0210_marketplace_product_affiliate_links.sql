-- Marketplace product affiliate links (per user, per product) — additive, IF NOT EXISTS guarded.
-- Hand-authored from drizzle/schema.ts because `drizzle-kit generate` is blocked by the
-- pre-existing meta-journal snapshot collision (drizzle/meta/0146_snapshot.json and
-- drizzle/meta/0147_snapshot.json share the same id/prevId), the same issue documented in
-- drizzle/manual_vertical_drama_genre_preset_ownership.sql. Applied directly via psql and
-- registered here in _journal.json (numbered, unlike the manual_* files) so a fresh database
-- setup running `drizzle-kit migrate` will also pick this file up.
--
-- Reason: marketplace_products rows are shared across a group (marketplace_product_group_shares,
-- permission=read_update) so all group members read/write the SAME row today. Storing
-- affiliateUrl on marketplace_products means one member's re-capture silently overwrites another
-- member's link. This migration creates a per-(product,user) table to hold affiliateUrl
-- independently and backfills one row per existing marketplace_products row (its owning user).
-- marketplace_products.affiliateUrl is left untouched (legacy/unused after this change; dropping
-- it is out of scope and requires separate approval).

CREATE TABLE IF NOT EXISTS "marketplace_product_affiliate_links" (
  "id" varchar(64) PRIMARY KEY NOT NULL,
  "productId" varchar(64) NOT NULL REFERENCES "marketplace_products"("id") ON DELETE cascade,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "tenantId" varchar(36) REFERENCES "tenants"("id") ON DELETE set null,
  "affiliateUrl" text,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "idx_marketplace_product_affiliate_links_unique"
  ON "marketplace_product_affiliate_links" ("productId", "userId");

CREATE INDEX IF NOT EXISTS "idx_marketplace_product_affiliate_links_user"
  ON "marketplace_product_affiliate_links" ("userId", "updatedAt");

-- Backfill: one row per existing marketplace_products row, owned by that row's userId.
-- Idempotent via ON CONFLICT DO NOTHING (unique on productId+userId), safe to re-run.
INSERT INTO marketplace_product_affiliate_links (id, "productId", "userId", "tenantId", "affiliateUrl", "createdAt", "updatedAt")
SELECT 'mpal_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), id, "userId", "tenantId", "affiliateUrl", now(), now()
FROM marketplace_products
ON CONFLICT ("productId", "userId") DO NOTHING;
