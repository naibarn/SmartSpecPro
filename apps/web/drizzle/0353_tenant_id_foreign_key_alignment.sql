-- Upgrade path for databases where 0001 was already recorded before its fresh
-- install FK conversion was repaired. Preserve values and the existing FK
-- definitions; invalid/orphaned references abort this transaction.
DO $$
DECLARE
  tenant_fk record;
BEGIN
  IF to_regclass('public.tenants') IS NULL THEN
    RAISE EXCEPTION 'Cannot align tenant foreign keys: public.tenants is missing';
  END IF;

  IF (
    SELECT format_type(attribute.atttypid, attribute.atttypmod)
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.tenants'::regclass
      AND attribute.attname = 'id'
      AND NOT attribute.attisdropped
  ) <> 'character varying(36)' THEN
    RAISE EXCEPTION 'Cannot align tenant foreign keys: tenants.id is not varchar(36)';
  END IF;

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
    RAISE EXCEPTION 'Cannot safely align tenant foreign keys: composite tenant foreign key requires an explicit migration';
  END IF;

  CREATE TEMP TABLE _spec224_tenant_id_fks ON COMMIT DROP AS
  SELECT
    child_schema.nspname AS child_schema,
    child_table.relname AS child_table,
    fk.conname AS constraint_name,
    child_column.attname AS child_column,
    pg_get_constraintdef(fk.oid) AS constraint_definition,
    format_type(parent_column.atttypid, parent_column.atttypmod) AS parent_type
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
    AND parent_column.attname = 'id'
    AND (child_column.atttypid <> parent_column.atttypid
      OR child_column.atttypmod <> parent_column.atttypmod);

  FOR tenant_fk IN SELECT * FROM _spec224_tenant_id_fks LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE %s USING %I::text',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.child_column,
      tenant_fk.parent_type,
      tenant_fk.child_column
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I %s',
      tenant_fk.child_schema,
      tenant_fk.child_table,
      tenant_fk.constraint_name,
      tenant_fk.constraint_definition
    );
  END LOOP;
END $$;
