#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${1:-}"

if [ -z "$PKG" ]; then
  echo "usage: node_tests.sh <package_dir>"
  exit 2
fi

pushd "$ROOT/$PKG" >/dev/null

if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PM="corepack pnpm"
else
  PM="npm"
fi

if [ -f package-lock.json ]; then
  npm ci
elif [ -f pnpm-lock.yaml ]; then
  corepack enable >/dev/null 2>&1 || true
  if [ "$PM" = "corepack pnpm" ]; then
    corepack pnpm install --frozen-lockfile
  else
    pnpm install --frozen-lockfile
  fi
else
  npm install
fi

if npm run | grep -q "test:coverage"; then
  if [ -f package-lock.json ]; then
    npm run test:coverage
  elif [ -f pnpm-lock.yaml ]; then
    if [ "$PM" = "corepack pnpm" ]; then
      corepack pnpm run test:coverage
    else
      pnpm run test:coverage
    fi
  fi
elif npm run | grep -q "test"; then
  if [ -f package-lock.json ]; then
    npm test
  elif [ -f pnpm-lock.yaml ]; then
    if [ "$PM" = "corepack pnpm" ]; then
      corepack pnpm test
    else
      pnpm test
    fi
  fi
else
  echo "No test script in $PKG"
  exit 3
fi

if [ "${SKIP_WORKOS_TEAMS_REGRESSION:-}" = "true" ]; then
  :
elif npm run | grep -q "test:workos-teams-regression"; then
  if [ -f package-lock.json ]; then
    npm run test:workos-teams-regression
  elif [ -f pnpm-lock.yaml ]; then
    if [ "$PM" = "corepack pnpm" ]; then
      corepack pnpm run test:workos-teams-regression
    else
      pnpm run test:workos-teams-regression
    fi
  fi
fi

popd >/dev/null
