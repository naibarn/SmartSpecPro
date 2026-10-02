CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'quarterly', 'semi_annual', 'yearly');--> statement-breakpoint
CREATE TYPE "public"."package_type" AS ENUM('one_time', 'subscription');--> statement-breakpoint
-- Keep every existing tenant-id foreign key valid while the legacy serial
-- identity is converted to the canonical string identity. Casting integer
-- values to text preserves the original tenant identifiers exactly; restoring
-- the foreign keys in the same migration fails closed if any orphan exists.
DO $$
DECLARE
  tenant_fk record;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint AS fk
    JOIN pg_class AS parent_table ON parent_table.oid = fk.confrelid
    JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent_table.relnamespace
    JOIN pg_attribute AS parent_column
      ON parent_column.attrelid = parent_table.oid
     AND parent_column.attnum = fk.confkey[1]
    WHERE fk.contype = 'f'
      AND parent_schema.nspname = 'public'
      AND parent_table.relname = 'tenants'
      AND parent_column.attname = 'id'
      AND (cardinality(fk.conkey) <> 1 OR cardinality(fk.confkey) <> 1)
  ) THEN
    RAISE EXCEPTION 'Cannot safely convert tenants.id: composite tenant foreign key requires an explicit migration';
  END IF;

  CREATE TEMP TABLE _spec224_tenant_id_fks ON COMMIT DROP AS
  SELECT
    child_schema.nspname AS child_schema,
    child_table.relname AS child_table,
    fk.conname AS constraint_name,
    child_column.attname AS child_column,
    pg_get_constraintdef(fk.oid) AS constraint_definition
  FROM pg_constraint AS fk
  JOIN pg_class AS child_table ON child_table.oid = fk.conrelid
  JOIN pg_namespace AS child_schema ON child_schema.oid = child_table.relnamespace
  JOIN pg_attribute AS child_column
    ON child_column.attrelid = child_table.oid
   AND child_column.attnum = fk.conkey[1]
  JOIN pg_class AS parent_table ON parent_table.oid = fk.confrelid
  JOIN pg_namespace AS parent_schema ON parent_schema.oid = parent_table.relnamespace
  JOIN pg_attribute AS parent_column
    ON parent_column.attrelid = parent_table.oid
   AND parent_column.attnum = fk.confkey[1]
  WHERE fk.contype = 'f'
    AND parent_schema.nspname = 'public'
    AND parent_table.relname = 'tenants'
    AND parent_column.attname = 'id';

  FOR tenant_fk IN SELECT * FROM _spec224_tenant_id_fks LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.constraint_name
    );
  END LOOP;

  FOR tenant_fk IN SELECT DISTINCT child_schema, child_table, child_column
    FROM _spec224_tenant_id_fks
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE varchar(36) USING %I::text',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.child_column,
      tenant_fk.child_column
    );
  END LOOP;

  ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "tenants" ALTER COLUMN "id" TYPE varchar(36) USING "id"::text;

  FOR tenant_fk IN SELECT * FROM _spec224_tenant_id_fks LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.constraint_name,
      tenant_fk.constraint_definition
    );
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "packageType" "package_type" DEFAULT 'one_time' NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "billingPeriod" "billing_period";--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "discountPercent" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "stripeProductId" varchar(128);--> statement-breakpoint
ALTER TABLE "credit_packages" ADD COLUMN "stripePriceIds" json;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "status" varchar(20) DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "plan" varchar(20) DEFAULT 'FREE' NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;
