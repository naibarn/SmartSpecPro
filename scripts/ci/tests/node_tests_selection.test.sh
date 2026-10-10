#!/usr/bin/env bash
set -euo pipefail

SOURCE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
TMP_ROOT="$(mktemp -d)"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/repo/scripts/ci" "$TMP_ROOT/bin"
cp "$SOURCE_ROOT/scripts/ci/node_tests.sh" "$TMP_ROOT/repo/scripts/ci/node_tests.sh"

cat > "$TMP_ROOT/bin/npm" <<'MOCK_NPM'
#!/usr/bin/env bash
printf 'npm %s\n' "$*" >> "$COMMAND_LOG"
if [ "$#" -eq 1 ] && [ "$1" = "run" ]; then
  printf '%s\n' 'test:coverage'
fi
MOCK_NPM

cat > "$TMP_ROOT/bin/pnpm" <<'MOCK_PNPM'
#!/usr/bin/env bash
printf 'pnpm %s\n' "$*" >> "$COMMAND_LOG"
MOCK_PNPM
chmod +x "$TMP_ROOT/bin/npm" "$TMP_ROOT/bin/pnpm"

run_fixture() {
  local name="$1"
  local manifest="$2"
  local has_npm_lock="$3"
  local fixture="$TMP_ROOT/repo/$name"
  mkdir -p "$fixture"
  printf '%s\n' "$manifest" > "$fixture/package.json"
  if [ "$has_npm_lock" = true ]; then
    : > "$fixture/package-lock.json"
  fi
  : > "$TMP_ROOT/commands.log"
  PATH="$TMP_ROOT/bin:$PATH" COMMAND_LOG="$TMP_ROOT/commands.log" \
    bash "$TMP_ROOT/repo/scripts/ci/node_tests.sh" "$name"
}

# A workspace dependency takes precedence over a colocated npm lockfile.
run_fixture workspace '{"name":"web-fixture","dependencies":{"@local/shared":"workspace:*"}}' true
grep -Fxq 'pnpm install --frozen-lockfile' "$TMP_ROOT/commands.log"
grep -Fxq 'pnpm run test:coverage' "$TMP_ROOT/commands.log"
if grep -Eq '^npm (ci|install|test|run test:coverage)' "$TMP_ROOT/commands.log"; then
  echo 'workspace-protocol package unexpectedly selected npm' >&2
  exit 1
fi

# A normal npm-lock package continues to use npm even when pnpm is available.
run_fixture npm-package '{"name":"npm-fixture","dependencies":{"left-pad":"1.3.0"}}' true
grep -Fxq 'npm ci' "$TMP_ROOT/commands.log"
grep -Fxq 'npm run test:coverage' "$TMP_ROOT/commands.log"
if grep -q '^pnpm ' "$TMP_ROOT/commands.log"; then
  echo 'npm-lock package unexpectedly selected pnpm' >&2
  exit 1
fi

# SmartSpecWeb builds only the Remotion public schema entrypoint after install.
mkdir -p "$TMP_ROOT/repo/apps/web/node_modules/.bin" "$TMP_ROOT/repo/packages/remotion-render"
printf '%s\n' '{"name":"web-fixture","dependencies":{"@local/shared":"workspace:*"}}' > "$TMP_ROOT/repo/apps/web/package.json"
cat > "$TMP_ROOT/repo/apps/web/node_modules/.bin/esbuild" <<'MOCK_ESBUILD'
#!/usr/bin/env bash
printf 'esbuild %s\n' "$*" >> "$COMMAND_LOG"
MOCK_ESBUILD
chmod +x "$TMP_ROOT/repo/apps/web/node_modules/.bin/esbuild"
: > "$TMP_ROOT/commands.log"
PATH="$TMP_ROOT/bin:$PATH" COMMAND_LOG="$TMP_ROOT/commands.log" \
  bash "$TMP_ROOT/repo/scripts/ci/node_tests.sh" apps/web
grep -Fq 'esbuild ' "$TMP_ROOT/commands.log"
grep -Fq '/packages/remotion-render/src/remotionRenderVideoSchema.ts --bundle --platform=neutral --format=esm --target=es2022 --external:zod --outfile=' "$TMP_ROOT/commands.log"
grep -Fxq 'pnpm run test:coverage' "$TMP_ROOT/commands.log"

echo 'node_tests package-manager selection and SmartSpecWeb schema preparation tests passed (3 cases)'
