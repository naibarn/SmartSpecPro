#!/usr/bin/env bash
set -euo pipefail

# Fail closed if a future change reintroduces an executable Agency,
# OpenSandbox, or sandbox-dispatch boundary. Historical migrations and docs
# are intentionally outside these checks.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_root"

failures=0
check_absent() {
  local pattern="$1"
  shift
  if rg -n --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/*.md' \
    --glob '!**/*.json' --glob '!**/*.js' "$pattern" "$@" >/dev/null 2>&1; then
    printf 'FAIL: retired runtime reference found: %s\n' "$pattern" >&2
    rg -n --glob '!**/*.test.*' --glob '!**/__tests__/**' --glob '!**/*.md' \
      --glob '!**/*.json' --glob '!**/*.js' "$pattern" "$@" >&2 || true
    failures=$((failures + 1))
  fi
}

check_absent '(^|[[:space:]"'"'"'(:])agency[_-]swarm([[:space:]"'"'"'"'"'"'(:]|$)' \
  apps/web/server apps/web/client/src apps/web/shared python-backend/app apps/tauri-shell/src-tauri
check_absent 'docker-compose\.opensandbox|opensandbox-network|smartspec-opensandbox|opensandbox\.service|/opt/opensandbox' \
  systemd docker scripts config
check_absent 'app\.integrations\.opensandbox|sandbox_dispatcher|sandbox_job_worker|sandbox_jobs' \
  apps/web/server python-backend/app
check_absent 'app\.use\([[:space:]]*["'"'"']/v1/agencies|createPublicAgencyRouter' \
  apps/web/server

if (( failures > 0 )); then
  printf 'Retired runtime reference audit: FAILED (%d check(s))\n' "$failures" >&2
  exit 1
fi

printf '%s\n' 'Retired runtime reference audit: PASS.'
