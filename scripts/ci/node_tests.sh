#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${1:-}"

if [ -z "$PKG" ]; then
  echo "usage: node_tests.sh <api-generator|control-plane|desktop-app>"
  exit 2
fi

pushd "$ROOT/$PKG" >/dev/null

if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if npm run | grep -q "test:coverage"; then
  npm run test:coverage
elif npm run | grep -q "test"; then
  npm test
else
  echo "No test script in $PKG"
  exit 3
fi

# Verify coverage summary exists if we ran coverage.
if npm run | grep -q "test:coverage"; then
  if [ ! -f "coverage/coverage-summary.json" ]; then
    echo "ERROR: coverage/coverage-summary.json missing in $PKG"
    echo "Hint: ensure Jest uses --coverage or Vitest uses json-summary reporter."
    exit 4
  fi
fi

popd >/dev/null
