#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-/home/dev/projects/SmartSpecPro}}"
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"
STATE_ROOT="${CODEX_SYNC_STATE_DIR:-$HOME/.codex/state/canonical-checkout-sync}"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"

fail() {
  printf 'STATUS=%s\n' "$1"
  shift || true
  if (($#)); then printf 'DETAIL=%s\n' "$*"; fi
  exit 70
}

is_sensitive_path() {
  local p="$1" base
  base="$(basename "$p")"
  case "$base" in
    .env) return 0 ;;
    .env.example|.env.sample|.env.template|.env.defaults|*.example|*.sample|*.template|*.defaults) return 1 ;;
    .env.*) return 0 ;;
    *.pem|*.key|id_rsa|id_ed25519|credentials.json|secrets.json|secret.json|tokens.json|token.json|.npmrc|.pypirc|.netrc) return 0 ;;
    *) return 1 ;;
  esac
}

[[ -d "$REPO" ]] || fail CANONICAL_CHECKOUT_MISSING "$REPO"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail CANONICAL_CHECKOUT_NOT_GIT "$REPO"

COMMON="$(git -C "$REPO" rev-parse --git-common-dir)"
case "$COMMON" in /*) ;; *) COMMON="$REPO/$COMMON";; esac
mkdir -p "$COMMON/codex-resource-locks" "$STATE_ROOT/history-rescue"
LOCKFILE="$COMMON/codex-resource-locks/canonical-promotion.lock"
exec 9>"$LOCKFILE"
flock -n 9 || fail CANONICAL_SYNC_BUSY "another canonical sync/build/recovery lease is active: $LOCKFILE"

BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
[[ "$BRANCH" == "main" ]] || fail CANONICAL_SYNC_BLOCKED_WRONG_BRANCH "branch=${BRANCH:-DETACHED}"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_SYNC_BLOCKED_DIRTY "run dirty recovery first"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "git fetch origin main"
LOCAL="$(git -C "$REPO" rev-parse HEAD)"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
TARGET="${EXPECTED:-$REMOTE}"
git -C "$REPO" cat-file -e "${TARGET}^{commit}" 2>/dev/null || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target_not_found=$TARGET"
git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE" || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target=$TARGET not_in_origin_main_history=$REMOTE"

if [[ "$LOCAL" == "$TARGET" ]]; then
  printf 'STATUS=CANONICAL_REALIGN_NOT_NEEDED\nCHECKOUT=%s\nTARGET_SHA=%s\n' "$REPO" "$TARGET"
  exit 0
fi
if git -C "$REPO" merge-base --is-ancestor "$LOCAL" "$TARGET"; then
  printf 'STATUS=CANONICAL_REALIGN_NOT_NEEDED_FAST_FORWARD_AVAILABLE\nCHECKOUT=%s\nLOCAL_HEAD=%s\nTARGET_SHA=%s\nNEXT_ACTION=Run sync-canonical-main.sh.\n' "$REPO" "$LOCAL" "$TARGET"
  exit 0
fi

UNIQUE_LIST="$STATE_ROOT/history-rescue/local-only-${NOW}-$(git -C "$REPO" rev-parse --short=10 HEAD).txt"
git -C "$REPO" rev-list --reverse "$TARGET..$LOCAL" > "$UNIQUE_LIST"
UNIQUE_COUNT="$(wc -l < "$UNIQUE_LIST" | tr -d ' ')"
[[ "$UNIQUE_COUNT" -gt 0 ]] || fail CANONICAL_REALIGN_UNEXPECTED_RELATION "local=$LOCAL target=$TARGET"

# Prevent accidentally pushing local-only commits that touch credential-like paths.
SENSITIVE_HISTORY="$UNIQUE_LIST.sensitive-paths"
: > "$SENSITIVE_HISTORY"
while IFS= read -r p; do
  [[ -n "$p" ]] || continue
  if is_sensitive_path "$p"; then printf '%s\n' "$p" >> "$SENSITIVE_HISTORY"; fi
done < <(git -C "$REPO" log --format= --name-only "$TARGET..$LOCAL" | sed '/^$/d' | sort -u)
if [[ -s "$SENSITIVE_HISTORY" ]]; then
  printf 'STATUS=CANONICAL_REALIGN_BLOCKED_SENSITIVE_LOCAL_HISTORY\n'
  printf 'CHECKOUT=%s\nLOCAL_HEAD=%s\nTARGET_SHA=%s\nLOCAL_ONLY_COMMITS=%s\n' "$REPO" "$LOCAL" "$TARGET" "$UNIQUE_COUNT"
  printf '%s\n' '---SENSITIVE_PATHS_IN_LOCAL_ONLY_HISTORY---'
  cat "$SENSITIVE_HISTORY"
  printf 'PRESERVED=Local commits remain untouched on local main; no remote rescue push and no realignment occurred.\n'
  printf 'NEXT_ACTION=Review the listed credential-like paths and explicitly sanitize/preserve the local-only history before rerunning canonical-checkout-sync.\n'
  exit 71
fi

SHORT="$(git -C "$REPO" rev-parse --short=10 "$LOCAL")"
RESCUE_BRANCH="codex/canonical-history-rescue-${NOW}-${SHORT}-$$"
MANIFEST="$STATE_ROOT/history-rescue/${NOW}-${SHORT}.env"
{
  printf 'canonical_checkout=%s\n' "$REPO"
  printf 'source_head=%s\n' "$LOCAL"
  printf 'target_sha=%s\n' "$TARGET"
  printf 'origin_main_observed=%s\n' "$REMOTE"
  printf 'local_only_commit_count=%s\n' "$UNIQUE_COUNT"
  printf 'rescue_branch=%s\n' "$RESCUE_BRANCH"
  printf 'timestamp_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$MANIFEST"

# Create a durable remote pointer to the exact pre-realignment local history.
git -C "$REPO" branch "$RESCUE_BRANCH" "$LOCAL" >/dev/null 2>&1 || fail CANONICAL_HISTORY_RESCUE_FAILED "unable to create $RESCUE_BRANCH"
if ! git -C "$REPO" push -u origin "$RESCUE_BRANCH" >/dev/null 2>&1; then
  fail CANONICAL_HISTORY_RESCUE_PUSH_FAILED "branch=$RESCUE_BRANCH local_head=$LOCAL"
fi
git -C "$REPO" fetch origin "$RESCUE_BRANCH" >/dev/null 2>&1 || fail CANONICAL_HISTORY_RESCUE_PUSH_FAILED "unable to verify remote rescue branch"
REMOTE_RESCUE="$(git -C "$REPO" rev-parse "origin/$RESCUE_BRANCH")"
[[ "$REMOTE_RESCUE" == "$LOCAL" ]] || fail CANONICAL_HISTORY_RESCUE_PUSH_FAILED "local=$LOCAL remote_rescue=$REMOTE_RESCUE"

# Re-fetch immediately before pointer mutation. Never realign to a target that fell out of main history.
git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "final fetch before realignment"
REMOTE_AFTER="$(git -C "$REPO" rev-parse origin/main)"
git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE_AFTER" || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target=$TARGET no_longer_in_origin_main_history=$REMOTE_AFTER"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_SYNC_BLOCKED_DIRTY "checkout changed after rescue verification"
[[ "$(git -C "$REPO" rev-parse HEAD)" == "$LOCAL" ]] || fail CANONICAL_REALIGN_RACE "canonical HEAD moved after rescue verification"

# Safe realignment without blind reset: detach at target, atomically move refs/heads/main
# only if it still points at the exact rescued LOCAL SHA, then reattach main.
if ! git -C "$REPO" checkout --detach "$TARGET" >/dev/null 2>&1; then
  fail CANONICAL_REALIGN_FAILED "unable to detach at target=$TARGET"
fi
if ! git -C "$REPO" update-ref refs/heads/main "$TARGET" "$LOCAL"; then
  git -C "$REPO" checkout main >/dev/null 2>&1 || true
  fail CANONICAL_REALIGN_RACE "refs/heads/main changed unexpectedly; remote rescue is verified at $RESCUE_BRANCH"
fi
if ! git -C "$REPO" checkout main >/dev/null 2>&1; then
  fail CANONICAL_REALIGN_FAILED "main pointer moved to target but checkout main failed; rescue=$RESCUE_BRANCH"
fi

NEW_HEAD="$(git -C "$REPO" rev-parse HEAD)"
[[ "$NEW_HEAD" == "$TARGET" ]] || fail CANONICAL_REALIGN_FAILED "head=$NEW_HEAD target=$TARGET"
[[ -z "$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)" ]] || fail CANONICAL_REALIGN_FAILED "working tree not clean after realignment"

printf 'STATUS=CANONICAL_MAIN_REALIGNED\n'
printf 'CHECKOUT=%s\nSOURCE_HEAD=%s\nTARGET_SHA=%s\nLOCAL_ONLY_COMMITS=%s\n' "$REPO" "$LOCAL" "$TARGET" "$UNIQUE_COUNT"
printf 'RESCUE_BRANCH=%s\nRESCUE_SHA=%s\nRESCUE_REMOTE_VERIFIED=yes\n' "$RESCUE_BRANCH" "$REMOTE_RESCUE"
printf 'MANIFEST=%s\nWORKING_TREE=CLEAN\n' "$MANIFEST"
printf 'NEXT_ACTION=Run sync/verify for the same validated target; the top-level prepare-canonical-checkout.sh continues automatically.\n'
