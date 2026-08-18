#!/usr/bin/env bash
set -euo pipefail

# Feature 151 Section 06: Agency Swarm is migration/read-only compatibility
# only.  Historical schemas, migration helpers, and tests may still mention
# the old name, but the executable boundaries must remain fail-closed.

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failures=0
check_required() {
  local pattern="$1"
  local path="$2"
  local description="$3"
  if ! rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "$pattern" "$path" >/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    failures=$((failures + 1))
  fi
}

check_absent() {
  local pattern="$1"
  local path="$2"
  local description="$3"
  if rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "$pattern" "$path" >/dev/null; then
    printf 'FAIL: %s\n' "$description" >&2
    rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' "$pattern" "$path" >&2 || true
    failures=$((failures + 1))
  fi
}

# The canonical dependency profile must not reinstall the retired package.
check_absent '(^|[[:space:]])agency[-_]swarm([<=>[:space:]]|$)' \
  python-backend/requirements.txt \
  'python-backend/requirements.txt still enables the retired Agency package'

# New execution must be blocked at every authoritative boundary.
check_required 'assertAgencyExecutionFrozen' \
  apps/web/server/services/agencyBridge.ts \
  'Node Agency bridge is missing its fail-closed execution guard'
check_required 'Depends\(require_agency_feature\)' \
  python-backend/app/api/agencies.py \
  'Python Agency API is missing its retired-feature dependency guard'
check_required 'agency_swarm_retired' \
  python-backend/app/services/agency_swarm_adapter.py \
  'Agency adapter is not marked as a retired compatibility shim'

# A new desktop run must never route to the historical runtime enum.  Keep the
# enum itself readable for old records and migration tooling.
check_absent 'selectedRuntime[[:space:]]*=[[:space:]]*[\"]agency_swarm[\"]' \
  apps/web/server/services/desktopRunRouter.ts \
  'desktop router still selects Agency Swarm for a new run'

if (( failures > 0 )); then
  printf 'Agency Swarm active-reference audit: FAILED (%d check(s))\n' "$failures" >&2
  exit 1
fi

printf '%s\n' 'Agency Swarm active-reference audit: PASS (execution boundaries fail closed; historical references remain migration-only).'
