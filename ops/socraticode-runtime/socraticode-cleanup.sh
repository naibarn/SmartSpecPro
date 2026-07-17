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

DOCKER_BIN="${SOCRATICODE_DOCKER_BIN:-docker}"
PROC_ROOT="${SOCRATICODE_PROC_ROOT:-/proc}"
PROJECT_ROOT="${SOCRATICODE_PROJECT_ROOT:-/home/dev/projects/SmartSpecPro}"
NOW_EPOCH="${SOCRATICODE_NOW_EPOCH:-$(date +%s)}"
GRACE_SECONDS="${SOCRATICODE_ORPHAN_GRACE_SECONDS:-900}"
DOCKER_TIMEOUT_SECONDS="${SOCRATICODE_DOCKER_TIMEOUT_SECONDS:-20}"
STOP_SECONDS="${SOCRATICODE_CONTAINER_STOP_SECONDS:-10}"
LOCK_FILE="${SOCRATICODE_CLEANUP_LOCK:-/home/dev/tools/socraticode-docker/locks/socraticode-cleanup.lock}"
OWNED_CONTAINER="${SOCRATICODE_OWNED_CONTAINER:-}"

is_uint() {
  [[ "${1:-}" =~ ^[0-9]+$ ]]
}

for value in "${NOW_EPOCH}" "${GRACE_SECONDS}" "${DOCKER_TIMEOUT_SECONDS}" "${STOP_SECONDS}"; do
  if ! is_uint "${value}"; then
    echo "socraticode-cleanup: invalid numeric configuration" >&2
    exit 64
  fi
done

if ! command -v timeout >/dev/null 2>&1; then
  echo "socraticode-cleanup: preserve all reason=timeout-command-missing" >&2
  exit 0
fi
if ! command -v flock >/dev/null 2>&1; then
  echo "socraticode-cleanup: preserve all reason=flock-command-missing" >&2
  exit 0
fi

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "socraticode-cleanup: skip reason=cleanup-lock-busy"
  exit 0
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

docker_capture() {
  local output_file="$1"
  shift
  timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" "${DOCKER_BIN}" "$@" >"${output_file}" 2>&1
}

docker_mutate() {
  local action="$1"
  shift
  if timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" "${DOCKER_BIN}" "$@" >/dev/null 2>&1; then
    return 0
  fi
  local rc=$?
  echo "socraticode-cleanup: warning action=${action} rc=${rc}" >&2
  return "${rc}"
}

LIST_FILE="${TMP_DIR}/containers"
if docker_capture "${LIST_FILE}" ps -a --format '{{.ID}}|{{.Names}}'; then
  :
else
  rc=$?
  if [ "${rc}" -eq 124 ] || [ "${rc}" -eq 137 ]; then
    echo "socraticode-cleanup: docker-list-timeout preserve-all"
  else
    echo "socraticode-cleanup: docker-list-error rc=${rc} preserve-all"
  fi
  exit 0
fi

while IFS='|' read -r container_id container_name; do
  [ -n "${container_id:-}" ] || continue
  case "${container_name:-}" in
    socraticode-mcp-*) ;;
    *) continue ;;
  esac

  INSPECT_FILE="${TMP_DIR}/inspect-${container_id}"
  if docker_capture "${INSPECT_FILE}" inspect --format \
    '{{index .Config.Labels "com.smartspec.socraticode.managed"}}|{{index .Config.Labels "com.smartspec.socraticode.project"}}|{{index .Config.Labels "com.smartspec.socraticode.launcher_pid"}}|{{index .Config.Labels "com.smartspec.socraticode.launcher_uid"}}|{{index .Config.Labels "com.smartspec.socraticode.launcher_start_ticks"}}|{{index .Config.Labels "com.smartspec.socraticode.role"}}|{{index .Config.Labels "com.smartspec.socraticode.created_epoch"}}' \
    "${container_id}"; then
    :
  else
    echo "socraticode-cleanup: preserve name=${container_name} reason=inspect-failed"
    continue
  fi

  IFS='|' read -r managed project launcher_pid launcher_uid launcher_start_ticks role created_epoch < "${INSPECT_FILE}" || true
  if [ "${managed:-}" != "true" ]; then
    echo "socraticode-cleanup: legacy-unmanaged name=${container_name} action=report-only"
    continue
  fi
  if [ "${project:-}" != "${PROJECT_ROOT}" ]; then
    echo "socraticode-cleanup: preserve name=${container_name} reason=project-mismatch"
    continue
  fi
  if [ "${container_name}" = "${OWNED_CONTAINER}" ]; then
    echo "socraticode-cleanup: preserve name=${container_name} reason=caller-owned"
    continue
  fi
  if ! is_uint "${launcher_pid:-}" || ! is_uint "${launcher_uid:-}" || \
     ! is_uint "${launcher_start_ticks:-}" || ! is_uint "${created_epoch:-}" || \
     [ -z "${role:-}" ]; then
    echo "socraticode-cleanup: preserve name=${container_name} reason=invalid-metadata"
    continue
  fi

  age_seconds=$((NOW_EPOCH - created_epoch))
  if [ "${age_seconds}" -lt 0 ]; then
    echo "socraticode-cleanup: preserve name=${container_name} reason=invalid-metadata"
    continue
  fi
  if [ "${age_seconds}" -lt "${GRACE_SECONDS}" ]; then
    echo "socraticode-cleanup: preserve name=${container_name} reason=grace-period age_seconds=${age_seconds}"
    continue
  fi

  reason="launcher-absent"
  if [ -d "${PROC_ROOT}/${launcher_pid}" ]; then
    actual_uid="$(awk '/^Uid:/ {print $2; exit}' "${PROC_ROOT}/${launcher_pid}/status" 2>/dev/null || true)"
    actual_start_ticks="$(awk '{print $22}' "${PROC_ROOT}/${launcher_pid}/stat" 2>/dev/null || true)"
    actual_cmdline="$(tr '\0' ' ' < "${PROC_ROOT}/${launcher_pid}/cmdline" 2>/dev/null || true)"
    if [ "${actual_uid}" = "${launcher_uid}" ] && \
       [ "${actual_start_ticks}" = "${launcher_start_ticks}" ] && \
       [[ "${actual_cmdline}" == *"socraticode-mcp.sh"* ]]; then
      echo "socraticode-cleanup: preserve name=${container_name} reason=launcher-live pid=${launcher_pid} role=${role}"
      continue
    fi
    reason="launcher-identity-mismatch"
  fi

  if [ "${MODE}" = "--dry-run" ]; then
    echo "socraticode-cleanup: would-remove name=${container_name} reason=${reason} age_seconds=${age_seconds} role=${role}"
    continue
  fi

  echo "socraticode-cleanup: remove name=${container_name} reason=${reason} age_seconds=${age_seconds} role=${role}"
  docker_mutate stop stop --time "${STOP_SECONDS}" "${container_name}" || true
  docker_mutate remove rm -f "${container_name}" || true
done < "${LIST_FILE}"
