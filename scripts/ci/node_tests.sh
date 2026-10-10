#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PKG="${1:-}"

if [ -z "$PKG" ]; then
  echo "usage: node_tests.sh <package_dir>"
  exit 2
fi

pushd "$ROOT/$PKG" >/dev/null

has_workspace_protocol_dependency() {
  [ -f package.json ] || return 1
  node -e '
    const manifest = require(process.argv[1]);
    const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
    process.exit(sections.some((section) =>
      Object.values(manifest[section] || {}).some((version) =>
        typeof version === "string" && version.startsWith("workspace:")
      )
    ) ? 0 : 1);
  ' "$PWD/package.json"
}

if has_workspace_protocol_dependency; then
  PACKAGE_MANAGER="pnpm"
elif [ -f package-lock.json ]; then
  PACKAGE_MANAGER="npm"
elif [ -f pnpm-lock.yaml ]; then
  PACKAGE_MANAGER="pnpm"
else
  PACKAGE_MANAGER="npm"
fi

run_pnpm() {
  if command -v pnpm >/dev/null 2>&1; then
    pnpm "$@"
  elif command -v corepack >/dev/null 2>&1; then
    corepack enable >/dev/null 2>&1 || true
    corepack pnpm "$@"
  else
    echo "pnpm is required for package $PKG (workspace protocol or pnpm lockfile)" >&2
    return 127
  fi
}

if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
  run_pnpm install --frozen-lockfile
elif [ -f package-lock.json ]; then
  if [ "$PKG" = "apps/web" ]; then
    npm ci --legacy-peer-deps --workspaces=false
  else
    npm ci
  fi
else
  npm install
fi

# The SmartSpecWeb tests import this workspace package's public schema entry
# point. Its source is intentionally bundled separately from the heavyweight
# Remotion renderer, so build that single entrypoint after dependencies exist
# and before Vitest resolves the package export.
if [ "$PKG" = "apps/web" ]; then
  REMOTION_SCHEMA_ROOT="$ROOT/packages/remotion-render"
  REMOTION_SCHEMA_BUILDER="$ROOT/apps/web/node_modules/.bin/esbuild"
  if [ ! -x "$REMOTION_SCHEMA_BUILDER" ]; then
    echo "esbuild is required to prepare the SmartSpecWeb Remotion schema" >&2
    exit 127
  fi
  mkdir -p "$REMOTION_SCHEMA_ROOT/dist"
  "$REMOTION_SCHEMA_BUILDER" \
    "$REMOTION_SCHEMA_ROOT/src/remotionRenderVideoSchema.ts" \
    --bundle --platform=neutral --format=esm --target=es2022 --external:zod \
    --outfile="$REMOTION_SCHEMA_ROOT/dist/remotionRenderVideoSchema.js"
fi

if npm run | grep -q "test:coverage"; then
  if [ "$PACKAGE_MANAGER" = "npm" ]; then
    npm run test:coverage
  else
    run_pnpm run test:coverage
  fi
elif npm run | grep -q "test"; then
  if [ "$PACKAGE_MANAGER" = "npm" ]; then
    npm test
  else
    run_pnpm test
  fi
else
  echo "No test script in $PKG"
  exit 3
fi

if [ "${SKIP_WORKOS_TEAMS_REGRESSION:-}" = "true" ]; then
  :
elif npm run | grep -q "test:workos-teams-regression"; then
  if [ "$PACKAGE_MANAGER" = "npm" ]; then
    npm run test:workos-teams-regression
  else
    run_pnpm run test:workos-teams-regression
  fi
fi

popd >/dev/null
