ALTER TABLE "provider_usage_log"
  ADD COLUMN IF NOT EXISTS "skillSlug" varchar(100);
