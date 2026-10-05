#!/usr/bin/env bash
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not in git worktree" >&2; exit 2; }
# Refresh refs for inventory only. Never prune candidates before their work is
# proven canonicalized or durably preserved.
git fetch --all >/dev/null 2>&1 || { echo "ERROR: fetch failed" >&2; exit 3; }

current_main="$(git rev-parse origin/main)"
printf 'record_type\tref\ttip\tmain_relation\tahead_commits\tbehind_commits\tchanged_paths\tmarker_status\ttask\tdeferred_checks\tworktree_state\tworktree_paths\tcandidate_action\n'
printf 'META\torigin/main\t%s\t-\t-\t-\t-\t-\t-\t-\t-\t-\t-\n' "$current_main"

# Include remote task branches and local-only branches. Readiness-marker trailers
# are optional historical evidence; their absence never removes a candidate.
mapfile -t refs < <(
  git for-each-ref --format='%(refname)' refs/heads refs/remotes/origin |
    while IFS= read -r ref; do
      case "$ref" in
        refs/heads/main|refs/heads/master|refs/remotes/origin/HEAD|refs/remotes/origin/main|refs/remotes/origin/master) continue ;;
        *) printf '%s\n' "$ref" ;;
      esac
    done | sort -u
)

for ref in "${refs[@]}"; do
  [[ -n "$ref" ]] || continue
  branch="${ref#refs/heads/}"
  branch="${branch#refs/remotes/origin/}"
  tip="$(git rev-parse "$ref")"
  body="$(git log -1 --format=%B "$tip")"
  trailer() { printf '%s\n' "$body" | sed -n "s/^$1:[[:space:]]*//p" | tail -1; }
  marker_status="$(trailer 'Codex-Session-Status')"
  task="$(trailer 'Codex-Task')"
  deferred="$(trailer 'Codex-Deferred-Checks')"

  if git merge-base --is-ancestor "$tip" "$current_main" 2>/dev/null; then
    relation=ALREADY_IN_MAIN
  elif git merge-base --is-ancestor "$current_main" "$tip" 2>/dev/null; then
    relation=AHEAD_OF_MAIN
  else
    relation=DIVERGED_FROM_MAIN
  fi
  ahead="$(git rev-list --count "$current_main..$tip" 2>/dev/null || echo UNKNOWN)"
  behind="$(git rev-list --count "$tip..$current_main" 2>/dev/null || echo UNKNOWN)"
  if git merge-base "$current_main" "$tip" >/dev/null 2>&1; then
    changed_paths="$(git diff --name-only "$current_main...$tip" 2>/dev/null | wc -l | tr -d ' ')"
  else
    changed_paths=UNKNOWN
  fi

  worktree_state=NONE
  worktree_paths=""
  wt_path=""; wt_branch=""
  flush_wt() {
    if [[ -n "$wt_path" && "$wt_branch" == "refs/heads/$branch" ]]; then
      if [[ -n "$(git -C "$wt_path" status --porcelain=v1 --untracked-files=all 2>/dev/null || true)" ]]; then
        worktree_state=DIRTY
      elif [[ "$worktree_state" != "DIRTY" ]]; then
        worktree_state=CLEAN
      fi
      if [[ -z "$worktree_paths" ]]; then worktree_paths="$wt_path"; else worktree_paths="$worktree_paths;$wt_path"; fi
    fi
  }
  while IFS= read -r line; do
    case "$line" in
      "worktree "*) flush_wt; wt_path="${line#worktree }"; wt_branch="" ;;
      "branch "*) wt_branch="${line#branch }" ;;
      "") flush_wt; wt_path=""; wt_branch="" ;;
    esac
  done < <(git worktree list --porcelain; echo)

  case "$branch" in
    *rescue*|*quarantine*) action=REVIEW_RESCUE_OR_QUARANTINE ;;
    *)
      if [[ "$relation" != "ALREADY_IN_MAIN" && "$changed_paths" == "0" && "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_DIRTY_THEN_CLASSIFY_BRANCH_DELTA
      elif [[ "$relation" != "ALREADY_IN_MAIN" && "$changed_paths" == "0" ]]; then
        action=DUPLICATE_OR_SUPERSEDED
      elif [[ "$relation" == "ALREADY_IN_MAIN" && "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_AND_CHECKPOINT_DIRTY_REMAINDER
      elif [[ "$relation" == "ALREADY_IN_MAIN" ]]; then
        action=ALREADY_CANONICAL
      elif [[ "$worktree_state" == "DIRTY" ]]; then
        action=PRESERVE_DIRTY_THEN_SPLIT_SAFE_CHECKPOINT
      else
        action=REVIEW_FAST_GATE_AND_INTEGRATE
      fi
      ;;
  esac

  for var in ref branch marker_status task deferred worktree_paths; do
    val="${!var//$'\t'/ }"; val="${val//$'\n'/ }"; printf -v "$var" '%s' "$val"
  done
  printf 'BRANCH\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$ref" "$tip" "$relation" "$ahead" "$behind" "$changed_paths" "${marker_status:-NONE}" "${task:-UNKNOWN}" "${deferred:-NONE}" "$worktree_state" "$worktree_paths" "$action"
done

# Report every worktree separately, including detached and non-Codex worktrees
# that cannot be associated with a branch candidate above.
while IFS= read -r line; do
  case "$line" in
    "worktree "*)
      wt_path="${line#worktree }"
      wt_head=""
      wt_branch="DETACHED"
      ;;
    "HEAD "*) wt_head="${line#HEAD }" ;;
    "branch "*) wt_branch="${line#branch }" ;;
    "")
      [[ -n "$wt_path" ]] || continue
      if [[ -n "$(git -C "$wt_path" status --porcelain=v1 --untracked-files=all 2>/dev/null || true)" ]]; then
        wt_state=DIRTY
      else
        wt_state=CLEAN
      fi
      printf 'WORKTREE\t%s\t%s\t%s\t-\t-\t-\t-\t-\t-\t%s\t%s\t%s\n' \
        "$wt_path" "$wt_head" "$wt_branch" "$wt_state" "$wt_path" \
        "$([[ "$wt_state" == DIRTY ]] && echo PRESERVE_AND_CLASSIFY || echo CLASSIFY_BEFORE_CLEANUP)"
      wt_path=""
      ;;
  esac
done < <(git worktree list --porcelain; echo)
