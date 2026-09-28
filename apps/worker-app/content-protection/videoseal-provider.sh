#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ROOT/../../.." && pwd)"
PYTHON="${CONTENT_PROTECTION_PYTHON:-$ROOT/python/bin/python3}"
if [[ ! -x "$PYTHON" ]]; then
  PYTHON="$REPO_ROOT/python-backend/.venv/bin/python"
fi

if [[ ! -x "$PYTHON" ]]; then
  echo "content protection Python runtime is not executable: $PYTHON" >&2
  exit 1
fi

PROVIDER_SITE="$(find "$ROOT/.venv/lib" -type d -name site-packages -print -quit 2>/dev/null || true)"
if [[ -z "$PROVIDER_SITE" ]]; then
  echo "VideoSeal provider environment is not installed: $ROOT/.venv" >&2
  exit 1
fi

export PYTHONPATH="$PROVIDER_SITE${PYTHONPATH:+:$PYTHONPATH}"
exec "$PYTHON" "$ROOT/videoseal-provider.py" "$@"
