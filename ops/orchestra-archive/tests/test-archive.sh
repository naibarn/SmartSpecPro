#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ARCHIVE_SCRIPT="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)/orchestra-archive-safe.sh"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/orchestra-archive-test.XXXXXX")"
trap 'rm -rf -- "$TEST_ROOT"' EXIT

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  exit 1
}

assert_exists() {
  [ -e "$1" ] || fail "expected path to exist: $1"
}

assert_missing() {
  [ ! -e "$1" ] || fail "expected path to be absent: $1"
}

assert_file_content() {
  [ "$(<"$1")" = "$2" ] || fail "unexpected content in: $1"
}

expect_failure() {
  if "$@" >/dev/null 2>&1; then
    fail "expected command to fail: $*"
  fi
}

new_case() {
  rm -rf -- "$TEST_ROOT/case"
  mkdir -p -- "$TEST_ROOT/case"
}

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra/archive/old-session"
printf 'keep-me\n' > "$TEST_ROOT/case/orchestra/state.txt"
printf 'historical\n' > "$TEST_ROOT/case/orchestra/archive/old-session/marker.txt"
"$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/.orchestra-archive" \
  --timestamp 20260830T120000Z >/dev/null
assert_missing "$TEST_ROOT/case/orchestra"
assert_file_content "$TEST_ROOT/case/.orchestra-archive/20260830T120000Z/state.txt" "keep-me"
assert_file_content "$TEST_ROOT/case/.orchestra-archive/20260830T120000Z/archive/old-session/marker.txt" "historical"
assert_missing "$TEST_ROOT/case/.orchestra-archive/20260830T120000Z/.orchestra-archive"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/orchestra/.orchestra-archive" \
  --timestamp 20260830T120001Z
assert_exists "$TEST_ROOT/case/orchestra/state.txt"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/other-archive" \
  --timestamp 20260830T120001Z
assert_exists "$TEST_ROOT/case/orchestra/state.txt"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra" "$TEST_ROOT/case/.orchestra-archive/20260830T120002Z"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/.orchestra-archive" \
  --timestamp 20260830T120002Z
assert_exists "$TEST_ROOT/case/orchestra/state.txt"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
ln -s -- "$TEST_ROOT/case/orchestra" "$TEST_ROOT/case/.orchestra-archive"
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/.orchestra-archive" \
  --timestamp 20260830T120003Z
assert_exists "$TEST_ROOT/case/orchestra/state.txt"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/.orchestra-archive" \
  --timestamp ../escape
assert_exists "$TEST_ROOT/case/orchestra/state.txt"
assert_missing "$TEST_ROOT/escape"

new_case
mkdir -p -- "$TEST_ROOT/case/orchestra" "$TEST_ROOT/case/.orchestra-archive"
printf 'source-preserved\n' > "$TEST_ROOT/case/orchestra/state.txt"
(
  exec 9>"$TEST_ROOT/case/.orchestra-archive/.lock"
  flock -n 9
  sleep 2
) &
LOCK_HOLDER_PID=$!
sleep 0.1
expect_failure "$ARCHIVE_SCRIPT" \
  --source "$TEST_ROOT/case/orchestra" \
  --archive-root "$TEST_ROOT/case/.orchestra-archive" \
  --timestamp 20260830T120004Z
wait "$LOCK_HOLDER_PID"
assert_exists "$TEST_ROOT/case/orchestra/state.txt"

printf 'PASS: orchestra archive safety tests\n'
