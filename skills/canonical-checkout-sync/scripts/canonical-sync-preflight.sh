#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"

fail() {
  printf 'STATUS=%s\n' "$1"
  shift || true
  if (($#)); then printf 'DETAIL=%s\n' "$*"; fi
  exit 20
}

[[ -d "$REPO" ]] || fail CANONICAL_CHECKOUT_MISSING "$REPO"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail CANONICAL_CHECKOUT_NOT_GIT "$REPO"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "git fetch origin main"

BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
LOCAL="$(git -C "$REPO" rev-parse HEAD)"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
TARGET="${EXPECTED:-$REMOTE}"
STATUS="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"

[[ "$BRANCH" == "main" ]] || fail CANONICAL_SYNC_BLOCKED_WRONG_BRANCH "branch=${BRANCH:-DETACHED}"
git -C "$REPO" cat-file -e "${TARGET}^{commit}" 2>/dev/null || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target_not_found=$TARGET"

if [[ -n "$EXPECTED" ]] && ! git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE"; then
  fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "validated_target=$TARGET is_not_in_current_origin_main_history=$REMOTE"
fi

if [[ -n "$STATUS" ]]; then
  printf 'STATUS=CANONICAL_SYNC_BLOCKED_DIRTY\n'
  printf 'CHECKOUT=%s\n' "$REPO"
  printf 'LOCAL_HEAD=%s\n' "$LOCAL"
  printf 'ORIGIN_MAIN=%s\n' "$REMOTE"
  printf 'TARGET_SHA=%s\n' "$TARGET"
  printf '%s\n' '---DIRTY_PATHS---'
  printf '%s\n' "$STATUS"
  printf 'NEXT_ACTION=Run bundled recover-dirty-canonical.sh for this checkout and target SHA; do not clean/reset manually.\n'
  exit 21
fi

RELATION=""
if [[ "$LOCAL" == "$TARGET" ]]; then
  RELATION=AT_TARGET
elif git -C "$REPO" merge-base --is-ancestor "$LOCAL" "$TARGET"; then
  RELATION=FAST_FORWARD_AVAILABLE
elif git -C "$REPO" merge-base --is-ancestor "$TARGET" "$LOCAL"; then
  fail CANONICAL_SYNC_BLOCKED_TARGET_BEHIND_LOCAL "local=$LOCAL target=$TARGET"
else
  fail CANONICAL_SYNC_BLOCKED_DIVERGED "local=$LOCAL target=$TARGET"
fi

BEHIND="$(git -C "$REPO" rev-list --count "$LOCAL..$TARGET")"
AHEAD="$(git -C "$REPO" rev-list --count "$TARGET..$LOCAL")"
REMOTE_AHEAD_OF_TARGET="$(git -C "$REPO" rev-list --count "$TARGET..$REMOTE" 2>/dev/null || echo UNKNOWN)"

printf 'STATUS=CANONICAL_PREFLIGHT_OK\n'
printf 'CHECKOUT=%s\n' "$REPO"
printf 'BRANCH=%s\n' "$BRANCH"
printf 'LOCAL_HEAD=%s\n' "$LOCAL"
printf 'ORIGIN_MAIN=%s\n' "$REMOTE"
printf 'TARGET_SHA=%s\n' "$TARGET"
printf 'TARGET_SOURCE=%s\n' "$([[ -n "$EXPECTED" ]] && echo VALIDATED_INPUT || echo INFERRED_ORIGIN_MAIN)"
printf 'RELATION=%s\n' "$RELATION"
printf 'AHEAD=%s\n' "$AHEAD"
printf 'BEHIND=%s\n' "$BEHIND"
printf 'REMOTE_AHEAD_OF_TARGET=%s\n' "$REMOTE_AHEAD_OF_TARGET"
printf 'WORKING_TREE=CLEAN\n'
