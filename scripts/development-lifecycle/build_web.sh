#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ ! -d node_modules/.pnpm ]]; then
  pnpm install --frozen-lockfile
fi

pnpm --filter @smartspec/web build
