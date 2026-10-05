#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"
REQUIRED_INTEGRATED="${3:-${CODEX_REQUIRED_INTEGRATED_SHA:-}}"

fail() {
  printf 'STATUS=%s\n' "$1"
  shift || true
  if (($#)); then printf 'DETAIL=%s\n' "$*"; fi
  exit "${CODEX_PREFLIGHT_EXIT_CODE:-20}"
}

[[ -d "$REPO" ]] || fail CANONICAL_CHECKOUT_MISSING "$REPO"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail CANONICAL_CHECKOUT_NOT_GIT "$REPO"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "git fetch origin main"

BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
LOCAL="$(git -C "$REPO" rev-parse HEAD)"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
TARGET="${EXPECTED:-$REMOTE}"
STATUS="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"

[[ "$BRANCH" == "main" ]] || { printf 'STATUS=CANONICAL_SYNC_BLOCKED_WRONG_BRANCH\nBRANCH=%s\nNEXT_ACTION=Return the canonical checkout to branch main without discarding local work, then rerun canonical-checkout-sync.\n' "${BRANCH:-DETACHED}"; exit 20; }
git -C "$REPO" cat-file -e "${TARGET}^{commit}" 2>/dev/null || { printf 'STATUS=CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH\nTARGET_SHA=%s\nNEXT_ACTION=Provide a validated integration SHA that exists locally and is reachable from current origin/main.\n' "$TARGET"; exit 20; }

if ! git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE"; then
  printf 'STATUS=CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH\nTARGET_SHA=%s\nORIGIN_MAIN=%s\nNEXT_ACTION=Re-run integration-controller or select a validated SHA that is still in current origin/main history.\n' "$TARGET" "$REMOTE"
  exit 20
fi

if [[ -n "$REQUIRED_INTEGRATED" ]]; then
  git -C "$REPO" cat-file -e "${REQUIRED_INTEGRATED}^{commit}" 2>/dev/null || {
    printf 'STATUS=CANONICAL_TARGET_MISSING_REQUIRED_CHANGE\nREQUIRED_INTEGRATED_SHA=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run integration-controller and pass the resulting integrated main commit SHA.\n' "$REQUIRED_INTEGRATED" "$TARGET"
    exit 24
  }
  if ! git -C "$REPO" merge-base --is-ancestor "$REQUIRED_INTEGRATED" "$TARGET"; then
    printf 'STATUS=CANONICAL_TARGET_MISSING_REQUIRED_CHANGE\nREQUIRED_INTEGRATED_SHA=%s\nTARGET_SHA=%s\nNEXT_ACTION=Return to integration-controller; do not build this target for the requested change.\n' "$REQUIRED_INTEGRATED" "$TARGET"
    exit 24
  fi
fi

if [[ -n "$STATUS" ]]; then
  printf 'STATUS=CANONICAL_SYNC_NEEDS_DIRTY_RECOVERY\n'
  printf 'CHECKOUT=%s\nLOCAL_HEAD=%s\nORIGIN_MAIN=%s\nTARGET_SHA=%s\n' "$REPO" "$LOCAL" "$REMOTE" "$TARGET"
  printf '%s\n' '---DIRTY_PATHS---'
  printf '%s\n' "$STATUS"
  printf 'NEXT_ACTION=Run bundled recover-dirty-canonical.sh, then rerun preflight. The top-level prepare-canonical-checkout.sh does this automatically.\n'
  exit 21
fi

BEHIND="$(git -C "$REPO" rev-list --count "$LOCAL..$TARGET")"
AHEAD="$(git -C "$REPO" rev-list --count "$TARGET..$LOCAL")"
REMOTE_AHEAD_OF_TARGET="$(git -C "$REPO" rev-list --count "$TARGET..$REMOTE" 2>/dev/null || echo UNKNOWN)"

if [[ "$LOCAL" == "$TARGET" ]]; then
  RELATION=AT_TARGET
  RESULT=CANONICAL_PREFLIGHT_OK
  RC=0
elif git -C "$REPO" merge-base --is-ancestor "$LOCAL" "$TARGET"; then
  RELATION=FAST_FORWARD_AVAILABLE
  RESULT=CANONICAL_PREFLIGHT_OK
  RC=0
elif git -C "$REPO" merge-base --is-ancestor "$TARGET" "$LOCAL"; then
  RELATION=LOCAL_AHEAD_OF_TARGET
  RESULT=CANONICAL_SYNC_NEEDS_SAFE_REALIGN_AHEAD
  RC=22
else
  RELATION=DIVERGED
  RESULT=CANONICAL_SYNC_NEEDS_SAFE_REALIGN_DIVERGED
  RC=23
fi

printf 'STATUS=%s\n' "$RESULT"
printf 'CHECKOUT=%s\nBRANCH=%s\nLOCAL_HEAD=%s\nORIGIN_MAIN=%s\nTARGET_SHA=%s\n' "$REPO" "$BRANCH" "$LOCAL" "$REMOTE" "$TARGET"
printf 'TARGET_SOURCE=%s\n' "$([[ -n "$EXPECTED" ]] && echo VALIDATED_INPUT || echo FROZEN_ORIGIN_MAIN)"
printf 'RELATION=%s\nAHEAD=%s\nBEHIND=%s\nREMOTE_AHEAD_OF_TARGET=%s\nWORKING_TREE=CLEAN\n' "$RELATION" "$AHEAD" "$BEHIND" "$REMOTE_AHEAD_OF_TARGET"
case "$RESULT" in
  CANONICAL_SYNC_NEEDS_SAFE_REALIGN_*)
    printf 'NEXT_ACTION=Preserve local-only history to a verified remote rescue branch, then realign local main to the validated target. The top-level prepare-canonical-checkout.sh does this automatically.\n'
    ;;
esac
exit "$RC"
