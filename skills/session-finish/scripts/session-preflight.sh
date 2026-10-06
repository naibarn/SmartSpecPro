#!/usr/bin/env bash
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not inside a git worktree" >&2; exit 2; }
root="$(git rev-parse --show-toplevel)"
common="$(git rev-parse --git-common-dir)"
source "$root/scripts/development-lifecycle/resolve-policy.sh"
lifecycle_load_repository_policy "$root"
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo DETACHED)"
head_sha="$(git rev-parse HEAD)"
canonical_sha="$(git fetch "$LIFECYCLE_REMOTE" "$LIFECYCLE_CANONICAL_REF" >/dev/null 2>&1 && git rev-parse FETCH_HEAD || echo MISSING)"
mem_available_mb="$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo UNKNOWN)"
workspace_authority="$(python3 "$root/scripts/development-lifecycle/workspace_authority.py" resolve --repository "$root")"

printf 'repo_root=%s\n' "$root"
printf 'git_common_dir=%s\n' "$common"
printf 'worktree=%s\n' "$root"
printf 'branch=%s\n' "$branch"
printf 'head=%s\n' "$head_sha"
printf 'repository_id=%s\n' "$LIFECYCLE_REPOSITORY_ID"
printf 'canonical_ref=%s\n' "$LIFECYCLE_CANONICAL_REF"
printf 'canonical_sha=%s\n' "$canonical_sha"
printf 'workspace_authority=%s\n' "$workspace_authority"
printf 'mem_available_mb=%s\n' "$mem_available_mb"
echo '--- status --porcelain ---'
git status --porcelain=v1
