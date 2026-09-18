-- Feature 201 follow-up: keep externally disclosed identifiers opaque and
-- separate from internal database primary keys.

ALTER TABLE "content_protection_assets"
  ADD COLUMN IF NOT EXISTS "public_asset_id" varchar(36);

UPDATE "content_protection_assets"
SET "public_asset_id" = gen_random_uuid()
WHERE "public_asset_id" IS NULL OR "public_asset_id" = '';

ALTER TABLE "content_protection_assets"
  ALTER COLUMN "public_asset_id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "public_asset_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_assets_public_id_unique"
  ON "content_protection_assets" ("public_asset_id");

ALTER TABLE "content_protection_cases"
  ADD COLUMN IF NOT EXISTS "public_case_id" varchar(36);

UPDATE "content_protection_cases"
SET "public_case_id" = gen_random_uuid()
WHERE "public_case_id" IS NULL OR "public_case_id" = '';

ALTER TABLE "content_protection_cases"
  ALTER COLUMN "public_case_id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "public_case_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "content_protection_cases_public_id_unique"
  ON "content_protection_cases" ("public_case_id");
