#!/usr/bin/env bash
set -euo pipefail

if [[ -n "${DATABASE_URL:-}" ]]; then
  echo "MINI_APP_BASELINE_REFUSES_DATABASE_URL" >&2
  exit 2
fi

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PG_BIN="$(pg_config --bindir)"
BASELINE_DIR=""
STARTED_LOCAL_DB=0

stop_local_db() {
  if [[ "$STARTED_LOCAL_DB" == "1" && -n "$BASELINE_DIR" && -d "$BASELINE_DIR/data" ]]; then
    "$PG_BIN/pg_ctl" -D "$BASELINE_DIR/data" stop -m fast >/dev/null || true
  fi
}

on_exit() {
  local status=$?
  stop_local_db
  if [[ "$status" -eq 0 && -n "$BASELINE_DIR" ]]; then
    rm -rf -- "$BASELINE_DIR"
  elif [[ "$status" -ne 0 && -n "$BASELINE_DIR" ]]; then
    printf 'Disposable PostgreSQL evidence retained at %s\n' "$BASELINE_DIR" >&2
  fi
  exit "$status"
}
trap on_exit EXIT

if [[ -z "${MINI_APP_BASELINE_DATABASE_URL:-}" ]]; then
  BASELINE_DIR="$(mktemp -d /tmp/miniapp-baseline.XXXXXX)"
  mkdir "$BASELINE_DIR/socket"
  PORT="$(node -e 'const net=require("node:net");const s=net.createServer();s.listen(0,"127.0.0.1",()=>{console.log(s.address().port);s.close();});')"
  "$PG_BIN/initdb" -D "$BASELINE_DIR/data" --auth=trust --no-locale --encoding=UTF8 >/dev/null
  "$PG_BIN/pg_ctl" -D "$BASELINE_DIR/data" \
    -o "-h 127.0.0.1 -p $PORT -k $BASELINE_DIR/socket" \
    -l "$BASELINE_DIR/postgres.log" start >/dev/null
  STARTED_LOCAL_DB=1
  createdb -h 127.0.0.1 -p "$PORT" miniapp_factory_test
  MINI_APP_BASELINE_DATABASE_URL="postgresql://$(id -un)@127.0.0.1:$PORT/miniapp_factory_test"
  export MINI_APP_BASELINE_DATABASE_URL
fi

node --input-type=module -e '
  const value = process.env.MINI_APP_BASELINE_DATABASE_URL;
  if (!value) throw new Error("MINI_APP_BASELINE_DATABASE_URL_REQUIRED");
  const target = new URL(value);
  const database = target.pathname.replace(/^\/+/, "");
  if (!["localhost", "127.0.0.1"].includes(target.hostname) || !/^miniapp_[a-z0-9_-]*_test$/i.test(database)) {
    throw new Error("MINI_APP_BASELINE_TARGET_UNSAFE");
  }
'

cd "$APP_DIR"
pnpm exec drizzle-kit migrate --config=drizzle.mini-app-baseline.config.ts
psql "$MINI_APP_BASELINE_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/test-mini-app-runtime-baseline.sql
