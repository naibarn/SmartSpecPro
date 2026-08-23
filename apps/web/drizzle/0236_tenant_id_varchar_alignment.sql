-- Align the legacy users.currentTenantId column with the varchar tenant ID
-- contract used by the current schema and runtime.
--
-- This is deliberately idempotent so it can repair databases that were
-- created from the old integer-based migration history as well as databases
-- that already have the corrected varchar column.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'currentTenantId'
  ) THEN
    ALTER TABLE "users"
      DROP CONSTRAINT IF EXISTS "users_currentTenantId_tenants_id_fk";

    ALTER TABLE "users"
      ALTER COLUMN "currentTenantId" TYPE varchar(36)
      USING "currentTenantId"::text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tenants'
      AND column_name = 'id'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'currentTenantId'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_currentTenantId_tenants_id_fk'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE "users"
      ADD CONSTRAINT "users_currentTenantId_tenants_id_fk"
      FOREIGN KEY ("currentTenantId")
      REFERENCES "public"."tenants"("id")
      ON DELETE no action
      ON UPDATE no action;
  END IF;
END $$;
