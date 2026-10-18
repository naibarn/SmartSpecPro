#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
WRANGLER_OUTDIR="$REPO_ROOT/apps/cloudflare/.staging-artifact/wrangler"

if [[ ! -d node_modules/.pnpm ]]; then
  pnpm install --frozen-lockfile
fi

pnpm --filter @smartspec/remotion-render build
pnpm --filter @smartspec/web build
bash apps/web/scripts/materialize-public-releases.sh "$REPO_ROOT/apps/web"
pnpm dlx wrangler@4.151.1 deploy \
  --config apps/cloudflare/wrangler.staging.jsonc \
  --dry-run \
  --outdir "$WRANGLER_OUTDIR"
node apps/cloudflare/scripts/package-staging-artifact.mjs
bash apps/web/scripts/package-linux-backend.sh
