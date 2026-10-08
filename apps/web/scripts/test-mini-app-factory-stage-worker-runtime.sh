#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "MINI_APP_FACTORY_STAGE_WORKER_REFUSES_PREEXISTING_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/miniapp-factory-stage-worker.XXXXXX")"
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
createdb -h 127.0.0.1 -p "$PORT" miniapp_factory_stage_worker_test
export MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_factory_stage_worker_test"
export DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL"
export JWT_SECRET="mini-app-factory-stage-worker-test-secret"
export NODE_ENV=test
export MINI_APP_FACTORY_SOURCE_SHA="$(git -C "$APP_DIR/../.." rev-parse HEAD)"

cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts start
# The producer process exits. Fresh worker processes discover each job from PostgreSQL/outbox.
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts worker
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts worker
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts recover
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts worker
pnpm exec tsx scripts/mini-app-factory-stage-worker-runtime.ts verify
echo "MINI_APP_FACTORY_STAGE_WORKER_RUNTIME_PASS"
