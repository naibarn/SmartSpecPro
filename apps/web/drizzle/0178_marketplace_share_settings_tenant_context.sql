DO $$ DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'marketplace_user_share_settings'
      AND con.contype = 'f'
      AND att.attname = 'tenantId'
  LOOP
    EXECUTE format('ALTER TABLE "marketplace_user_share_settings" DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

DO $$ DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_attribute att ON att.attrelid = rel.oid AND att.attnum = ANY(con.conkey)
    WHERE rel.relname = 'marketplace_product_group_shares'
      AND con.contype = 'f'
      AND att.attname = 'tenantId'
  LOOP
    EXECUTE format('ALTER TABLE "marketplace_product_group_shares" DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END LOOP;
END $$;

COMMENT ON COLUMN "marketplace_user_share_settings"."tenantId" IS
  'Tenant context string for marketplace sharing. Access is enforced through active group membership; this column intentionally has no tenants FK for legacy/domain tenant IDs.';

COMMENT ON COLUMN "marketplace_product_group_shares"."tenantId" IS
  'Tenant context string for marketplace product group shares. Access is enforced through group membership and groupId FK.';
