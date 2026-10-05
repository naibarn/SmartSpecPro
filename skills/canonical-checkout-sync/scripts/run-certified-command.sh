#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "usage: $0 <expected-sha> -- <command> [args...]" >&2
  exit 2
}

[[ $# -ge 3 ]] || usage
EXPECTED="$1"
shift
[[ "$1" == "--" ]] || usage
shift
[[ $# -gt 0 ]] || usage
REPO="${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}"

[[ -d "$REPO" ]] || { echo 'STATUS=BUILD_LEASE_CHECKOUT_MISSING'; exit 50; }
COMMON="$(git -C "$REPO" rev-parse --git-common-dir 2>/dev/null || true)"
[[ -n "$COMMON" ]] || { echo 'STATUS=BUILD_LEASE_NOT_GIT'; exit 50; }
case "$COMMON" in /*) ;; *) COMMON="$REPO/$COMMON";; esac
mkdir -p "$COMMON/codex-resource-locks"
LOCKFILE="$COMMON/codex-resource-locks/canonical-promotion.lock"
exec 9>"$LOCKFILE"
flock -n 9 || { printf 'STATUS=BUILD_LEASE_BUSY\nLOCKFILE=%s\n' "$LOCKFILE"; exit 51; }

BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
HEAD="$(git -C "$REPO" rev-parse HEAD)"
DIRTY="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"
[[ "$BRANCH" == "main" ]] || { echo 'STATUS=BUILD_LEASE_WRONG_BRANCH'; exit 52; }
[[ -z "$DIRTY" ]] || { echo 'STATUS=BUILD_LEASE_DIRTY_CHECKOUT'; exit 53; }
[[ "$HEAD" == "$EXPECTED" ]] || { printf 'STATUS=BUILD_SOURCE_SHA_MISMATCH\nEXPECTED=%s\nHEAD=%s\n' "$EXPECTED" "$HEAD"; exit 54; }

git -C "$REPO" fetch origin main >/dev/null 2>&1 || { echo 'STATUS=BUILD_LEASE_FETCH_FAILED'; exit 55; }
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
git -C "$REPO" merge-base --is-ancestor "$EXPECTED" "$REMOTE" || { echo 'STATUS=BUILD_LEASE_TARGET_NOT_IN_MAIN_HISTORY'; exit 56; }

printf 'STATUS=BUILD_LEASE_ACQUIRED\nCHECKOUT=%s\nBUILD_SOURCE_SHA=%s\nLOCKFILE=%s\nCOMMAND=%s\n' "$REPO" "$HEAD" "$LOCKFILE" "$1"
cd "$REPO"
exec "$@"
