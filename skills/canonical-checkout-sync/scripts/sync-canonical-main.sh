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

if [[ -n "$EXPECTED" ]] && ! git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE"; then
  fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "validated_target=$TARGET is_not_in_current_origin_main_history=$REMOTE"
fi

if [[ "$LOCAL" != "$TARGET" ]]; then
  if git -C "$REPO" merge-base --is-ancestor "$LOCAL" "$TARGET"; then
    git -C "$REPO" merge --ff-only "$TARGET" >/dev/null || fail CANONICAL_SYNC_FAILED "ff-only merge to target failed"
  elif git -C "$REPO" merge-base --is-ancestor "$TARGET" "$LOCAL"; then
    fail CANONICAL_SYNC_BLOCKED_TARGET_BEHIND_LOCAL "local=$LOCAL target=$TARGET"
  else
    fail CANONICAL_SYNC_BLOCKED_DIVERGED "local=$LOCAL target=$TARGET"
  fi
fi

NEW_HEAD="$(git -C "$REPO" rev-parse HEAD)"
[[ "$NEW_HEAD" == "$TARGET" ]] || fail CANONICAL_SYNC_FAILED "head=$NEW_HEAD target=$TARGET"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_SYNC_BLOCKED_DIRTY "checkout became dirty after sync"

# Detect remote rewrite/movement after sync without chasing it.
git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "final fetch"
REMOTE_AFTER="$(git -C "$REPO" rev-parse origin/main)"
if [[ -z "$EXPECTED" ]]; then
  # When no explicit validated SHA was supplied, this invocation promised the then-current latest main.
  [[ "$REMOTE_AFTER" == "$TARGET" ]] || fail CANONICAL_SYNC_RETRY_REMOTE_MOVED "target=$TARGET origin_main_now=$REMOTE_AFTER"
else
  # A frozen validated target may legitimately be older than a newly advanced main, but it must remain in main history.
  git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE_AFTER" || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target=$TARGET no_longer_in_origin_main_history=$REMOTE_AFTER"
fi

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
  printf 'sync=FAST_FORWARD_ONLY_TO_TARGET\n'
  printf 'lockfile=%s\n' "$LOCKFILE"
  printf 'timestamp_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$EVIDENCE"

printf 'STATUS=CANONICAL_CHECKOUT_READY\n'
printf 'CHECKOUT=%s\n' "$REPO"
printf 'TARGET_SHA=%s\n' "$TARGET"
printf 'LOCAL_HEAD=%s\n' "$NEW_HEAD"
printf 'ORIGIN_MAIN=%s\n' "$REMOTE_AFTER"
printf 'REMOTE_AHEAD_OF_TARGET=%s\n' "$REMOTE_AHEAD_OF_TARGET"
printf 'WORKING_TREE=CLEAN\n'
printf 'SYNC=FAST_FORWARD_ONLY_TO_TARGET\n'
printf 'LOCKFILE=%s\n' "$LOCKFILE"
printf 'EVIDENCE=%s\n' "$EVIDENCE"
