-- Keep Gallery tenant ownership aligned with the current varchar tenant ID.
-- Legacy deployments used an integer/numeric column and could persist NaN when
-- the runtime tenant ID was a string. Invalid legacy values become global rows
-- so an Admin can remove them through the normal Gallery action.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'gallery_items'
      AND column_name = 'tenantId'
  ) THEN
    ALTER TABLE "gallery_items"
      DROP CONSTRAINT IF EXISTS "gallery_items_tenantId_tenants_id_fk";

    ALTER TABLE "gallery_items"
      ALTER COLUMN "tenantId" TYPE varchar(36)
      USING CASE
        WHEN "tenantId"::text = 'NaN' THEN NULL
        ELSE "tenantId"::text
      END;

    UPDATE "gallery_items" AS gallery
    SET "tenantId" = NULL
    WHERE "tenantId" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "tenants" AS tenant
        WHERE tenant."id" = gallery."tenantId"
      );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'gallery_items'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gallery_items_tenantId_tenants_id_fk'
      AND conrelid = 'public.gallery_items'::regclass
  ) THEN
    ALTER TABLE "gallery_items"
      ADD CONSTRAINT "gallery_items_tenantId_tenants_id_fk"
      FOREIGN KEY ("tenantId")
      REFERENCES "public"."tenants"("id")
      ON DELETE cascade
      ON UPDATE no action;
  END IF;
END $$;
