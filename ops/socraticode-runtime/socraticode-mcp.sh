#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${SOCRATICODE_PROJECT_ROOT:-/home/dev/projects/SmartSpecPro}"
IMAGE="${SOCRATICODE_MCP_IMAGE:-socraticode-mcp:1.8.11}"
DOCKER_BIN="${SOCRATICODE_DOCKER_BIN:-docker}"
CURL_BIN="${SOCRATICODE_CURL_BIN:-curl}"
FLOCK_BIN="${SOCRATICODE_FLOCK_BIN:-flock}"
CLEANUP_SCRIPT="${SOCRATICODE_CLEANUP_SCRIPT:-/home/dev/tools/socraticode-docker/socraticode-cleanup.sh}"
SLOT_DIR="${SOCRATICODE_SLOT_DIR:-/home/dev/tools/socraticode-docker/locks}"
QDRANT_MODE="external"
QDRANT_URL="http://192.168.1.119:16333"
OLLAMA_MODE="external"
OLLAMA_URL="http://192.168.1.119:11435"
EMBEDDING_PROVIDER="ollama"
EMBEDDING_MODEL="nomic-embed-text"
EMBEDDING_DIMENSIONS="768"
MCP_MEMORY_LIMIT="3g"
MCP_CGROUP_PARENT="socraticode.slice"
MCP_PIDS_LIMIT="256"
MAX_CONCURRENT_MCP=2
MCP_ROLE="${SOCRATICODE_MCP_ROLE:-interactive}"
DOCKER_TIMEOUT_SECONDS="${SOCRATICODE_DOCKER_TIMEOUT_SECONDS:-20}"
STOP_SECONDS="${SOCRATICODE_CONTAINER_STOP_SECONDS:-10}"
PROBE_TIMEOUT_SECONDS="${SOCRATICODE_PROBE_TIMEOUT_SECONDS:-5}"
ADMISSION_TIMEOUT_SECONDS="${SOCRATICODE_ADMISSION_TIMEOUT_SECONDS:-10}"
CONTAINER_READY_TIMEOUT_SECONDS="${SOCRATICODE_CONTAINER_READY_TIMEOUT_SECONDS:-10}"
CONTAINER_NAME="socraticode-mcp-$$"
LAUNCHER_PID="$$"
LAUNCHER_UID="$(id -u)"
LAUNCHER_START_TICKS="$(awk '{print $22}' "/proc/${LAUNCHER_PID}/stat")"
CREATED_EPOCH="$(date +%s)"

docker_pid=""
cleanup_started=0
container_started=0
slot_fd=""
admission_fd=""

umask 0077

acquire_slot() {
  local index candidate_fd

  mkdir -p -- "${SLOT_DIR}"
  for ((index = 1; index <= MAX_CONCURRENT_MCP; index += 1)); do
    exec {candidate_fd}> "${SLOT_DIR}/mcp-slot-${index}.lock"
    if "${FLOCK_BIN}" -n "${candidate_fd}"; then
      slot_fd="${candidate_fd}"
      return 0
    fi
    eval "exec ${candidate_fd}>&-"
  done

  echo "socraticode-mcp: maximum concurrent MCP sessions reached (${MAX_CONCURRENT_MCP}); refusing launch to protect server memory" >&2
  return 1
}

acquire_admission_lock() {
  mkdir -p -- "${SLOT_DIR}"
  exec {admission_fd}> "${SLOT_DIR}/mcp-admission.lock"
  if ! "${FLOCK_BIN}" -w "${ADMISSION_TIMEOUT_SECONDS}" "${admission_fd}"; then
    echo "socraticode-mcp: admission lock stayed busy for ${ADMISSION_TIMEOUT_SECONDS}s; refusing launch" >&2
    return 1
  fi
}

release_admission_lock() {
  if [ -z "${admission_fd}" ]; then
    return
  fi
  "${FLOCK_BIN}" -u "${admission_fd}" >/dev/null 2>&1 || true
  eval "exec ${admission_fd}>&-"
  admission_fd=""
}

external_failure() {
  local detail="$1"
  echo "socraticode-mcp: ${detail}; check firewall/ESET on 192.168.1.119. Local Qdrant/Ollama fallback on 192.168.1.124 is forbidden." >&2
}

preflight_external_services() {
  local url ollama_tags

  for url in "${QDRANT_URL}/" "${QDRANT_URL}/collections"; do
    if ! "${CURL_BIN}" -fsS \
      --connect-timeout "${PROBE_TIMEOUT_SECONDS}" \
      --max-time "${PROBE_TIMEOUT_SECONDS}" \
      "${url}" >/dev/null; then
      external_failure "external Qdrant is unavailable at ${url}"
      return 1
    fi
  done

  if ! ollama_tags="$("${CURL_BIN}" -fsS \
    --connect-timeout "${PROBE_TIMEOUT_SECONDS}" \
    --max-time "${PROBE_TIMEOUT_SECONDS}" \
    "${OLLAMA_URL}/api/tags")"; then
    external_failure "external Ollama is unavailable at ${OLLAMA_URL}/api/tags"
    return 1
  fi

  if ! grep -Eq \
    '"(name|model)"[[:space:]]*:[[:space:]]*"nomic-embed-text(:latest)?"' \
    <<< "${ollama_tags}"; then
    external_failure "external Ollama at ${OLLAMA_URL} does not provide ${EMBEDDING_MODEL}"
    return 1
  fi
}

count_running_managed_containers() {
  local output

  if ! output="$(timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" \
    "${DOCKER_BIN}" ps \
      --filter "label=com.smartspec.socraticode.managed=true" \
      --filter "label=com.smartspec.socraticode.project=${PROJECT_ROOT}" \
      --format '{{.Names}}')"; then
    echo "socraticode-mcp: failed to count managed MCP containers; refusing launch" >&2
    return 1
  fi

  awk 'NF { count += 1 } END { print count + 0 }' <<< "${output}"
}

wait_for_container_registration() {
  local deadline running_state
  deadline=$((SECONDS + CONTAINER_READY_TIMEOUT_SECONDS))

  while [ "${SECONDS}" -le "${deadline}" ]; do
    if running_state="$(timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" \
      "${DOCKER_BIN}" inspect \
        --format '{{.State.Running}}' \
        "${CONTAINER_NAME}" 2>/dev/null)"; then
      if [ "${running_state}" = "true" ]; then
        return 0
      fi
    fi
    if [ -n "${docker_pid}" ] && ! kill -0 "${docker_pid}" 2>/dev/null; then
      echo "socraticode-mcp: Docker exited before ${CONTAINER_NAME} registered; refusing admission" >&2
      return 1
    fi
    sleep 0.1
  done

  echo "socraticode-mcp: ${CONTAINER_NAME} did not register within ${CONTAINER_READY_TIMEOUT_SECONDS}s; refusing admission" >&2
  return 1
}

cleanup_owned_container() {
  if [ "${cleanup_started}" -eq 1 ]; then
    return
  fi
  cleanup_started=1
  exec 3<&- 2>/dev/null || true

  if [ "${container_started}" -ne 1 ]; then
    return
  fi

  if [ -n "${docker_pid}" ] && kill -0 "${docker_pid}" 2>/dev/null; then
    kill -TERM "${docker_pid}" 2>/dev/null || true
    wait "${docker_pid}" 2>/dev/null || true
  fi

  timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" "${DOCKER_BIN}" stop \
    --time "${STOP_SECONDS}" "${CONTAINER_NAME}" >/dev/null 2>&1 || true
  timeout --foreground "${DOCKER_TIMEOUT_SECONDS}s" "${DOCKER_BIN}" rm \
    -f "${CONTAINER_NAME}" >/dev/null 2>&1 || true
}

handle_signal() {
  local exit_code="$1"
  exit "${exit_code}"
}

trap cleanup_owned_container EXIT
trap 'handle_signal 129' HUP
trap 'handle_signal 130' INT
trap 'handle_signal 143' TERM

acquire_slot
preflight_external_services
acquire_admission_lock

if [ -x "${CLEANUP_SCRIPT}" ]; then
  SOCRATICODE_OWNED_CONTAINER="${CONTAINER_NAME}" \
    "${CLEANUP_SCRIPT}" --apply >&2 || \
    echo "socraticode-mcp: warning pre-launch cleanup failed; continuing fail-closed" >&2
else
  echo "socraticode-mcp: warning cleanup helper unavailable at ${CLEANUP_SCRIPT}" >&2
fi

managed_count="$(count_running_managed_containers)"
if [ "${managed_count}" -ge "${MAX_CONCURRENT_MCP}" ]; then
  echo "socraticode-mcp: managed MCP containers already running (${managed_count}); maximum is ${MAX_CONCURRENT_MCP}" >&2
  exit 75
fi

# Bash background jobs otherwise inherit /dev/null for stdin. Preserve the MCP
# client's stdio on fd 3 so the wrapper can stay alive to own signal cleanup.
exec 3<&0
"${DOCKER_BIN}" run --rm -i \
  --name "${CONTAINER_NAME}" \
  --label "com.smartspec.socraticode.managed=true" \
  --label "com.smartspec.socraticode.project=${PROJECT_ROOT}" \
  --label "com.smartspec.socraticode.launcher_pid=${LAUNCHER_PID}" \
  --label "com.smartspec.socraticode.launcher_uid=${LAUNCHER_UID}" \
  --label "com.smartspec.socraticode.launcher_start_ticks=${LAUNCHER_START_TICKS}" \
  --label "com.smartspec.socraticode.role=${MCP_ROLE}" \
  --label "com.smartspec.socraticode.created_epoch=${CREATED_EPOCH}" \
  --label "com.smartspec.socraticode.external_only=true" \
  --network host \
  --cgroup-parent="${MCP_CGROUP_PARENT}" \
  --memory="${MCP_MEMORY_LIMIT}" \
  --memory-swap="${MCP_MEMORY_LIMIT}" \
  --pids-limit="${MCP_PIDS_LIMIT}" \
  -v /home/dev/tools/socraticode-docker/locks:/tmp/socraticode-locks \
  -v "${PROJECT_ROOT}:${PROJECT_ROOT}" \
  -w "${PROJECT_ROOT}" \
  -e SOCRATICODE_LOG_LEVEL="${SOCRATICODE_LOG_LEVEL:-info}" \
  -e QDRANT_MODE="${QDRANT_MODE}" \
  -e QDRANT_URL="${QDRANT_URL}" \
  -e EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER}" \
  -e OLLAMA_MODE="${OLLAMA_MODE}" \
  -e OLLAMA_URL="${OLLAMA_URL}" \
  -e EMBEDDING_MODEL="${EMBEDDING_MODEL}" \
  -e EMBEDDING_DIMENSIONS="${EMBEDDING_DIMENSIONS}" \
  "${IMAGE}" <&3 &
docker_pid=$!
container_started=1

if ! wait_for_container_registration; then
  exit 70
fi
release_admission_lock

set +e
wait "${docker_pid}"
docker_rc=$?
set -e
docker_pid=""
exit "${docker_rc}"
