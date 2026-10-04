#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"
STATE_DIR="${CODEX_SYNC_STATE_DIR:-$HOME/.codex/state/canonical-checkout-sync}"

fail() {
  printf 'STATUS=%s\n' "$1"
  shift || true
  if (($#)); then printf 'DETAIL=%s\n' "$*"; fi
  exit 30
}

[[ -d "$REPO" ]] || fail CANONICAL_CHECKOUT_MISSING "$REPO"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail CANONICAL_CHECKOUT_NOT_GIT "$REPO"

COMMON="$(git -C "$REPO" rev-parse --git-common-dir)"
case "$COMMON" in /*) ;; *) COMMON="$REPO/$COMMON";; esac
mkdir -p "$COMMON/codex-resource-locks"
LOCKFILE="$COMMON/codex-resource-locks/canonical-promotion.lock"
exec 9>"$LOCKFILE"
flock -n 9 || fail CANONICAL_SYNC_BUSY "another canonical sync/build lease is active: $LOCKFILE"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "initial fetch"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
TARGET="${EXPECTED:-$REMOTE}"
BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
LOCAL="$(git -C "$REPO" rev-parse HEAD)"

[[ "$BRANCH" == "main" ]] || fail CANONICAL_SYNC_BLOCKED_WRONG_BRANCH "branch=${BRANCH:-DETACHED}"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_SYNC_BLOCKED_DIRTY "$REPO"
git -C "$REPO" cat-file -e "${TARGET}^{commit}" 2>/dev/null || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target_not_found=$TARGET"
git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE" || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target=$TARGET not_in_origin_main_history=$REMOTE"

if [[ "$LOCAL" != "$TARGET" ]]; then
  if git -C "$REPO" merge-base --is-ancestor "$LOCAL" "$TARGET"; then
    git -C "$REPO" merge --ff-only "$TARGET" >/dev/null || fail CANONICAL_SYNC_FAILED "ff-only merge to target failed"
  elif git -C "$REPO" merge-base --is-ancestor "$TARGET" "$LOCAL"; then
    printf 'STATUS=CANONICAL_SYNC_NEEDS_SAFE_REALIGN_AHEAD\nLOCAL_HEAD=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run preserve-and-realign-canonical.sh or top-level prepare-canonical-checkout.sh.\n' "$LOCAL" "$TARGET"
    exit 32
  else
    printf 'STATUS=CANONICAL_SYNC_NEEDS_SAFE_REALIGN_DIVERGED\nLOCAL_HEAD=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run preserve-and-realign-canonical.sh or top-level prepare-canonical-checkout.sh.\n' "$LOCAL" "$TARGET"
    exit 33
  fi
fi

NEW_HEAD="$(git -C "$REPO" rev-parse HEAD)"
[[ "$NEW_HEAD" == "$TARGET" ]] || fail CANONICAL_SYNC_FAILED "head=$NEW_HEAD target=$TARGET"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_SYNC_BLOCKED_DIRTY "checkout became dirty after sync"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "final fetch"
REMOTE_AFTER="$(git -C "$REPO" rev-parse origin/main)"
git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE_AFTER" || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target=$TARGET no_longer_in_origin_main_history=$REMOTE_AFTER"

mkdir -p "$STATE_DIR"
SAFE_NAME="$(basename "$REPO" | tr -cs 'A-Za-z0-9._-' '_')"
EVIDENCE="$STATE_DIR/${SAFE_NAME}.ready"
REMOTE_AHEAD_OF_TARGET="$(git -C "$REPO" rev-list --count "$TARGET..$REMOTE_AFTER" 2>/dev/null || echo UNKNOWN)"
{
  printf 'status=CANONICAL_CHECKOUT_READY\n'
  printf 'checkout=%s\n' "$REPO"
  printf 'target_sha=%s\n' "$TARGET"
  printf 'local_head=%s\n' "$NEW_HEAD"
  printf 'origin_main_observed=%s\n' "$REMOTE_AFTER"
  printf 'remote_ahead_of_target=%s\n' "$REMOTE_AHEAD_OF_TARGET"
  printf 'working_tree=CLEAN\n'
  printf 'sync=EXACT_VALIDATED_TARGET\n'
  printf 'lockfile=%s\n' "$LOCKFILE"
  printf 'timestamp_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$EVIDENCE"

printf 'STATUS=CANONICAL_CHECKOUT_READY\n'
printf 'CHECKOUT=%s\nTARGET_SHA=%s\nLOCAL_HEAD=%s\nORIGIN_MAIN=%s\n' "$REPO" "$TARGET" "$NEW_HEAD" "$REMOTE_AFTER"
printf 'REMOTE_AHEAD_OF_TARGET=%s\nWORKING_TREE=CLEAN\nSYNC=EXACT_VALIDATED_TARGET\n' "$REMOTE_AHEAD_OF_TARGET"
printf 'LOCKFILE=%s\nEVIDENCE=%s\n' "$LOCKFILE" "$EVIDENCE"
