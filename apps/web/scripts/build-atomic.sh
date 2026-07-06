#!/usr/bin/env bash
#
# Atomic production build for apps/web.
#
# Problem: `npm run build` runs `vite build` with `emptyOutDir: true`, which
# WIPES the live `dist/public` directory (including the widget subtree built
# by `build:widget`) and then repopulates it over ~50s. Any request served by
# the running smartspec-web process during that window hits ENOENT reading
# `dist/public/index.html`. If a restart happens to land in that window too,
# it's a 502 for real users.
#
# Fix: build the full output (main app + widget) into a separate staging
# directory, then swap it into place with two `mv` calls against the SAME
# `dist` directory name. The rename syscall is atomic; the gap between the
# two `mv` calls is sub-millisecond, and any in-flight request that already
# opened a file handle keeps reading old inode contents on Linux (rename does
# not invalidate open fds). New requests either see the fully-old tree or the
# fully-new tree — never a half-built one.
#
# This script does NOT touch the default `npm run build` / `vite.config.ts`
# semantics. It is an alternative entry point for deploys.
#
# Usage:
#   apps/web/scripts/build-atomic.sh
#   (or) npm run build:deploy   (from apps/web)
#
# After it completes, restart the service to load new server-side code:
#   sudo systemctl restart smartspec-web.service
# (Static assets are served fresh from disk per-request, so the dist swap
# itself does NOT require a restart for the frontend to update. A restart is
# only needed if server/*.ts logic changed.)

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # apps/web
WEB_DIR="$(pwd)"

STAGING_DIR="${WEB_DIR}/dist-staging"
LIVE_DIR="${WEB_DIR}/dist"
TIMESTAMP="$(date +%s)"
PREV_DIR="${WEB_DIR}/dist-prev-${TIMESTAMP}"

echo "[build-atomic] Building into staging dir: ${STAGING_DIR}"
rm -rf "${STAGING_DIR}"

# SSP_BUILD_OUT_DIR is read by vite.config.ts / vite.config.widget.ts to
# redirect outDir into the staging tree instead of dist/public. Falls back to
# the normal dist/public if unset (keeps `npm run build` unaffected).
export SSP_BUILD_OUT_DIR="${STAGING_DIR}/public"

npx vite build --configLoader runner
npx vite build --configLoader runner --config vite.config.widget.ts

if [ ! -f "${STAGING_DIR}/public/index.html" ]; then
  echo "[build-atomic] ERROR: staging build did not produce public/index.html — aborting swap." >&2
  exit 1
fi

if [ ! -f "${STAGING_DIR}/public/widget/v1/widget.js" ]; then
  echo "[build-atomic] ERROR: staging build did not produce widget/v1/widget.js — aborting swap." >&2
  exit 1
fi

echo "[build-atomic] Staging build verified. Swapping into place atomically..."

if [ -d "${LIVE_DIR}" ]; then
  mv "${LIVE_DIR}" "${PREV_DIR}"
fi
mv "${STAGING_DIR}" "${LIVE_DIR}"

echo "[build-atomic] Swap complete. Live dist is now the new build."

# Prune old dist-prev-* dirs, keeping the last 2 for rollback.
mapfile -t OLD_DIRS < <(ls -1dt "${WEB_DIR}"/dist-prev-* 2>/dev/null || true)
if [ "${#OLD_DIRS[@]}" -gt 2 ]; then
  for old in "${OLD_DIRS[@]:2}"; do
    echo "[build-atomic] Pruning old backup: ${old}"
    rm -rf "${old}"
  done
fi

echo "[build-atomic] Done. dist/public/index.html mtime: $(date -r "${LIVE_DIR}/public/index.html")"
echo "[build-atomic] NOTE: static files are served fresh per-request; no restart needed for frontend-only changes."
echo "[build-atomic] If server/*.ts (backend) code changed, run: sudo systemctl restart smartspec-web.service"
