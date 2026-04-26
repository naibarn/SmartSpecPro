#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

find skills \
  \( -path '*/.venv' -o -path '*/.pytest_cache' -o -path '*/__pycache__' \) \
  -type d -prune -print -exec rm -rf {} +

find skills \
  \( -name '*.pyc' -o -name '*.pyo' \) \
  -type f -print -delete

while IFS= read -r lockfile; do
  if ! git ls-files --error-unmatch "$lockfile" >/dev/null 2>&1; then
    printf '%s\n' "$lockfile"
    rm -f "$lockfile"
  fi
done < <(find skills -name 'uv.lock' -type f)
