#!/usr/bin/env bash
set -euo pipefail

[[ $# -eq 1 ]] || { echo "usage: $0 <expected-canonical-sha>" >&2; exit 2; }
root="$(git rev-parse --show-toplevel)"
source "$root/scripts/development-lifecycle/resolve-policy.sh"
lifecycle_load_repository_policy "$root"
git fetch "$LIFECYCLE_REMOTE" "$LIFECYCLE_CANONICAL_REF" >/dev/null 2>&1 || { echo "ERROR: configured canonical ref fetch failed" >&2; exit 3; }
actual="$(git rev-parse FETCH_HEAD)"
if [[ "$actual" != "$1" ]]; then
  echo "CANONICAL_REF_MOVED expected=$1 actual=$actual ref=$LIFECYCLE_CANONICAL_REF" >&2
  exit 4
fi
echo "CANONICAL_BASELINE_OK $actual"
