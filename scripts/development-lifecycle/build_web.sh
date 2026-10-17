#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ ! -d node_modules/.pnpm ]]; then
  pnpm install --frozen-lockfile
fi

pnpm --filter @smartspec/remotion-render build
pnpm --filter @smartspec/web build
pnpm dlx wrangler@4.151.1 deploy \
  --config apps/cloudflare/wrangler.staging.jsonc \
  --dry-run \
  --outdir apps/cloudflare/.staging-artifact/wrangler
node apps/cloudflare/scripts/package-staging-artifact.mjs
