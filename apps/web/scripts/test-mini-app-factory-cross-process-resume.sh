#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "MINI_APP_FACTORY_RESUME_REFUSES_PREEXISTING_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/miniapp-factory-resume.XXXXXX")"
mkdir "$TEST_DIR/socket"
PG_STARTED=0

cleanup() {
  local status=$?
  if [[ "$PG_STARTED" == "1" ]]; then
    "$PG_BIN/pg_ctl" -D "$TEST_DIR/data" stop -m fast >/dev/null || true
  fi
  rm -rf -- "$TEST_DIR"
  exit "$status"
}
trap cleanup EXIT

PORT="$(node -e 'const net=require("node:net");const server=net.createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close();});')"
"$PG_BIN/initdb" -D "$TEST_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TEST_DIR/data" -o "-h 127.0.0.1 -p $PORT -k $TEST_DIR/socket" -l "$TEST_DIR/postgres.log" start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PORT" miniapp_factory_resume_test
export MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_factory_resume_test"
export JWT_SECRET="mini-app-factory-resume-test-secret-32-bytes"
export NODE_ENV=test

cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts
psql "$MINI_APP_BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
INSERT INTO tenants (id, slug, name)
VALUES ('miniapp-factory-resume-tenant', 'miniapp-factory-resume', 'Factory Resume Test');
INSERT INTO users (id, "openId", name, role, "currentTenantId")
VALUES (1, 'miniapp-factory-resume-user', 'Factory Resume Test', 'user', 'miniapp-factory-resume-tenant');
SQL

export DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL"
export MINI_APP_FACTORY_SOURCE_SHA="$(git rev-parse HEAD)"
pnpm exec tsx scripts/mini-app-factory-cross-process-resume.ts start
# The first Node process has exited. A new process discovers and resumes only from PostgreSQL.
pnpm exec tsx scripts/mini-app-factory-cross-process-resume.ts resume
echo "MINI_APP_FACTORY_CROSS_PROCESS_RESUME_PASS"
