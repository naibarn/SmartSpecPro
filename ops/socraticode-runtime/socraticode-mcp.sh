#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="${SOCRATICODE_PROJECT_ROOT:-/home/dev/projects/SmartSpecPro}"
IMAGE="${SOCRATICODE_MCP_IMAGE:-socraticode-mcp:1.8.11}"
DOCKER_BIN="${SOCRATICODE_DOCKER_BIN:-docker}"
CLEANUP_SCRIPT="${SOCRATICODE_CLEANUP_SCRIPT:-/home/dev/tools/socraticode-docker/socraticode-cleanup.sh}"
SOCKET_GID="$(stat -c '%g' /var/run/docker.sock 2>/dev/null || printf '0')"
EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER:-ollama}"
OLLAMA_MODE="${OLLAMA_MODE:-external}"
OLLAMA_URL="${OLLAMA_URL:-http://192.168.1.119:11434}"
EMBEDDING_MODEL="${EMBEDDING_MODEL:-nomic-embed-text}"
EMBEDDING_DIMENSIONS="${EMBEDDING_DIMENSIONS:-768}"
MCP_MEMORY_LIMIT="${SOCRATICODE_MCP_MEMORY_LIMIT:-4g}"
MCP_CGROUP_PARENT="${SOCRATICODE_MCP_CGROUP_PARENT:-system-smartspec-agent.slice}"
MCP_PIDS_LIMIT="${SOCRATICODE_MCP_PIDS_LIMIT:-256}"
MCP_ROLE="${SOCRATICODE_MCP_ROLE:-interactive}"
DOCKER_TIMEOUT_SECONDS="${SOCRATICODE_DOCKER_TIMEOUT_SECONDS:-20}"
STOP_SECONDS="${SOCRATICODE_CONTAINER_STOP_SECONDS:-10}"
CONTAINER_NAME="socraticode-mcp-$$"
LAUNCHER_PID="$$"
LAUNCHER_UID="$(id -u)"
LAUNCHER_START_TICKS="$(awk '{print $22}' "/proc/${LAUNCHER_PID}/stat")"
CREATED_EPOCH="$(date +%s)"

docker_pid=""
cleanup_started=0

cleanup_owned_container() {
  if [ "${cleanup_started}" -eq 1 ]; then
    return
  fi
  cleanup_started=1
  exec 3<&- 2>/dev/null || true

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

if [ -x "${CLEANUP_SCRIPT}" ]; then
  SOCRATICODE_OWNED_CONTAINER="${CONTAINER_NAME}" \
    "${CLEANUP_SCRIPT}" --apply >&2 || \
    echo "socraticode-mcp: warning pre-launch cleanup failed; continuing fail-closed" >&2
else
  echo "socraticode-mcp: warning cleanup helper unavailable at ${CLEANUP_SCRIPT}" >&2
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
  --network host \
  --cgroup-parent="${MCP_CGROUP_PARENT}" \
  --memory="${MCP_MEMORY_LIMIT}" \
  --memory-swap="${MCP_MEMORY_LIMIT}" \
  --pids-limit="${MCP_PIDS_LIMIT}" \
  --group-add "${SOCKET_GID}" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/dev/tools/socraticode-docker/locks:/tmp/socraticode-locks \
  -v "${PROJECT_ROOT}:${PROJECT_ROOT}" \
  -w "${PROJECT_ROOT}" \
  -e SOCRATICODE_LOG_LEVEL="${SOCRATICODE_LOG_LEVEL:-info}" \
  -e EMBEDDING_PROVIDER="${EMBEDDING_PROVIDER}" \
  -e OLLAMA_MODE="${OLLAMA_MODE}" \
  -e OLLAMA_URL="${OLLAMA_URL}" \
  -e EMBEDDING_MODEL="${EMBEDDING_MODEL}" \
  -e EMBEDDING_DIMENSIONS="${EMBEDDING_DIMENSIONS}" \
  "${IMAGE}" <&3 &
docker_pid=$!

set +e
wait "${docker_pid}"
docker_rc=$?
set -e
docker_pid=""
exit "${docker_rc}"
