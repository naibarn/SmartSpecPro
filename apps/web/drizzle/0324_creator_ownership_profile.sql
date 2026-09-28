-- Creator contact and ownership metadata for international attribution,
-- digital licenses, and watermark rendering. Additive; no existing profile or
-- recovery values are copied or reinterpreted.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "firstName" varchar(120),
  ADD COLUMN IF NOT EXISTS "lastName" varchar(120),
  ADD COLUMN IF NOT EXISTS "contactEmail" varchar(320),
  ADD COLUMN IF NOT EXISTS "contactPhone" varchar(16),
  ADD COLUMN IF NOT EXISTS "contactAddressLine1" varchar(255),
  ADD COLUMN IF NOT EXISTS "contactAddressLine2" varchar(255),
  ADD COLUMN IF NOT EXISTS "contactCity" varchar(120),
  ADD COLUMN IF NOT EXISTS "contactStateOrProvince" varchar(120),
  ADD COLUMN IF NOT EXISTS "contactPostalCode" varchar(32),
  ADD COLUMN IF NOT EXISTS "contactCountryCode" varchar(2);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_contact_phone_e164_check') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_contact_phone_e164_check"
      CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_contact_country_code_check') THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_contact_country_code_check"
      CHECK ("contactCountryCode" IS NULL OR "contactCountryCode" ~ '^[A-Z]{2}$');
  END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_ownership_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "userId" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "ownerType" varchar(32),
  "legalName" varchar(255),
  "displayName" varchar(255),
  "countryCode" varchar(2),
  "addressLine1" varchar(255),
  "addressLine2" varchar(255),
  "city" varchar(120),
  "stateOrProvince" varchar(120),
  "postalCode" varchar(32),
  "contactEmail" varchar(320),
  "contactPhone" varchar(16),
  "primaryChannelName" varchar(255),
  "primaryChannelUrl" varchar(2048),
  "websiteUrl" varchar(2048),
  "licenseDisplayName" varchar(255),
  "copyrightNotice" varchar(500),
  "watermarkText" varchar(255),
  "attributionText" varchar(500),
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "user_ownership_profiles_owner_type_check"
    CHECK ("ownerType" IS NULL OR "ownerType" IN ('individual', 'company', 'organization', 'brand', 'other')),
  CONSTRAINT "user_ownership_profiles_country_code_check"
    CHECK ("countryCode" IS NULL OR "countryCode" ~ '^[A-Z]{2}$'),
  CONSTRAINT "user_ownership_profiles_contact_phone_check"
    CHECK ("contactPhone" IS NULL OR "contactPhone" ~ '^\+[1-9][0-9]{7,14}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_ownership_profiles_user_unique"
  ON "user_ownership_profiles" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_ownership_profiles_country_idx"
  ON "user_ownership_profiles" ("countryCode");
