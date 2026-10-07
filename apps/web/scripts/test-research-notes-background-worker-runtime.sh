#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "RESEARCH_NOTES_WORKER_RUNTIME_REFUSES_PREEXISTING_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
TEST_DIR="$(mktemp -d /tmp/research-notes-worker-runtime.XXXXXX)"
mkdir "$TEST_DIR/socket"
PG_STARTED=0

cleanup() {
  local status=$?
  if [[ "$PG_STARTED" == "1" ]]; then "$PG_BIN/pg_ctl" -D "$TEST_DIR/data" stop -m fast >/dev/null || true; fi
  if [[ "$status" -eq 0 ]]; then rm -rf -- "$TEST_DIR"; else printf 'Disposable worker runtime evidence retained at %s\n' "$TEST_DIR" >&2; fi
  exit "$status"
}
trap cleanup EXIT

PORT="$(node -e 'const net=require("node:net");const server=net.createServer();server.listen(0,"127.0.0.1",()=>{console.log(server.address().port);server.close();});')"
"$PG_BIN/initdb" -D "$TEST_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$TEST_DIR/data" -o "-h 127.0.0.1 -p $PORT -k $TEST_DIR/socket" -l "$TEST_DIR/postgres.log" start >/dev/null
PG_STARTED=1
createdb -h 127.0.0.1 -p "$PORT" miniapp_worker_runtime_test
export MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_worker_runtime_test"
export JWT_SECRET="research-notes-worker-test-secret-32-bytes"
export NODE_ENV=test
export FEATURE_186_NODE_WORKER_HEARTBEAT_FILE="$TEST_DIR/worker.heartbeat"

cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts
psql "$MINI_APP_BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/research-notes-focused-runtime.seed.sql >/dev/null
export DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL"
pnpm exec tsx scripts/research-notes-background-worker-runtime.ts
echo "RESEARCH_NOTES_BACKGROUND_WORKER_RUNTIME_PASS"
