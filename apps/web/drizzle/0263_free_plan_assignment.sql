ALTER TABLE "credit_packages"
  ADD COLUMN IF NOT EXISTS "code" varchar(64);
--> statement-breakpoint

-- Give the existing active monthly Free package a stable identity. The update
-- is intentionally name/type scoped and does not overwrite another code.
UPDATE "credit_packages"
SET "code" = 'free'
WHERE "id" = (
  SELECT "id"
  FROM "credit_packages"
  WHERE lower(btrim("name")) = 'free'
    AND "packageType" = 'subscription'
    AND "billingPeriod" = 'monthly'
    AND "isActive" = true
  ORDER BY "id"
  LIMIT 1
)
AND "code" IS NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "credit_packages_code_unique"
  ON "credit_packages" USING btree ("code")
  WHERE "code" IS NOT NULL;
--> statement-breakpoint

ALTER TABLE "billing_subscriptions"
  ADD COLUMN IF NOT EXISTS "packageId" integer;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "billing_subscriptions"
    ADD CONSTRAINT "billing_subscriptions_package_fk"
    FOREIGN KEY ("packageId") REFERENCES "credit_packages"("id")
    ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

UPDATE "billing_subscriptions" AS bs
SET "packageId" = cp."id"
FROM "credit_packages" AS cp
WHERE bs."packageId" IS NULL
  AND bs."planCode" = cp."code";
