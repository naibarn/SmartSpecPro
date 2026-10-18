#!/usr/bin/env bash
set -euo pipefail
umask 077

if [[ $# -lt 2 || $# -gt 3 ]]; then
  echo "Usage: $0 <clean-corpus-worktree> <corpus-sha> [output-json]" >&2
  exit 2
fi

CORPUS_ROOT="$(cd "$1" && pwd)"
CORPUS_SHA="$2"
OUTPUT_PATH="${3:-/tmp/spec229-local-eval-$(date -u +%Y%m%dT%H%M%SZ).json}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PG_BIN="$(pg_config --bindir)"
DB_USER="$(id -un)"
PG_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/spec229-pg.XXXXXX")"
PG_PORT="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()')"
PG_STARTED=0

cleanup() {
  if [[ "$PG_STARTED" == "1" ]]; then
    "$PG_BIN/pg_ctl" -D "$PG_ROOT/data" -m fast -w stop >/dev/null
  fi
  rm -rf -- "$PG_ROOT"
}
trap cleanup EXIT INT TERM

"$PG_BIN/initdb" -D "$PG_ROOT/data" --no-locale --encoding=UTF8 \
  --auth-local=trust --auth-host=trust >/dev/null
mkdir -p "$PG_ROOT/socket"
"$PG_BIN/pg_ctl" -D "$PG_ROOT/data" -l "$PG_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -k $PG_ROOT/socket -p $PG_PORT" -w start >/dev/null
PG_STARTED=1
"$PG_BIN/createdb" -h 127.0.0.1 -p "$PG_PORT" -U "$DB_USER" spec229_eval_dev
"$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U "$DB_USER" \
  -d spec229_eval_dev -v ON_ERROR_STOP=1 \
  -f "$REPO_ROOT/apps/web/scripts/spec229-local-eval-schema.sql" >/dev/null

cd "$REPO_ROOT"
SPEC229_EVAL_DISPOSABLE=1 \
SPEC229_CORPUS_ROOT="$CORPUS_ROOT" \
DATABASE_URL="postgresql://$DB_USER@127.0.0.1:$PG_PORT/spec229_eval_dev" \
SOURCE_SHA="$CORPUS_SHA" \
JWT_SECRET="spec229-disposable-local-only-secret-32-bytes-long" \
  pnpm --filter @smartspec/web exec tsx scripts/run-spec229-legacy-baseline.ts "$OUTPUT_PATH"

chmod 600 "$OUTPUT_PATH"
printf 'Observation artifact: %s\n' "$OUTPUT_PATH"
