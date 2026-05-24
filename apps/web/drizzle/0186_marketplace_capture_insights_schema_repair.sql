-- Repair marketplace_capture_insights for environments that created the table
-- before the final Feature 115 columns were added to 0181.
ALTER TABLE "marketplace_capture_insights"
  ADD COLUMN IF NOT EXISTS "parentInsightIdsJson" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "rawCaptureIncluded" boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS "storytellingReadiness" varchar(64),
  ADD COLUMN IF NOT EXISTS "claimResolutionsJson" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "extensionVersion" varchar(80),
  ADD COLUMN IF NOT EXISTS "insightCreatedAt" timestamp with time zone;

UPDATE "marketplace_capture_insights"
SET
  "parentInsightIdsJson" = COALESCE("parentInsightIdsJson", '[]'::jsonb),
  "rawCaptureIncluded" = COALESCE("rawCaptureIncluded", false),
  "claimResolutionsJson" = COALESCE("claimResolutionsJson", '[]'::jsonb);

ALTER TABLE "marketplace_capture_insights"
  ALTER COLUMN "parentInsightIdsJson" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "parentInsightIdsJson" SET NOT NULL,
  ALTER COLUMN "rawCaptureIncluded" SET DEFAULT false,
  ALTER COLUMN "rawCaptureIncluded" SET NOT NULL,
  ALTER COLUMN "claimResolutionsJson" SET DEFAULT '[]'::jsonb,
  ALTER COLUMN "claimResolutionsJson" SET NOT NULL;

CREATE INDEX IF NOT EXISTS "idx_marketplace_capture_insights_readiness"
  ON "marketplace_capture_insights" ("userId", "storytellingReadiness");
