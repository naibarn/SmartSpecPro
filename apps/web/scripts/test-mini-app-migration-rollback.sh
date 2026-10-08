#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" || -n "${MINI_APP_BASELINE_DATABASE_URL:-}" ]]; then
  echo "MIGRATION_ROLLBACK_REFUSES_INHERITED_DATABASE_URL" >&2
  exit 2
fi
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/miniapp-migration-rollback.XXXXXX")"
mkdir "$TEST_DIR/socket"
DB_STARTED=0
PASS=0
cleanup() {
  local status=$?
  if [[ "$DB_STARTED" == "1" ]]; then "$PG_BIN/pg_ctl" -D "$TEST_DIR/data" stop -m fast >/dev/null || true; fi
  if [[ "$status" -eq 0 && "$PASS" == "1" ]]; then
    rm -rf -- "$TEST_DIR"
  else
    echo "MIGRATION_ROLLBACK_EVIDENCE_DIR=$TEST_DIR" >&2
  fi
  exit "$status"
}
trap cleanup EXIT
PORT="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
"$PG_BIN/initdb" -D "$TEST_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TEST_DIR/data" -o "-h 127.0.0.1 -p $PORT -k $TEST_DIR/socket" -l "$TEST_DIR/postgres.log" start >/dev/null
DB_STARTED=1
createdb -h 127.0.0.1 -p "$PORT" miniapp_migration_rollback_test
export ROLLBACK_TEST_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_migration_rollback_test"
psql "$ROLLBACK_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE tenants (id varchar(36) PRIMARY KEY);
INSERT INTO tenants (id) VALUES ('migration-rollback-tenant');
SQL
psql "$ROLLBACK_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP_DIR/drizzle/0392_spec304_app_identity_and_route_aliases.sql" >/dev/null
psql "$ROLLBACK_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f "$APP_DIR/drizzle/0393_spec302_canonical_project_identity.sql" >/dev/null
psql "$ROLLBACK_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO app_identities (app_id, public_app_id, tenant_id, publisher_ref, canonical_product_id)
VALUES ('app_research_notes', 'research-notes', 'migration-rollback-tenant', 'platform:smartaihub', 'product:research-notes');
INSERT INTO canonical_projects (project_id, tenant_id, project_type, title, owner_principal_id)
VALUES ('rollback-project', 'migration-rollback-tenant', 'workspace', 'Rollback project', 'user:1');
INSERT INTO canonical_project_memberships (tenant_id, project_id, principal_id, role)
VALUES ('migration-rollback-tenant', 'rollback-project', 'user:1', 'owner');
INSERT INTO canonical_project_app_bindings (tenant_id, project_id, app_id)
VALUES ('migration-rollback-tenant', 'rollback-project', 'app_research_notes');
INSERT INTO mini_app_research_notes (note_id, tenant_id, project_id, app_id, owner_principal_id, title)
VALUES ('rollback-note', 'migration-rollback-tenant', 'rollback-project', 'app_research_notes', 'user:1', 'Rollback note');
SQL
psql "$ROLLBACK_TEST_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;
DROP TABLE mini_app_research_notes;
DROP TABLE canonical_project_app_bindings;
DROP TABLE canonical_project_memberships;
DROP TABLE canonical_projects;
DROP INDEX app_identities_tenant_app_id_unique;
COMMIT;
DO $$
BEGIN
  IF to_regclass('public.mini_app_research_notes') IS NOT NULL OR
     to_regclass('public.canonical_project_app_bindings') IS NOT NULL OR
     to_regclass('public.canonical_project_memberships') IS NOT NULL OR
     to_regclass('public.canonical_projects') IS NOT NULL OR
     to_regclass('public.app_identities_tenant_app_id_unique') IS NOT NULL THEN
    RAISE EXCEPTION '0393 rollback left schema objects behind';
  END IF;
  IF to_regclass('public.app_identities') IS NULL OR to_regclass('public.app_route_aliases') IS NULL THEN
    RAISE EXCEPTION '0393 rollback removed objects owned by 0392';
  END IF;
END $$;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM app_identities WHERE app_id = 'app_research_notes') THEN
    RAISE EXCEPTION '0393 rollback did not preserve pre-existing app identity';
  END IF;
END $$;
SQL
echo "MINI_APP_MIGRATION_0393_ROLLBACK_PASS target=disposable-postgresql-17"
PASS=1
