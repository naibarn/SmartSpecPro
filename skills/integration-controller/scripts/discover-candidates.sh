#!/usr/bin/env bash
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not in git worktree" >&2; exit 2; }
# Refresh refs for inventory only. Never prune candidates before their work is
# proven canonicalized or durably preserved.
git fetch --all >/dev/null 2>&1 || { echo "ERROR: fetch failed" >&2; exit 3; }
root="$(git rev-parse --show-toplevel)"
source "$root/scripts/development-lifecycle/resolve-policy.sh"
lifecycle_load_repository_policy "$root"
git fetch "$LIFECYCLE_REMOTE" "$LIFECYCLE_CANONICAL_REF" >/dev/null 2>&1 || { echo "ERROR: configured canonical ref fetch failed" >&2; exit 3; }
current_canonical="$(git rev-parse FETCH_HEAD)"
canonical_branch="${LIFECYCLE_CANONICAL_REF#refs/heads/}"
local_canonical_ref="refs/heads/$canonical_branch"
remote_canonical_ref="refs/remotes/$LIFECYCLE_REMOTE/$canonical_branch"
printf 'record_type\tref\ttip\tcanonical_relation\tahead_commits\tbehind_commits\tchanged_paths\tmarker_status\ttask\tdeferred_checks\tworktree_state\tworktree_paths\tdirty_paths\tcandidate_action\n'
printf 'META\t%s\t%s\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\n' "$LIFECYCLE_CANONICAL_REF" "$current_canonical"

format_dirty_paths() {
  local status_output="$1"
  local line path result=""
  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    path="${line:3}"
    path="${path//%/%25}"
    path="${path//;/%3B}"
    [[ -n "$result" ]] && result+=";"
    result+="$path"
  done <<< "$status_output"
  printf '%s' "$result"
}

# Include remote task branches and local-only branches. Readiness-marker trailers
# are optional historical evidence; their absence never removes a candidate.
mapfile -t refs < <(
  git for-each-ref --format='%(refname)' refs/heads refs/remotes |
    while IFS= read -r ref; do
      case "$ref" in
        "$local_canonical_ref"|"$remote_canonical_ref"|refs/remotes/*/HEAD) continue ;;
        *) printf '%s\n' "$ref" ;;
      esac
    done | sort -u
)

# Worktree state is independent of branch refs. Collect it once and reuse it
# below; rescanning every worktree for every ref is quadratic.
declare -A WORKTREE_STATUS_BY_PATH=()
declare -A WORKTREE_DIRTY_PATHS_BY_PATH=()
declare -A BRANCH_WORKTREE_STATE=()
declare -A BRANCH_WORKTREE_PATHS=()
declare -A BRANCH_WORKTREE_DIRTY_PATHS=()
mapfile -t worktree_lines < <(git worktree list --porcelain)
wt_path=""; wt_branch=""
record_worktree() {
  [[ -n "$wt_path" ]] || return 0
  local wt_status wt_state wt_dirty_paths existing_state branch_key
  if wt_status="$(git -C "$wt_path" status --porcelain=v1 --untracked-files=all 2>/dev/null)"; then
    if [[ -n "$wt_status" ]]; then
      wt_state=DIRTY
      wt_dirty_paths="$(format_dirty_paths "$wt_status")"
    else
      wt_state=CLEAN
      wt_dirty_paths=""
    fi
  else
    wt_state=UNAVAILABLE
    wt_dirty_paths=""
  fi
  WORKTREE_STATUS_BY_PATH["$wt_path"]="$wt_state"
  WORKTREE_DIRTY_PATHS_BY_PATH["$wt_path"]="$wt_dirty_paths"
  if [[ "$wt_branch" == refs/heads/* ]]; then
    branch_key="$wt_branch"
    existing_state="${BRANCH_WORKTREE_STATE[$branch_key]:-NONE}"
    if [[ "$wt_state" == DIRTY || "$existing_state" == DIRTY ]]; then
      BRANCH_WORKTREE_STATE["$branch_key"]=DIRTY
    elif [[ "$wt_state" == UNAVAILABLE || "$existing_state" == UNAVAILABLE ]]; then
      BRANCH_WORKTREE_STATE["$branch_key"]=UNAVAILABLE
    else
      BRANCH_WORKTREE_STATE["$branch_key"]=CLEAN
    fi
    BRANCH_WORKTREE_PATHS["$branch_key"]="${BRANCH_WORKTREE_PATHS[$branch_key]:+${BRANCH_WORKTREE_PATHS[$branch_key]};}$wt_path"
    if [[ -n "$wt_dirty_paths" ]]; then
      BRANCH_WORKTREE_DIRTY_PATHS["$branch_key"]="${BRANCH_WORKTREE_DIRTY_PATHS[$branch_key]:+${BRANCH_WORKTREE_DIRTY_PATHS[$branch_key]};}$wt_dirty_paths"
    fi
  fi
}
for line in "${worktree_lines[@]}"; do
  case "$line" in
    "worktree "*) record_worktree; wt_path="${line#worktree }"; wt_branch="" ;;
    "branch "*) wt_branch="${line#branch }" ;;
    "") record_worktree; wt_path=""; wt_branch="" ;;
  esac
done
record_worktree

for ref in "${refs[@]}"; do
  [[ -n "$ref" ]] || continue
  branch="${ref#refs/heads/}"
  branch="${branch#refs/remotes/$LIFECYCLE_REMOTE/}"
  tip="$(git rev-parse "$ref")"
  body="$(git log -1 --format=%B "$tip")"
  trailer() { printf '%s\n' "$body" | sed -n "s/^$1:[[:space:]]*//p" | tail -1; }
  marker_status="$(trailer 'Codex-Session-Status')"
  task="$(trailer 'Codex-Task')"
  deferred="$(trailer 'Codex-Deferred-Checks')"

  if git merge-base --is-ancestor "$tip" "$current_canonical" 2>/dev/null; then
    relation=ALREADY_CANONICAL
  elif git merge-base --is-ancestor "$current_canonical" "$tip" 2>/dev/null; then
    relation=AHEAD_OF_CANONICAL
  else
    relation=DIVERGED_FROM_CANONICAL
  fi
  ahead="$(git rev-list --count "$current_canonical..$tip" 2>/dev/null || echo UNKNOWN)"
  behind="$(git rev-list --count "$tip..$current_canonical" 2>/dev/null || echo UNKNOWN)"
  if git merge-base "$current_canonical" "$tip" >/dev/null 2>&1; then
    changed_paths="$(git diff --name-only "$current_canonical...$tip" 2>/dev/null | wc -l | tr -d ' ')"
  else
    changed_paths=UNKNOWN
  fi

  worktree_state="${BRANCH_WORKTREE_STATE[refs/heads/$branch]:-NONE}"
  worktree_paths="${BRANCH_WORKTREE_PATHS[refs/heads/$branch]:-}"
  dirty_paths="${BRANCH_WORKTREE_DIRTY_PATHS[refs/heads/$branch]:-}"

  case "$branch" in
    *rescue*|*quarantine*) action=REVIEW_RESCUE_OR_QUARANTINE ;;
    *)
      if [[ "$worktree_state" == "UNAVAILABLE" ]]; then
        action=OWNER_AND_PATH_UNAVAILABLE
      elif [[ "$relation" != "ALREADY_CANONICAL" && "$changed_paths" == "0" && "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_DIRTY_THEN_CLASSIFY_BRANCH_DELTA
      elif [[ "$relation" != "ALREADY_CANONICAL" && "$changed_paths" == "0" ]]; then
        action=DUPLICATE_OR_SUPERSEDED
      elif [[ "$relation" == "ALREADY_CANONICAL" && "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_AND_CHECKPOINT_DIRTY_REMAINDER
      elif [[ "$relation" == "ALREADY_CANONICAL" ]]; then
        action=ALREADY_CANONICAL
      elif [[ "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_DIRTY_THEN_SPLIT_SAFE_CHECKPOINT
      else
        action=REVIEW_FAST_GATE_AND_INTEGRATE
      fi
      ;;
  esac

  for var in ref branch marker_status task deferred worktree_paths dirty_paths; do
    val="${!var//$'\t'/ }"; val="${val//$'\n'/ }"; printf -v "$var" '%s' "$val"
  done
  printf 'BRANCH\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$ref" "$tip" "$relation" "$ahead" "$behind" "$changed_paths" "${marker_status:-NONE}" "${task:-UNKNOWN}" "${deferred:-NONE}" "$worktree_state" "$worktree_paths" "$dirty_paths" "$action"
done

# Report every worktree separately, including detached and non-Codex worktrees
# that cannot be associated with a branch candidate. Reuse the cached status
# so each worktree receives exactly one status query.
wt_path=""; wt_head=""; wt_branch="DETACHED"
print_worktree() {
  [[ -n "$wt_path" ]] || return 0
  local wt_state wt_dirty_paths action
  wt_state="${WORKTREE_STATUS_BY_PATH[$wt_path]:-UNAVAILABLE}"
  wt_dirty_paths="${WORKTREE_DIRTY_PATHS_BY_PATH[$wt_path]:-}"
  action=CLASSIFY_BEFORE_CLEANUP
  [[ "$wt_state" == DIRTY ]] && action=PRESERVE_AND_CLASSIFY
  [[ "$wt_state" == UNAVAILABLE ]] && action=OWNER_AND_PATH_UNAVAILABLE
  printf 'WORKTREE\t%s\t%s\t%s\t-\t-\t-\t-\t-\t-\t%s\t%s\t%s\t%s\n' \
    "$wt_path" "$wt_head" "$wt_branch" "$wt_state" "$wt_path" "$wt_dirty_paths" "$action"
}
for line in "${worktree_lines[@]}"; do
  case "$line" in
    "worktree "*)
      print_worktree
      wt_path="${line#worktree }"
      wt_head=""
      wt_branch="DETACHED"
      ;;
    "HEAD "*) wt_head="${line#HEAD }" ;;
    "branch "*) wt_branch="${line#branch }" ;;
    "")
      print_worktree
      wt_path=""
      ;;
  esac
done
print_worktree
