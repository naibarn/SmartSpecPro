#!/usr/bin/env bash
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not in git worktree" >&2; exit 2; }
git fetch --all --prune >/dev/null 2>&1 || { echo "ERROR: fetch failed" >&2; exit 3; }

current_main="$(git rev-parse origin/main)"
printf 'branch\ttip\tready\tstatus\tverified_main\tverification\tlane\tscope\tskipped\tbaseline_issues\tdeferred_checks\timplementation_tip\ttask\tmarker_valid\tbaseline_relation\timplementation_in_main\tworktree_state\tworktree_paths\n'
while IFS= read -r ref; do
  branch="${ref#refs/remotes/origin/}"
  case "$branch" in
    HEAD|main|codex/integration-controller-*) continue ;;
    codex/*) ;;
    *) continue ;;
  esac

  tip="$(git rev-parse "$ref")"
  body="$(git log -1 --format=%B "$tip")"
  trailer() { printf '%s\n' "$body" | sed -n "s/^$1:[[:space:]]*//p" | tail -1; }
  status="$(trailer 'Codex-Session-Status')"
  verified="$(trailer 'Codex-Verified-Origin-Main')"
  verification="$(trailer 'Codex-Verification')"
  lane="$(trailer 'Codex-Verification-Lane')"
  scope="$(trailer 'Codex-Verification-Scope')"
  skipped="$(trailer 'Codex-Verification-Skipped')"
  baseline="$(trailer 'Codex-Baseline-Issues')"
  deferred="$(trailer 'Codex-Deferred-Checks')"
  impl="$(trailer 'Codex-Implementation-Tip')"
  task="$(trailer 'Codex-Task')"
  marker_branch="$(trailer 'Codex-Session-Branch')"

  ready=no
  marker_valid=no

  case "$status:$verification:$lane" in
    READY_FOR_INTEGRATION:PASS_SCOPED:FAST|READY_FOR_INTEGRATION:PASS_SCOPED:TARGETED)
      [[ -n "$verified" && -n "$impl" ]] && ready=yes ;;
    READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES:PASS_SCOPED_WITH_BASELINE_ISSUES:FAST|READY_FOR_INTEGRATION_WITH_BASELINE_ISSUES:PASS_SCOPED_WITH_BASELINE_ISSUES:TARGETED)
      [[ -n "$verified" && -n "$impl" && -n "$baseline" && "$baseline" != "NONE" ]] && ready=yes ;;
    READY_FOR_HEAVY_VERIFICATION:SCOPED_PASS_HEAVY_PENDING:HEAVY_PENDING)
      [[ -n "$verified" && -n "$impl" && -n "$deferred" && "$deferred" != "NONE" ]] && ready=heavy ;;
  esac

  if [[ "$ready" != "no" && -n "$marker_branch" && "$marker_branch" == "$branch" ]] \
     && git cat-file -e "${verified}^{commit}" 2>/dev/null \
     && git cat-file -e "${impl}^{commit}" 2>/dev/null; then
    parent="$(git rev-parse "${tip}^" 2>/dev/null || true)"
    if [[ "$parent" == "$impl" ]] && git merge-base --is-ancestor "$verified" "$impl" 2>/dev/null; then
      marker_count="$(git log --format='%H' --grep='^Codex-Session-Status:' "$tip" | wc -l | tr -d ' ')"
      if [[ "$marker_count" -eq 1 ]]; then
        marker_valid=yes
      fi
    fi
  fi

  baseline_relation=UNKNOWN
  implementation_in_main=UNKNOWN
  if [[ -n "$verified" ]] && git cat-file -e "${verified}^{commit}" 2>/dev/null; then
    if git merge-base --is-ancestor "$verified" "$current_main" 2>/dev/null; then
      baseline_relation=IN_CURRENT_MAIN_HISTORY
    else
      baseline_relation=NOT_IN_CURRENT_MAIN_HISTORY
      marker_valid=no
    fi
  fi
  if [[ -n "$impl" ]] && git cat-file -e "${impl}^{commit}" 2>/dev/null; then
    if git merge-base --is-ancestor "$impl" "$current_main" 2>/dev/null; then
      implementation_in_main=yes
    else
      implementation_in_main=no
    fi
  fi

  if [[ "$marker_valid" != "yes" ]]; then
    ready=invalid
  fi

  # Associate only worktrees actually attached to the local session branch.
  worktree_state=NONE
  worktree_paths=""
  wt_path=""
  wt_branch=""
  flush_wt() {
    if [[ -n "$wt_path" && "$wt_branch" == "refs/heads/$branch" ]]; then
      if [[ -n "$(git -C "$wt_path" status --porcelain=v1 2>/dev/null || true)" ]]; then
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

  if [[ "$implementation_in_main" == "yes" && "$marker_valid" == "yes" && "$worktree_state" == "DIRTY" ]]; then
    ready=already_dirty
  elif [[ "$implementation_in_main" == "yes" && "$marker_valid" == "yes" ]]; then
    ready=already
  elif [[ "$worktree_state" == "DIRTY" && "$marker_valid" == "yes" ]]; then
    ready=active_dirty
  fi

  for var in lane scope skipped baseline deferred task worktree_paths; do
    val="${!var//$'\t'/ }"; val="${val//$'\n'/ }"; printf -v "$var" '%s' "$val"
  done
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "$branch" "$tip" "$ready" "$status" "$verified" "$verification" "$lane" "$scope" "$skipped" "$baseline" "$deferred" "$impl" "$task" "$marker_valid" "$baseline_relation" "$implementation_in_main" "$worktree_state" "$worktree_paths"
done < <(git for-each-ref --format='%(refname)' 'refs/remotes/origin/codex/*' | sort)
