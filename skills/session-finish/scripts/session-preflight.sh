#!/usr/bin/env bash
set -euo pipefail

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not inside a git worktree" >&2; exit 2; }
root="$(git rev-parse --show-toplevel)"
common="$(git rev-parse --git-common-dir)"
branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || echo DETACHED)"
head_sha="$(git rev-parse HEAD)"
origin_main="$(git rev-parse origin/main 2>/dev/null || echo MISSING)"
mem_available_mb="$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo UNKNOWN)"

printf 'repo_root=%s\n' "$root"
printf 'git_common_dir=%s\n' "$common"
printf 'worktree=%s\n' "$root"
printf 'branch=%s\n' "$branch"
printf 'head=%s\n' "$head_sha"
printf 'origin_main=%s\n' "$origin_main"
printf 'mem_available_mb=%s\n' "$mem_available_mb"
echo '--- status --porcelain ---'
git status --porcelain=v1
