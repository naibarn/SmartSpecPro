#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${1:-}"

if [ -z "$PKG" ]; then
  echo "usage: node_tests.sh <package_dir>"
  exit 2
fi

pushd "$ROOT/$PKG" >/dev/null

if [ -f pnpm-lock.yaml ]; then
  corepack enable >/dev/null 2>&1 || true
  pnpm install --frozen-lockfile
elif [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi

if npm run | grep -q "test:coverage"; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm run test:coverage
  else
    npm run test:coverage
  fi
elif npm run | grep -q "test"; then
  if [ -f pnpm-lock.yaml ]; then
    pnpm test
  else
    npm test
  fi
else
  echo "No test script in $PKG"
  exit 3
fi

popd >/dev/null
