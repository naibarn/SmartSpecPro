#!/usr/bin/env bash
set -euo pipefail

MODE="${1:---dry-run}"
case "${MODE}" in
  --dry-run|--apply) ;;
  *)
    echo "usage: $0 [--dry-run|--apply]" >&2
    exit 64
    ;;
esac

TMP_ROOT="${SMARTSPECPRO_TMP_ROOT:-/tmp}"
QUARANTINE_ROOT="${SMARTSPECPRO_TMP_QUARANTINE_ROOT:-/var/tmp/smartspecpro-tmp-quarantine}"
MIN_AGE_MINUTES="${SMARTSPECPRO_TMP_MIN_AGE_MINUTES:-1440}"
QUARANTINE_RETENTION_MINUTES="${SMARTSPECPRO_QUARANTINE_RETENTION_MINUTES:-20160}"
LUSER="${SMARTSPECPRO_TMP_USER:-$(id -un)}"
LOCK_FILE="${SMARTSPECPRO_TMP_LOCK_FILE:-/var/tmp/smartspecpro-tmp-cleanup.lock}"
Lsof_TIMEOUT_SECONDS="${SMARTSPECPRO_LSOF_TIMEOUT_SECONDS:-30}"

is_uint() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

if ! is_uint "${MIN_AGE_MINUTES}" || ! is_uint "${QUARANTINE_RETENTION_MINUTES}" || \
   ! is_uint "${Lsof_TIMEOUT_SECONDS}"; then
  echo "smartspecpro-tmp-cleanup: invalid numeric configuration" >&2
  exit 64
fi

if [ ! -d "${TMP_ROOT}" ]; then
  echo "smartspecpro-tmp-cleanup: preserve reason=tmp-root-missing path=${TMP_ROOT}"
  exit 0
fi

if ! command -v lsof >/dev/null 2>&1 || ! command -v timeout >/dev/null 2>&1 || \
   ! command -v flock >/dev/null 2>&1; then
  echo "smartspecpro-tmp-cleanup: preserve-all reason=required-tool-missing"
  exit 0
fi

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "smartspecpro-tmp-cleanup: skip reason=cleanup-lock-busy"
  exit 0
fi

WORK_DIR="$(mktemp -d /var/tmp/smartspecpro-tmp-cleanup.XXXXXX)"
trap 'rm -rf -- "${WORK_DIR}"' EXIT

log() {
  printf 'smartspecpro-tmp-cleanup: %s\n' "$*"
}

is_allowed_prefix() {
  case "${1:-}" in
    smartspec-git.*|smartaihub-remotion-*|smartaihub-runtime-manifest-*|\
    smartaihub-worker-update-*|smarthub-mac-runtime-*|runtime-prefix-*|\
    ssp-*|vd-*|worker-runtime-*|worker-log-rot-*|presentation-export-*|\
    media-studio-prompt-skill-*|vector-provider-*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

is_owned_tree() {
  local path="$1"
  if [ "$(stat -c '%U' -- "${path}" 2>/dev/null || true)" != "${LUSER}" ]; then
    return 1
  fi
  if [ -d "${path}" ] && find "${path}" -xdev ! -user "${LUSER}" -print -quit 2>/dev/null | grep -q .; then
    return 1
  fi
  return 0
}

# Return success only when lsof completed cleanly and found no open path.
# Any timeout, warning, or unexpected error fails closed and preserves the path.
is_not_open() {
  local path="$1"
  local output_file="${WORK_DIR}/lsof-output"
  local error_file="${WORK_DIR}/lsof-error"
  local rc
  : > "${output_file}"
  : > "${error_file}"

  if [ -d "${path}" ]; then
    timeout --foreground "${Lsof_TIMEOUT_SECONDS}s" lsof -w +D "${path}" \
      >"${output_file}" 2>"${error_file}" || rc=$?
  else
    timeout --foreground "${Lsof_TIMEOUT_SECONDS}s" lsof -w -- "${path}" \
      >"${output_file}" 2>"${error_file}" || rc=$?
  fi
  rc="${rc:-0}"

  if [ "${rc}" -eq 124 ] || [ "${rc}" -eq 137 ] || [ -s "${error_file}" ] || [ -s "${output_file}" ]; then
    return 1
  fi
  return 0
}

quarantine_path() {
  local path="$1"
  local batch_dir="$2"
  if [ "${MODE}" = "--dry-run" ]; then
    log "would-quarantine path=${path}"
    return 0
  fi
  if mv -- "${path}" "${batch_dir}/"; then
    log "quarantined path=${path} batch=${batch_dir}"
  else
    log "preserve path=${path} reason=move-failed"
  fi
}

cleanup_old_quarantine() {
  [ -d "${QUARANTINE_ROOT}" ] || return 0
  while IFS= read -r -d '' batch_dir; do
    local batch_name="${batch_dir##*/}"
    [[ "${batch_name}" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
    if ! is_owned_tree "${batch_dir}"; then
      log "preserve path=${batch_dir} reason=ownership-check"
      continue
    fi
    if ! is_not_open "${batch_dir}"; then
      log "preserve path=${batch_dir} reason=process-check"
      continue
    fi
    if [ "${MODE}" = "--dry-run" ]; then
      log "would-expire-quarantine path=${batch_dir}"
    elif rm -rf -- "${batch_dir}"; then
      log "expired-quarantine path=${batch_dir}"
    else
      log "preserve path=${batch_dir} reason=remove-failed"
    fi
  done < <(find "${QUARANTINE_ROOT}" -mindepth 1 -maxdepth 1 -type d \
    -mmin "+${QUARANTINE_RETENTION_MINUTES}" -print0 2>/dev/null)
}

batch_dir=""
if [ "${MODE}" = "--apply" ]; then
  mkdir -p -m 700 "${QUARANTINE_ROOT}"
  batch_dir="${QUARANTINE_ROOT}/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p -m 700 "${batch_dir}"
fi

while IFS= read -r -d '' candidate; do
  base_name="${candidate##*/}"
  is_allowed_prefix "${base_name}" || continue
  is_owned_tree "${candidate}" || {
    log "preserve path=${candidate} reason=ownership-check"
    continue
  }
  if ! is_not_open "${candidate}"; then
    log "preserve path=${candidate} reason=process-check"
    continue
  fi
  quarantine_path "${candidate}" "${batch_dir}"
done < <(find "${TMP_ROOT}" -xdev -mindepth 1 -maxdepth 1 \
  \( -type f -o -type d \) -mmin "+${MIN_AGE_MINUTES}" -print0 2>/dev/null)

cleanup_old_quarantine
