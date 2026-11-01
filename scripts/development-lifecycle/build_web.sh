#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
if command -v pnpm >/dev/null 2>&1; then
  PNPM=(pnpm)
elif command -v corepack >/dev/null 2>&1; then
  PNPM=(corepack pnpm)
else
  echo "Neither pnpm nor corepack is available in PATH" >&2
  exit 127
fi

if [[ ! -d node_modules/.pnpm ]]; then
  "${PNPM[@]}" install --frozen-lockfile
fi

"${PNPM[@]}" --filter @smartspec/remotion-render build
"${PNPM[@]}" --filter @smartspec/web build
bash apps/web/scripts/materialize-public-releases.sh "$REPO_ROOT/apps/web"
bash apps/web/scripts/package-linux-backend.sh
