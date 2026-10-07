#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "MINI_APP_RUNTIME_REFUSES_PREEXISTING_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
RUNTIME_DIR="$(mktemp -d /tmp/miniapp-auth-runtime.XXXXXX)"
PORT="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
mkdir "$RUNTIME_DIR/socket"
STARTED=0
PASSED=0

cleanup() {
  local status=$?
  if [[ "$STARTED" == "1" ]]; then "$PG_BIN/pg_ctl" -D "$RUNTIME_DIR/data" stop -m fast >/dev/null || true; fi
  if [[ "$status" -eq 0 && "$PASSED" == "1" ]]; then rm -rf -- "$RUNTIME_DIR"; else printf 'Disposable runtime evidence retained at %s\n' "$RUNTIME_DIR" >&2; fi
  exit "$status"
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$RUNTIME_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
"$PG_BIN/pg_ctl" -D "$RUNTIME_DIR/data" -o "-h 127.0.0.1 -p $PORT -k $RUNTIME_DIR/socket" -l "$RUNTIME_DIR/postgres.log" start >/dev/null
STARTED=1
createdb -h 127.0.0.1 -p "$PORT" miniapp_authenticated_test
export MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_authenticated_test"
export DATABASE_URL="$MINI_APP_BASELINE_DATABASE_URL"

cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/research-notes-focused-runtime.seed.sql >/dev/null
NODE_ENV=test JWT_SECRET='synthetic-only-runtime-secret-32-characters-minimum' APP_ID=smartspec-local-dev pnpm exec tsx scripts/research-notes-focused-runtime.ts
PASSED=1
