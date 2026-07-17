-- Additive Character Narrative Role V2 fields.
-- This table lineage uses hand-authored idempotent migrations because its drizzle
-- journal has a pre-existing collision. Keep these columns nullable during rollout;
-- the backfill marks ambiguous records for user review instead of inventing a role.
ALTER TABLE "vertical_drama_characters"
  ADD COLUMN IF NOT EXISTS "narrativeRole" varchar(32),
  ADD COLUMN IF NOT EXISTS "roleTier" varchar(48),
  ADD COLUMN IF NOT EXISTS "occupation" varchar(160),
  ADD COLUMN IF NOT EXISTS "roleVisualIntent" jsonb,
  ADD COLUMN IF NOT EXISTS "roleProvenance" varchar(24),
  ADD COLUMN IF NOT EXISTS "roleReviewStatus" varchar(32);

CREATE INDEX IF NOT EXISTS "vertical_drama_characters_series_role_tier_idx"
  ON "vertical_drama_characters" ("seriesId", "roleTier");
