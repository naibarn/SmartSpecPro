#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

PYTHON=${PYTHON:-python3}
VENV_DIR="${VENV_DIR:-$ROOT/.venv-ci}"

if [ ! -d "$VENV_DIR" ]; then
  "$PYTHON" -m venv "$VENV_DIR"
fi

# shellcheck disable=SC1091
source "$VENV_DIR/bin/activate"

python -m pip install --upgrade pip

# Install runtime deps first (smartspec autopilot)
if [ -f "$ROOT/.smartspec/requirements.txt" ]; then
  python -m pip install -r "$ROOT/.smartspec/requirements.txt"
fi

# Install backend deps (includes sqlalchemy, etc.)
python -m pip install -r "$ROOT/python-backend/requirements.txt"

echo "[PY] python-backend tests (coverage gate via pytest.ini/.coveragerc)..."
pushd "$ROOT/python-backend" >/dev/null
PYTHONPATH="." pytest
popd >/dev/null

echo "[PY] root tests (.smartspec runtime/validators)..."
pushd "$ROOT" >/dev/null

# By default, skip integration/e2e tests that require running services.
# Enable by setting RUN_INTEGRATION_TESTS=1
if [ "${RUN_INTEGRATION_TESTS:-0}" = "1" ]; then
  PYTHONPATH="$ROOT" pytest -q tests
else
  PYTHONPATH="$ROOT" pytest -q tests -m "not integration and not e2e"
fi

popd >/dev/null
