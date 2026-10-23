#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_PROFILE="$ROOT/python-backend/spec224-admission/.venv/bin/python"

if [ ! -x "$PYTHON_PROFILE" ]; then
  echo "SPEC224_ADMISSION_PYTHON_PROFILE_MISSING" >&2
  exit 2
fi

export SPEC224_CI_REPO_ROOT="$ROOT"
export RUN_DB_INTEGRATION_TESTS=true

# This test begins from an empty, separately provisioned PostgreSQL 15.17
# cluster and applies only the exact 0395 enum migration under test.
python3 "$ROOT/scripts/spec224_certification/run_disposable_postgres.py" -- \
  bash -lc '
    cd "$SPEC224_CI_REPO_ROOT/apps/web"
    corepack pnpm exec vitest run \
      server/services/__tests__/spec224Targeted0395Postgres.integration.test.ts
  '

# The second disposable cluster receives the existing SPEC-224 fresh baseline.
# Node and Python DB suites then share that isolated DB; the Python recovery test
# starts the actual Node process for its cross-language advisory-lock case.
python3 "$ROOT/scripts/spec224_certification/run_disposable_postgres.py" -- \
  bash -lc '
    cd "$SPEC224_CI_REPO_ROOT/apps/web"
    SPEC224_BASELINE_DATABASE_URL="$DATABASE_URL" corepack pnpm exec drizzle-kit migrate --config=drizzle.spec224-baseline.config.ts
    corepack pnpm exec vitest run \
      server/services/__tests__/spec224DisposablePostgres.test.ts \
      server/services/__tests__/spec224RecoveryGrantBindingPostgres.integration.test.ts
    cd "$SPEC224_CI_REPO_ROOT/python-backend"
    DEBUG=false PYTHONPATH=. "$SPEC224_CI_REPO_ROOT/python-backend/spec224-admission/.venv/bin/python" -m pytest -c /dev/null --rootdir=. --confcutdir=tests/integration -p no:cacheprovider -q \
      tests/integration/test_spec224_approval_postgres.py \
      tests/integration/test_spec224_recovery_grant_postgres.py
  '
