#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

echo "[CI] Python (install + tests + coverage) ..."
bash "$ROOT/scripts/ci/python_tests.sh"

echo "[CI] Node: api-generator ..."
bash "$ROOT/scripts/ci/node_tests.sh" api-generator

echo "[CI] Node: control-plane ..."
bash "$ROOT/scripts/ci/node_tests.sh" control-plane

echo "[CI] Node: apps/tauri-shell ..."
bash "$ROOT/scripts/ci/node_tests.sh" apps/tauri-shell

echo "[CI] Done."
