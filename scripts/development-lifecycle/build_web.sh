#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
WRANGLER_OUTDIR="$REPO_ROOT/apps/cloudflare/.staging-artifact/wrangler"

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
"${PNPM[@]}" dlx wrangler@4.151.1 deploy \
  --config apps/cloudflare/wrangler.staging.jsonc \
  --dry-run \
  --outdir "$WRANGLER_OUTDIR"
# Package the private native candidate under the SAME immutable build receipt.
# This is a local bundle only; it never deploys or modifies the M2 Worker.
"${PNPM[@]}" dlx wrangler@4.151.1 deploy \
  --config apps/cloudflare/wrangler.candidate-artifact.jsonc \
  --dry-run \
  --outdir "$WRANGLER_OUTDIR"
node apps/cloudflare/scripts/package-staging-artifact.mjs
bash apps/web/scripts/package-linux-backend.sh
