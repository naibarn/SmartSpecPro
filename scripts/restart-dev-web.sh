#!/usr/bin/env bash
set -euo pipefail
REPOSITORY_ROOT="$(git -C "${1:-.}" rev-parse --show-toplevel)"
cd "${REPOSITORY_ROOT}"
mapfile -t SOURCE_POLICY < <(python3 - <<'PY'
import tomllib
from pathlib import Path
p = tomllib.loads(Path('.development-repository.toml').read_text())['repository']
print(p['remote'])
print(p['canonical_ref'])
PY
)
REMOTE="${SOURCE_POLICY[0]}"
CANONICAL_REF="${SOURCE_POLICY[1]}"
CANONICAL_BRANCH="${CANONICAL_REF#refs/heads/}"
git fetch --no-tags "${REMOTE}" "${CANONICAL_REF}:refs/remotes/${REMOTE}/${CANONICAL_BRANCH}"
if [[ "$(git branch --show-current)" == "${CANONICAL_BRANCH}" && -z "$(git status --porcelain)" ]]; then
  git merge --ff-only "refs/remotes/${REMOTE}/${CANONICAL_BRANCH}"
else
  echo "[dev:web] Preserving edited/non-canonical checkout; dev will serve its recorded revision."
fi
DEPENDENCY_RECEIPT="${XDG_CACHE_HOME:-$HOME/.cache}/smartspec-dev/dependencies.sha256"
LOCK_DIGEST="$(sha256sum pnpm-lock.yaml | cut -d ' ' -f 1)"
if [[ ! -f "${DEPENDENCY_RECEIPT}" || "$(cat "${DEPENDENCY_RECEIPT}")" != "${LOCK_DIGEST}" ]]; then
  echo "[dev:web] Synchronizing web workspace dependencies with the canonical lockfile..."
  pnpm install --filter @smartspec/web... --frozen-lockfile --prefer-offline
  mkdir -p "$(dirname "${DEPENDENCY_RECEIPT}")"
  printf '%s\n' "${LOCK_DIGEST}" >"${DEPENDENCY_RECEIPT}"
fi
systemctl --user restart smartspec-dev-web.service
for attempt in {1..60}; do
  if curl --max-time 1 --silent --fail http://127.0.0.1:3100/healthz >/dev/null && curl --max-time 1 --silent --fail http://127.0.0.1:8100/health/ready >/dev/null; then
    STATUS="$(curl --max-time 5 --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3100/trpc/infrastructure.getSpec224DatabaseDiagnostics)"
    if [[ "${STATUS}" != 401 && "${STATUS}" != 403 ]]; then
      echo "[dev:web] Diagnostics procedure/guard check failed: HTTP ${STATUS}" >&2
      exit 1
    fi
    echo "[dev:web] Healthy; diagnostics guard HTTP ${STATUS}; checkout $(git rev-parse HEAD)."
    exit 0
  fi
  sleep 1
done
echo "[dev:web] Startup failed; inspect journalctl --user -u smartspec-dev-web.service." >&2
exit 1
