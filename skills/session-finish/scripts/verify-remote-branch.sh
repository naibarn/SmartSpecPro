#!/usr/bin/env bash
set -euo pipefail

branch="${1:-$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)}"
[[ -n "$branch" ]] || { echo "ERROR: branch argument required for detached HEAD" >&2; exit 2; }
case "$branch" in main|master) echo "ERROR: refusing shared branch $branch" >&2; exit 2;; esac

git fetch origin "$branch" main >/dev/null 2>&1 || { echo "ERROR: unable to fetch origin/$branch and origin/main" >&2; exit 3; }
remote_sha="$(git rev-parse "origin/$branch")"
main_sha="$(git rev-parse origin/main)"

# If this worktree is actually on the requested branch, prove its committed tip
# is remote-durable. Do not require legacy readiness-marker trailers.
current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ "$current_branch" == "$branch" ]]; then
  local_sha="$(git rev-parse HEAD)"
  [[ "$local_sha" == "$remote_sha" ]] || { echo "ERROR: local/remote SHA mismatch local=$local_sha remote=$remote_sha" >&2; exit 4; }
fi

if git merge-base --is-ancestor "$remote_sha" "$main_sha" 2>/dev/null; then
  relation=ALREADY_IN_MAIN
elif git merge-base --is-ancestor "$main_sha" "$remote_sha" 2>/dev/null; then
  relation=AHEAD_OF_MAIN
else
  relation=DIVERGED_FROM_MAIN
fi

ahead="$(git rev-list --count "$main_sha..$remote_sha" 2>/dev/null || echo UNKNOWN)"
behind="$(git rev-list --count "$remote_sha..$main_sha" 2>/dev/null || echo UNKNOWN)"
echo "REMOTE_BRANCH_DURABLE branch=$branch tip=$remote_sha main=$main_sha relation=$relation ahead=$ahead behind=$behind"
