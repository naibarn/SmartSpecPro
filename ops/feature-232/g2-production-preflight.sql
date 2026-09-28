-- Read-only Production preflight for Spec 245 G2.
-- Run with a read-only DB role. Do not remove BEGIN READ ONLY / ROLLBACK.
BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_setting('server_version_num') AS postgres_version_num,
       current_setting('transaction_read_only') AS transaction_read_only;

SELECT count(*) AS applied_migration_rows,
       max(created_at) AS latest_migration_timestamp,
       (array_agg(hash ORDER BY created_at DESC))[1] AS latest_migration_hash
FROM drizzle.__drizzle_migrations;

SELECT table_name, to_regclass(format('public.%I', table_name)) IS NOT NULL AS present
FROM (VALUES
  ('revoked_token_jtis'),
  ('oauth_device_authorizations'),
  ('auth_login_failure_counters'),
  ('ephemeral_authorization_sessions')
) AS g2(table_name)
ORDER BY table_name;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'users'
  AND column_name = 'id';

SELECT name, setting, unit
FROM pg_settings
WHERE name IN ('lock_timeout', 'statement_timeout');

SELECT count(*) AS current_lock_waiters
FROM pg_stat_activity
WHERE datname = current_database()
  AND wait_event_type = 'Lock';

ROLLBACK;
