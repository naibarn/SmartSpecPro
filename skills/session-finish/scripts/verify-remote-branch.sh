#!/usr/bin/env bash
set -euo pipefail

branch="${1:-$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)}"
[[ -n "$branch" ]] || { echo "ERROR: branch argument required for detached HEAD" >&2; exit 2; }
root="$(git rev-parse --show-toplevel)"
source "$root/scripts/development-lifecycle/resolve-policy.sh"
lifecycle_load_repository_policy "$root"
canonical_branch="${LIFECYCLE_CANONICAL_REF#refs/heads/}"
[[ "$branch" != "$canonical_branch" ]] || { echo "ERROR: refusing configured canonical branch $branch" >&2; exit 2; }

git fetch "$LIFECYCLE_REMOTE" "$branch" >/dev/null 2>&1 || { echo "ERROR: unable to fetch task ref $LIFECYCLE_REMOTE/$branch" >&2; exit 3; }
remote_sha="$(git rev-parse FETCH_HEAD)"
git fetch "$LIFECYCLE_REMOTE" "$LIFECYCLE_CANONICAL_REF" >/dev/null 2>&1 || { echo "ERROR: unable to fetch configured canonical ref" >&2; exit 3; }
canonical_sha="$(git rev-parse FETCH_HEAD)"

# If this worktree is actually on the requested branch, prove its committed tip
# is remote-durable. Do not require legacy readiness-marker trailers.
current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [[ "$current_branch" == "$branch" ]]; then
  local_sha="$(git rev-parse HEAD)"
  [[ "$local_sha" == "$remote_sha" ]] || { echo "ERROR: local/remote SHA mismatch local=$local_sha remote=$remote_sha" >&2; exit 4; }
fi

if git merge-base --is-ancestor "$remote_sha" "$canonical_sha" 2>/dev/null; then
  relation=ALREADY_CANONICAL
elif git merge-base --is-ancestor "$canonical_sha" "$remote_sha" 2>/dev/null; then
  relation=AHEAD_OF_CANONICAL
else
  relation=DIVERGED_FROM_CANONICAL
fi

ahead="$(git rev-list --count "$canonical_sha..$remote_sha" 2>/dev/null || echo UNKNOWN)"
behind="$(git rev-list --count "$remote_sha..$canonical_sha" 2>/dev/null || echo UNKNOWN)"
echo "REMOTE_BRANCH_DURABLE branch=$branch tip=$remote_sha canonical_ref=$LIFECYCLE_CANONICAL_REF canonical_sha=$canonical_sha relation=$relation ahead=$ahead behind=$behind"
