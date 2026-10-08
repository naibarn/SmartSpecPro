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

# Run interactive builds in their own user scope. systemd-oomd currently
# protects the shared user slice by killing the largest session scope; if the
# build runs inside an SSH or desktop session, that logs the user out. A
# dedicated scope lets oomd stop only the build while leaving its terminal
# session alive. CI and hosts without a user systemd manager keep the normal
# direct execution path.
check_inotify_headroom() {
  local max_watches current_watches
  if [ ! -r /proc/sys/fs/inotify/max_user_watches ]; then
    return 0
  fi
  max_watches="$(cat /proc/sys/fs/inotify/max_user_watches)"
  current_watches="$(python3 - <<'PY'
from pathlib import Path
import os

watch_count = 0
for process in Path('/proc').iterdir():
    if not process.name.isdigit():
        continue
    try:
        if process.stat().st_uid != os.getuid():
            continue
        for info in (process / 'fdinfo').glob('*'):
            try:
                watch_count += info.read_text(errors='ignore').count('inotify wd:')
            except OSError:
                pass
    except OSError:
        pass
print(watch_count)
PY
)"
  if [ -z "${max_watches}" ] || [ -z "${current_watches}" ]; then
    echo "[build-atomic] Resource preflight: unable to measure inotify watch usage; continuing." >&2
    return 0
  fi
  echo "[build-atomic] Inotify watch usage: ${current_watches}/${max_watches}." >&2
  if [ "$((current_watches * 10))" -ge "$((max_watches * 9))" ]; then
    echo "[build-atomic] RESOURCE_BLOCKED: inotify watches are at least 90% of the per-user limit; exclude generated workspace folders and reload the editor before building." >&2
    return 1
  fi
}

if [ "${SSP_BUILD_SYSTEMD_SCOPE:-0}" != "1" ] \
  && [ "$(uname -s)" = "Linux" ] \
  && command -v systemd-run >/dev/null 2>&1 \
  && [ -n "${XDG_RUNTIME_DIR:-}" ] \
  && systemctl --user show-environment >/dev/null 2>&1; then
  if ! check_inotify_headroom; then
    exit 137
  fi
  SCRIPT_PATH="$(readlink -f "${BASH_SOURCE[0]}")"
  BUILD_SCOPE_SUFFIX="$(date +%s)-$$"
  exec systemd-run --user --scope \
    --slice=smartspec-build.slice \
    --unit="smartspec-build-${BUILD_SCOPE_SUFFIX}" \
    --property="MemoryHigh=${SSP_BUILD_CGROUP_HIGH:-8G}" \
    --property="MemoryMax=${SSP_BUILD_CGROUP_MAX:-10G}" \
    --property="MemorySwapMax=${SSP_BUILD_CGROUP_SWAP_MAX:-2G}" \
    --setenv=SSP_BUILD_SYSTEMD_SCOPE=1 \
    -- "${SCRIPT_PATH}" "$@"
fi

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # apps/web
WEB_DIR="$(pwd)"
PUBLIC_DIR="${WEB_DIR}/client/public"
RELEASES_DIR="${PUBLIC_DIR}/releases"
MIN_FREE_KB=$((5 * 1024 * 1024))
BUILD_LOG_DIR="${SSP_BUILD_LOG_DIR:-${TMPDIR:-/tmp}/smartspec-build-logs}"
mkdir -p "${BUILD_LOG_DIR}"
TIMESTAMP="$(date +%s)-$$"
BUILD_LOG="${BUILD_LOG_DIR}/build-${TIMESTAMP}.log"
BUILD_STARTED_AT="$(date +%s)"
CURRENT_PHASE="initialization"
MEMORY_SAMPLER_PID=""
exec > >(tee -a "${BUILD_LOG}") 2>&1
echo "[build-atomic] Log file: ${BUILD_LOG}"

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

# Admission gate for the shared development host. A full Vite build can peak
# near 8 GiB; starting while the user slice is already at its memory/swap cap
# causes sustained PSI and systemd-oomd to kill this build. Keep the production
# service headroom intact and fail before Vite transforms 13k modules.
resource_preflight() {
  local user_cgroup="/sys/fs/cgroup/user.slice/user-$(id -u).slice"
  local memory_current memory_effective memory_reclaimable memory_high memory_max swap_current swap_max
  local available_kb psi_avg10 memory_high_headroom memory_max_headroom swap_headroom
  local gib=$((1024 * 1024 * 1024))
  local minimum_memory_headroom=$((6 * gib))
  local minimum_memory_max_headroom=$((8 * gib))
  local minimum_swap_headroom=$((512 * 1024 * 1024))
  local minimum_host_available_kb=$((6 * 1024 * 1024))

  available_kb="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo 2>/dev/null || true)"
  psi_avg10="$(awk '$1 == "some" { for (i = 2; i <= NF; i++) if ($i ~ /^avg10=/) { split($i, value, "="); print value[2] } }' /proc/pressure/memory 2>/dev/null || true)"
  echo "[build-atomic] Resource preflight: host_available_kb=${available_kb:-unknown}, memory_psi_some_avg10=${psi_avg10:-unknown}."

  if [ -n "${available_kb}" ] && [ "${available_kb}" -lt "${minimum_host_available_kb}" ]; then
    echo "[build-atomic] RESOURCE_BLOCKED: host has less than 6 GiB available RAM; no build was started." >&2
    return 1
  fi
  if [ -n "${psi_avg10}" ] && awk -v value="${psi_avg10}" 'BEGIN { exit !(value >= 50) }'; then
    echo "[build-atomic] RESOURCE_BLOCKED: memory PSI is already at least 50%; no build was started." >&2
    return 1
  fi

  if [ ! -r "${user_cgroup}/memory.current" ] || [ ! -r "${user_cgroup}/memory.high" ] \
    || [ ! -r "${user_cgroup}/memory.max" ]; then
    echo "[build-atomic] Resource preflight: user-slice cgroup limits unavailable; continuing with host RAM/PSI checks."
    return 0
  fi

  memory_current="$(cat "${user_cgroup}/memory.current")"
  memory_high="$(cat "${user_cgroup}/memory.high")"
  memory_max="$(cat "${user_cgroup}/memory.max")"
  # File pages on the inactive LRU and reclaimable slab can be evicted by the
  # kernel under pressure. Do not treat them like pinned memory: canonical
  # dependency setup warms a large file cache before this build-level gate.
  # `inactive_file` excludes tmpfs/shmem, which must remain charged because
  # reclaiming it would discard live temporary files.
  memory_reclaimable="$(awk '$1 == "inactive_file" || $1 == "slab_reclaimable" { total += $2 } END { print total + 0 }' "${user_cgroup}/memory.stat" 2>/dev/null || echo 0)"
  memory_effective=$((memory_current - memory_reclaimable))
  if [ "${memory_effective}" -lt 0 ]; then
    memory_effective=0
  fi
  swap_current="$(cat "${user_cgroup}/memory.swap.current" 2>/dev/null || echo max)"
  swap_max="$(cat "${user_cgroup}/memory.swap.max" 2>/dev/null || echo max)"
  echo "[build-atomic] Resource preflight: user_slice_memory_current=${memory_current}, reclaimable=${memory_reclaimable}, effective=${memory_effective}, high=${memory_high}, max=${memory_max}, swap_current=${swap_current}, swap_max=${swap_max}."

  if [ "${memory_high}" != "max" ]; then
    memory_high_headroom=$((memory_high - memory_effective))
    if [ "${memory_high_headroom}" -lt "${minimum_memory_headroom}" ]; then
      echo "[build-atomic] RESOURCE_BLOCKED: user slice has less than 6 GiB headroom below MemoryHigh; no build was started." >&2
      return 1
    fi
  fi
  if [ "${memory_max}" != "max" ]; then
    memory_max_headroom=$((memory_max - memory_effective))
    if [ "${memory_max_headroom}" -lt "${minimum_memory_max_headroom}" ]; then
      echo "[build-atomic] RESOURCE_BLOCKED: user slice has less than 8 GiB headroom below MemoryMax; no build was started." >&2
      return 1
    fi
  fi
  if [ "${swap_max}" != "max" ]; then
    swap_headroom=$((swap_max - swap_current))
    if [ "${swap_headroom}" -lt "${minimum_swap_headroom}" ]; then
      echo "[build-atomic] RESOURCE_BLOCKED: user slice has less than 512 MiB swap headroom; no build was started." >&2
      return 1
    fi
  fi
  return 0
}

if ! resource_preflight; then
  exit 137
fi

AVAILABLE_KB="$(df -Pk "${WEB_DIR}" | awk 'NR == 2 { print $4 }')"
if [ -z "${AVAILABLE_KB}" ] || [ "${AVAILABLE_KB}" -lt "${MIN_FREE_KB}" ]; then
  echo "[build-atomic] ERROR: at least 5 GiB free disk space is required; available=${AVAILABLE_KB:-unknown} KiB." >&2
  exit 1
fi

STAGING_DIR="${WEB_DIR}/dist-staging-${TIMESTAMP}"
LIVE_DIR="${WEB_DIR}/dist"
PREV_DIR="${WEB_DIR}/dist-prev-${TIMESTAMP}"

cleanup() {
  local exit_status=$?
  local finished_at
  if [ -n "${MEMORY_SAMPLER_PID}" ]; then
    kill "${MEMORY_SAMPLER_PID}" 2>/dev/null || true
    wait "${MEMORY_SAMPLER_PID}" 2>/dev/null || true
  fi
  finished_at="$(date +%s)"
  if [ "${exit_status}" -ne 0 ]; then
    echo "[build-atomic] FAILED during '${CURRENT_PHASE}' (exit=${exit_status}, elapsed=$((finished_at - BUILD_STARTED_AT))s)."
    echo "[build-atomic] Log preserved at: ${BUILD_LOG}"
  fi
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

run_phase() {
  local phase="$1"
  shift
  local started_at="$(date +%s)"
  local exit_status
  CURRENT_PHASE="${phase}"
  echo "[build-atomic] Starting ${phase}."
  if "$@"; then
    exit_status=0
  else
    exit_status=$?
  fi
  echo "[build-atomic] ${phase} finished (exit=${exit_status}, elapsed=$(($(date +%s) - started_at))s)."
  return "${exit_status}"
}

sample_memory() {
  while true; do
    sleep 15
    {
      echo "[build-atomic] Memory sample $(date '+%Y-%m-%dT%H:%M:%S%z')"
      free -h
      if [ -r /proc/pressure/memory ]; then
        cat /proc/pressure/memory
      fi
      ps -eo pid,ppid,rss,%mem,%cpu,etime,args --sort=-rss | sed -n '1,7p'
    } >> "${BUILD_LOG}"
  done
}

echo "[build-atomic] Building into staging dir: ${STAGING_DIR}"

# Keep headroom for native/Rollup allocations and the rest of the host. Override
# with SSP_BUILD_HEAP_MB when a build demonstrably needs a different limit.
export NODE_OPTIONS="${NODE_OPTIONS:+${NODE_OPTIONS} }--max-old-space-size=${SSP_BUILD_HEAP_MB:-6144}"

# SSP_BUILD_OUT_DIR is read by vite.config.ts / vite.config.widget.ts to
# redirect outDir into the staging tree instead of dist/public. Falls back to
# the normal dist/public if unset (keeps `npm run build` unaffected).
export SSP_BUILD_OUT_DIR="${STAGING_DIR}/public"
export SSP_SKIP_PUBLIC_COPY=1

echo "[build-atomic] Node heap limit: ${SSP_BUILD_HEAP_MB:-6144} MiB."
sample_memory &
MEMORY_SAMPLER_PID=$!
run_phase "main Vite build" npx vite build --configLoader runner
run_phase "widget Vite build" npx vite build --configLoader runner --config vite.config.widget.ts

# Do not atomically publish a frontend whose emergency map chunk cannot load
# the MapLibre worker emitted by this exact build.
run_phase "MapLibre worker asset verification" node scripts/verify-maplibre-worker-assets.mjs "${STAGING_DIR}/public"

# Copy ordinary public files after Vite has emptied and rebuilt the staging
# output. Release archives are intentionally shared through a relative symlink:
# both dist/public and dist-staging-*/public resolve it to client/public/releases.
CURRENT_PHASE="staging public files"
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

CURRENT_PHASE="atomic dist swap"
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
echo "[build-atomic] Total elapsed: $(($(date +%s) - BUILD_STARTED_AT))s. Log: ${BUILD_LOG}"
