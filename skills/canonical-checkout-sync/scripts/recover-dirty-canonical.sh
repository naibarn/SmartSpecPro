#!/usr/bin/env bash
set -euo pipefail

REPO="${1:-${CODEX_CANONICAL_CHECKOUT:-}}"
[[ -n "$REPO" ]] || { echo 'STATUS=CANONICAL_CHECKOUT_REQUIRED'; exit 2; }
EXPECTED="${2:-${CODEX_VALIDATED_MAIN_SHA:-}}"
STATE_ROOT="${CODEX_SYNC_STATE_DIR:-$HOME/.codex/state/canonical-checkout-sync}"
NOW="$(date -u +%Y%m%dT%H%M%SZ)"

fail() {
  printf 'STATUS=%s\n' "$1"
  shift || true
  if (($#)); then printf 'DETAIL=%s\n' "$*"; fi
  exit 60
}

[[ -d "$REPO" ]] || fail CANONICAL_CHECKOUT_MISSING "$REPO"
git -C "$REPO" rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail CANONICAL_CHECKOUT_NOT_GIT "$REPO"

COMMON="$(git -C "$REPO" rev-parse --git-common-dir)"
case "$COMMON" in /*) ;; *) COMMON="$REPO/$COMMON";; esac
mkdir -p "$COMMON/codex-resource-locks" "$STATE_ROOT/recovery"
LOCKFILE="$COMMON/codex-resource-locks/canonical-promotion.lock"
exec 9>"$LOCKFILE"
flock -n 9 || fail CANONICAL_SYNC_BUSY "another canonical sync/build/recovery lease is active: $LOCKFILE"

BRANCH="$(git -C "$REPO" symbolic-ref --quiet --short HEAD || true)"
[[ "$BRANCH" == "main" ]] || fail CANONICAL_SYNC_BLOCKED_WRONG_BRANCH "branch=${BRANCH:-DETACHED}"

git -C "$REPO" fetch origin main >/dev/null 2>&1 || fail FETCH_FAILED "git fetch origin main"
LOCAL="$(git -C "$REPO" rev-parse HEAD)"
REMOTE="$(git -C "$REPO" rev-parse origin/main)"
TARGET="${EXPECTED:-$REMOTE}"
git -C "$REPO" cat-file -e "${TARGET}^{commit}" 2>/dev/null || fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "target_not_found=$TARGET"
if [[ -n "$EXPECTED" ]] && ! git -C "$REPO" merge-base --is-ancestor "$TARGET" "$REMOTE"; then
  fail CANONICAL_SYNC_BLOCKED_VALIDATED_SHA_MISMATCH "validated_target=$TARGET is_not_in_current_origin_main_history=$REMOTE"
fi

STATUS="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"
if [[ -z "$STATUS" ]]; then
  printf 'STATUS=CANONICAL_DIRTY_RECOVERY_NOT_NEEDED\nCHECKOUT=%s\nLOCAL_HEAD=%s\nTARGET_SHA=%s\n' "$REPO" "$LOCAL" "$TARGET"
  exit 0
fi

RID="canonical-dirty-${NOW}-$(git -C "$REPO" rev-parse --short=10 HEAD)"
RECOVERY_DIR="$STATE_ROOT/recovery/$RID"
RESCUE_WT="$STATE_ROOT/recovery-worktrees/$RID"
RESCUE_BRANCH="codex/canonical-dirty-rescue-${NOW}-$(git -C "$REPO" rev-parse --short=10 HEAD)-$$"
mkdir -p "$RECOVERY_DIR" "$(dirname "$RESCUE_WT")"
chmod 700 "$RECOVERY_DIR" || true

printf '%s\n' "$STATUS" > "$RECOVERY_DIR/status-before.txt"
git -C "$REPO" diff --binary HEAD > "$RECOVERY_DIR/tracked.patch"
git -C "$REPO" diff --name-status HEAD > "$RECOVERY_DIR/tracked-name-status.txt"
git -C "$REPO" ls-files --others --exclude-standard -z > "$RECOVERY_DIR/untracked.zlist"

# Credential-like dirty paths are preserved locally but never auto-committed or pushed.
# Scan both tracked and untracked local delta paths. Examples/templates are not treated as secrets.
is_sensitive_path() {
  local p="$1" base
  base="$(basename "$p")"
  case "$base" in
    .env) return 0 ;;
    .env.example|.env.sample|.env.template|.env.defaults) return 1 ;;
    .env.*) return 0 ;;
    *.pem|*.key|id_rsa|id_ed25519|credentials.json|secrets.json|secret.json|tokens.json|token.json|.npmrc|.pypirc|.netrc) return 0 ;;
    *) return 1 ;;
  esac
}

SENSITIVE_LIST="$RECOVERY_DIR/sensitive-dirty-paths.txt"
: > "$SENSITIVE_LIST"
while IFS= read -r -d '' p; do
  if is_sensitive_path "$p"; then printf '%s\n' "$p" >> "$SENSITIVE_LIST"; fi
done < <(git -C "$REPO" diff --name-only -z HEAD; git -C "$REPO" ls-files --others --exclude-standard -z)
sort -u -o "$SENSITIVE_LIST" "$SENSITIVE_LIST"

if [[ -s "$SENSITIVE_LIST" ]]; then
  mkdir -p "$RECOVERY_DIR/sensitive-files"
  while IFS= read -r p; do
    [[ -e "$REPO/$p" ]] || continue
    dest="$RECOVERY_DIR/sensitive-files/$p"
    mkdir -p "$(dirname "$dest")"
    cp -a "$REPO/$p" "$dest"
    # chmod follows symlinks on common hosts; keep symlinks untouched and rely
    # on the mode-700 recovery directory to restrict access to the preserved link.
    if [[ ! -L "$dest" ]]; then
      chmod go-rwx "$dest" 2>/dev/null || true
    fi
  done < "$SENSITIVE_LIST"
  printf 'STATUS=CANONICAL_DIRTY_RECOVERY_BLOCKED_SENSITIVE_LOCAL_FILE\n'
  printf 'CHECKOUT=%s\nRECOVERY_DIR=%s\n' "$REPO" "$RECOVERY_DIR"
  printf '%s\n' '---SENSITIVE_DIRTY_PATHS---'
  cat "$SENSITIVE_LIST"
  printf '%s\n' 'PRESERVED=Credential-like files were copied locally to the recovery directory where present; nothing was removed, committed, or pushed.'
  printf '%s\n' 'NEXT_ACTION=Explicitly move/ignore/sanitize these runtime-local files, then rerun canonical-checkout-sync.'
  exit 61
fi

# Build a durable rescue branch in an isolated temporary worktree from the exact dirty checkout base.
git -C "$REPO" worktree add -b "$RESCUE_BRANCH" "$RESCUE_WT" "$LOCAL" >/dev/null 2>&1 || fail CANONICAL_DIRTY_RESCUE_FAILED "unable to create rescue worktree"
cleanup_wt() {
  if [[ -d "$RESCUE_WT" ]]; then
    git -C "$REPO" worktree remove "$RESCUE_WT" >/dev/null 2>&1 || true
  fi
}
trap cleanup_wt EXIT

if [[ -s "$RECOVERY_DIR/tracked.patch" ]]; then
  git -C "$RESCUE_WT" apply --binary --index "$RECOVERY_DIR/tracked.patch" || fail CANONICAL_DIRTY_RESCUE_FAILED "unable to apply tracked patch to rescue worktree"
fi

while IFS= read -r -d '' p; do
  [[ -e "$REPO/$p" ]] || continue
  dest="$RESCUE_WT/$p"
  mkdir -p "$(dirname "$dest")"
  cp -a "$REPO/$p" "$dest"
done < "$RECOVERY_DIR/untracked.zlist"

git -C "$RESCUE_WT" add -A
if git -C "$RESCUE_WT" diff --cached --quiet; then
  fail CANONICAL_DIRTY_RESCUE_FAILED "dirty checkout produced no rescuable delta"
fi

{
  printf 'canonical_checkout=%s\n' "$REPO"
  printf 'source_head=%s\n' "$LOCAL"
  printf 'target_sha=%s\n' "$TARGET"
  printf 'origin_main_observed=%s\n' "$REMOTE"
  printf 'rescue_branch=%s\n' "$RESCUE_BRANCH"
  printf 'timestamp_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$RECOVERY_DIR/manifest.env"

git -C "$RESCUE_WT" commit -m "chore(recovery): preserve canonical dirty checkout before sync" \
  -m "Canonical-Source-Head: $LOCAL" \
  -m "Canonical-Target-SHA: $TARGET" >/dev/null
RESCUE_SHA="$(git -C "$RESCUE_WT" rev-parse HEAD)"
git -C "$RESCUE_WT" push -u origin "$RESCUE_BRANCH" >/dev/null 2>&1 || fail CANONICAL_DIRTY_RESCUE_PUSH_FAILED "branch=$RESCUE_BRANCH sha=$RESCUE_SHA"
git -C "$RESCUE_WT" fetch origin "$RESCUE_BRANCH" >/dev/null 2>&1 || fail CANONICAL_DIRTY_RESCUE_PUSH_FAILED "unable to verify remote rescue branch"
REMOTE_RESCUE="$(git -C "$RESCUE_WT" rev-parse "origin/$RESCUE_BRANCH")"
[[ "$REMOTE_RESCUE" == "$RESCUE_SHA" ]] || fail CANONICAL_DIRTY_RESCUE_PUSH_FAILED "local=$RESCUE_SHA remote=$REMOTE_RESCUE"

# Do not clean paths that changed while the rescue branch was being committed
# or pushed. The remote branch preserves the original snapshot; a mismatch
# means newer work exists and must remain in the canonical checkout.
git -C "$REPO" diff --binary HEAD | cmp - "$RECOVERY_DIR/tracked.patch" \
  || fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "tracked changes changed after snapshot; rescue=$RESCUE_BRANCH@$RESCUE_SHA; canonical checkout left untouched"
git -C "$REPO" ls-files --others --exclude-standard -z | cmp - "$RECOVERY_DIR/untracked.zlist" \
  || fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "untracked paths changed after snapshot; rescue=$RESCUE_BRANCH@$RESCUE_SHA; canonical checkout left untouched"

while IFS= read -r -d '' p; do
  source_path="$REPO/$p"
  rescued_path="$RESCUE_WT/$p"
  if [[ -L "$source_path" || -L "$rescued_path" ]]; then
    [[ -L "$source_path" && -L "$rescued_path" ]] \
      && cmp -s <(readlink -- "$source_path") <(readlink -- "$rescued_path") \
      || fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "untracked symlink changed after snapshot: $p; rescue=$RESCUE_BRANCH@$RESCUE_SHA; canonical checkout left untouched"
  elif [[ -f "$source_path" && -f "$rescued_path" ]]; then
    cmp -s -- "$source_path" "$rescued_path" \
      && [[ "$(stat -c '%a' -- "$source_path")" == "$(stat -c '%a' -- "$rescued_path")" ]] \
      || fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "untracked file changed after snapshot: $p; rescue=$RESCUE_BRANCH@$RESCUE_SHA; canonical checkout left untouched"
  else
    fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "untracked path changed type or disappeared after snapshot: $p; rescue=$RESCUE_BRANCH@$RESCUE_SHA; canonical checkout left untouched"
  fi
done < "$RECOVERY_DIR/untracked.zlist"

# Controlled cleanup is allowed only after the rescue branch has been pushed and verified.
# Restore tracked paths exactly to current HEAD.
mapfile -d '' TRACKED_PATHS < <(git -C "$REPO" diff --name-only -z HEAD)
if ((${#TRACKED_PATHS[@]})); then
  git -C "$REPO" restore --source=HEAD --staged --worktree -- "${TRACKED_PATHS[@]}"
fi

# Remove only the exact untracked files that were copied into the verified rescue branch.
while IFS= read -r -d '' p; do
  [[ -e "$REPO/$p" ]] || continue
  rm -f -- "$REPO/$p"
done < "$RECOVERY_DIR/untracked.zlist"

AFTER="$(git -C "$REPO" status --porcelain=v1 --untracked-files=all)"
if [[ -n "$AFTER" ]]; then
  printf '%s\n' "$AFTER" > "$RECOVERY_DIR/status-after-failed-cleanup.txt"
  fail CANONICAL_DIRTY_RECOVERY_INCOMPLETE "rescue succeeded but canonical checkout is still dirty; see $RECOVERY_DIR/status-after-failed-cleanup.txt"
fi

trap - EXIT
cleanup_wt

printf 'STATUS=CANONICAL_DIRTY_AUTO_RECOVERED\n'
printf 'CHECKOUT=%s\n' "$REPO"
printf 'SOURCE_HEAD=%s\n' "$LOCAL"
printf 'TARGET_SHA=%s\n' "$TARGET"
printf 'RESCUE_BRANCH=%s\n' "$RESCUE_BRANCH"
printf 'RESCUE_SHA=%s\n' "$RESCUE_SHA"
printf 'RECOVERY_DIR=%s\n' "$RECOVERY_DIR"
printf 'WORKING_TREE=CLEAN\n'
printf 'NEXT_ACTION=Run canonical-sync-preflight.sh, then sync-canonical-main.sh for the same target SHA.\n'
