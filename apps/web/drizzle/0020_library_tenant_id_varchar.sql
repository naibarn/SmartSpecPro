DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_items_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_items" DROP CONSTRAINT "library_items_tenant_id_tenants_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_chunks_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_chunks" DROP CONSTRAINT "library_chunks_tenant_id_tenants_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_permissions_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_permissions" DROP CONSTRAINT "library_permissions_tenant_id_tenants_id_fk";
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_index_jobs_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_index_jobs" DROP CONSTRAINT "library_index_jobs_tenant_id_tenants_id_fk";
  END IF;
END $$;
--> statement-breakpoint

ALTER TABLE "library_items"
  ALTER COLUMN "tenant_id" TYPE varchar(36) USING "tenant_id"::varchar;--> statement-breakpoint
ALTER TABLE "library_chunks"
  ALTER COLUMN "tenant_id" TYPE varchar(36) USING "tenant_id"::varchar;--> statement-breakpoint
ALTER TABLE "library_permissions"
  ALTER COLUMN "tenant_id" TYPE varchar(36) USING "tenant_id"::varchar;--> statement-breakpoint
ALTER TABLE "library_index_jobs"
  ALTER COLUMN "tenant_id" TYPE varchar(36) USING "tenant_id"::varchar;--> statement-breakpoint

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_items_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_items"
      ADD CONSTRAINT "library_items_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_chunks_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_chunks"
      ADD CONSTRAINT "library_chunks_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_permissions_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_permissions"
      ADD CONSTRAINT "library_permissions_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'library_index_jobs_tenant_id_tenants_id_fk'
  ) THEN
    ALTER TABLE "library_index_jobs"
      ADD CONSTRAINT "library_index_jobs_tenant_id_tenants_id_fk"
      FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id")
      ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
