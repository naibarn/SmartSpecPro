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
# This script is the default `npm run build` entry point. The direct Vite
# command remains available as `npm run build:unsafe` for local-only work where
# no server is serving dist/public.
#
# Usage:
#   apps/web/scripts/build-atomic.sh
#   (or) npm run build / npm run build:deploy   (from apps/web)
#
# After it completes, restart the service to load new server-side code:
#   sudo systemctl restart smartspec-web.service
# (Static assets are served fresh from disk per-request, so the dist swap
# itself does NOT require a restart for the frontend to update. A restart is
# only needed if server/*.ts logic changed.)

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # apps/web
WEB_DIR="$(pwd)"
PUBLIC_DIR="${WEB_DIR}/client/public"
RELEASES_DIR="${PUBLIC_DIR}/releases"
MIN_FREE_KB=$((5 * 1024 * 1024))

# Do not allow two deploy builds to remove/recreate the same staging tree or
# race while swapping the live tree. `flock` is provided by util-linux on the
# supported Linux hosts; fail clearly if the host is missing it.
if ! command -v flock >/dev/null 2>&1; then
  echo "[build-atomic] ERROR: flock is required to serialize production builds." >&2
  exit 1
fi
LOCK_FILE="${WEB_DIR}/.build-atomic.lock"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "[build-atomic] ERROR: another production build is already running." >&2
  exit 1
fi

if [ ! -d "${RELEASES_DIR}" ]; then
  echo "[build-atomic] ERROR: shared releases directory is missing: ${RELEASES_DIR}" >&2
  exit 1
fi

# An interrupted SSH session can kill a build before its EXIT trap gets CPU
# time. Once we own the lock, no staging directory can still belong to a live
# atomic build, so removing leftovers is safe and prevents disk exhaustion.
cleanup_stale_staging() {
  local stale
  for stale in "${WEB_DIR}"/dist-staging-*; do
    [ -d "${stale}" ] || continue
    case "${stale}" in
      "${WEB_DIR}"/dist-staging-*)
        echo "[build-atomic] Removing stale staging dir: ${stale}"
        rm -rf -- "${stale}"
        ;;
      *)
        echo "[build-atomic] ERROR: refusing unsafe staging path: ${stale}" >&2
        exit 1
        ;;
    esac
  done
}

cleanup_stale_staging

AVAILABLE_KB="$(df -Pk "${WEB_DIR}" | awk 'NR == 2 { print $4 }')"
if [ -z "${AVAILABLE_KB}" ] || [ "${AVAILABLE_KB}" -lt "${MIN_FREE_KB}" ]; then
  echo "[build-atomic] ERROR: at least 5 GiB free disk space is required; available=${AVAILABLE_KB:-unknown} KiB." >&2
  exit 1
fi

TIMESTAMP="$(date +%s)-$$"
STAGING_DIR="${WEB_DIR}/dist-staging-${TIMESTAMP}"
LIVE_DIR="${WEB_DIR}/dist"
PREV_DIR="${WEB_DIR}/dist-prev-${TIMESTAMP}"

cleanup() {
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

echo "[build-atomic] Building into staging dir: ${STAGING_DIR}"

# SSP_BUILD_OUT_DIR is read by vite.config.ts / vite.config.widget.ts to
# redirect outDir into the staging tree instead of dist/public. Falls back to
# the normal dist/public if unset (keeps `npm run build` unaffected).
export SSP_BUILD_OUT_DIR="${STAGING_DIR}/public"
export SSP_SKIP_PUBLIC_COPY=1

npx vite build --configLoader runner
npx vite build --configLoader runner --config vite.config.widget.ts

# Copy ordinary public files after Vite has emptied and rebuilt the staging
# output. Release archives are intentionally shared through a relative symlink:
# both dist/public and dist-staging-*/public resolve it to client/public/releases.
find "${PUBLIC_DIR}" -mindepth 1 -maxdepth 1 ! -name releases \
  -exec cp -a -t "${STAGING_DIR}/public" -- {} +
if [ -e "${STAGING_DIR}/public/releases" ] || [ -L "${STAGING_DIR}/public/releases" ]; then
  echo "[build-atomic] ERROR: Vite unexpectedly copied releases into staging — aborting swap." >&2
  exit 1
fi
ln -s ../../client/public/releases "${STAGING_DIR}/public/releases"
if [ ! -L "${STAGING_DIR}/public/releases" ] || [ ! -d "${STAGING_DIR}/public/releases" ]; then
  echo "[build-atomic] ERROR: shared releases symlink is invalid — aborting swap." >&2
  exit 1
fi

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

# Older builds may contain physical copies of the shared 12+ GiB release tree.
# Normalize retained rollback trees after the successful swap, preserving the
# same URL/files while reclaiming the duplicated disk space.
for rollback in "${WEB_DIR}"/dist-prev-*; do
  [ -d "${rollback}/public" ] || continue
  if [ ! -L "${rollback}/public/releases" ]; then
    rm -rf -- "${rollback}/public/releases"
    ln -s ../../client/public/releases "${rollback}/public/releases"
  fi
done

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
