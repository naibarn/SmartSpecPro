-- Feature 188 — fence promotion batch runners and fail closed on stale work.
-- Additive only; existing checkpoint rows remain recoverable and are not
-- replayed automatically when their previous runner may have reached target.
ALTER TABLE "data_promotion_batches"
  ADD COLUMN IF NOT EXISTS "leaseTokenHash" varchar(128),
  ADD COLUMN IF NOT EXISTS "leaseExpiresAt" timestamptz,
  ADD COLUMN IF NOT EXISTS "fencingVersion" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "data_promotion_batches_lease_idx"
  ON "data_promotion_batches" ("promotionId", "status", "leaseExpiresAt");
