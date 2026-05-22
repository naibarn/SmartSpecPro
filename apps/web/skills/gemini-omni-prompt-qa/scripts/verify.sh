#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
python3 "$ROOT/tests/test_schema_contract.py"
python3 "$ROOT/tests/test_ui_schema_completeness.py"
echo "[skill] verify passed: $(basename "$ROOT")"
