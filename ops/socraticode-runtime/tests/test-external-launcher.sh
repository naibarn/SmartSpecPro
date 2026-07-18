#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LAUNCHER_SCRIPT="${ROOT_DIR}/socraticode-mcp.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

FAKE_DOCKER="${TMP_DIR}/fake-docker"
FAKE_CURL="${TMP_DIR}/fake-curl"
FAKE_FLOCK="${TMP_DIR}/fake-flock"
FAKE_CLEANUP="${TMP_DIR}/fake-cleanup"
DOCKER_ACTIONS="${TMP_DIR}/docker-actions.log"
CURL_ACTIONS="${TMP_DIR}/curl-actions.log"
FLOCK_ACTIONS="${TMP_DIR}/flock-actions.log"
CLEANUP_ACTIONS="${TMP_DIR}/cleanup-actions.log"
PROJECT_ROOT="/home/dev/projects/SmartSpecPro"

reset_logs() {
  : > "${DOCKER_ACTIONS}"
  : > "${CURL_ACTIONS}"
  : > "${FLOCK_ACTIONS}"
  : > "${CLEANUP_ACTIONS}"
}

cat > "${FAKE_DOCKER}" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"
shift || true
printf '%s %s\n' "${command}" "$*" >> "${FAKE_DOCKER_ACTIONS}"

case "${command}" in
  ps)
    count="${FAKE_DOCKER_RUNNING_COUNT:-0}"
    for ((index = 1; index <= count; index += 1)); do
      printf 'socraticode-mcp-existing-%s\n' "${index}"
    done
    ;;
  inspect)
    printf 'true\n'
    ;;
  run|stop|rm)
    ;;
  *)
    printf 'unexpected fake docker command: %s %s\n' "${command}" "$*" >&2
    exit 64
    ;;
esac
FAKE

cat > "${FAKE_CURL}" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail

url="${*: -1}"
printf '%s\n' "${url}" >> "${FAKE_CURL_ACTIONS}"

if [[ -n "${FAKE_CURL_FAIL_PATTERN:-}" && "${url}" == *"${FAKE_CURL_FAIL_PATTERN}"* ]]; then
  exit 7
fi

case "${url}" in
  */api/tags)
    printf '%s\n' "${FAKE_OLLAMA_TAGS:-{\"models\":[{\"name\":\"nomic-embed-text:latest\"}]}}"
    ;;
  *)
    printf '{"status":"ok"}\n'
    ;;
esac
FAKE

cat > "${FAKE_FLOCK}" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_FLOCK_ACTIONS}"
if [[ "${FAKE_FLOCK_FAIL:-0}" == "1" && "${1:-}" == "-n" ]]; then
  exit 1
fi
FAKE

cat > "${FAKE_CLEANUP}" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "${FAKE_CLEANUP_ACTIONS}"
FAKE

chmod +x "${FAKE_DOCKER}" "${FAKE_CURL}" "${FAKE_FLOCK}" "${FAKE_CLEANUP}"

run_launcher() {
  local output_file="$1"
  shift

  env \
    SOCRATICODE_DOCKER_BIN="${FAKE_DOCKER}" \
    SOCRATICODE_CURL_BIN="${FAKE_CURL}" \
    SOCRATICODE_FLOCK_BIN="${FAKE_FLOCK}" \
    SOCRATICODE_CLEANUP_SCRIPT="${FAKE_CLEANUP}" \
    SOCRATICODE_SLOT_DIR="${TMP_DIR}/slots" \
    SOCRATICODE_PROJECT_ROOT="${PROJECT_ROOT}" \
    SOCRATICODE_DOCKER_TIMEOUT_SECONDS=1 \
    SOCRATICODE_CONTAINER_STOP_SECONDS=1 \
    FAKE_DOCKER_ACTIONS="${DOCKER_ACTIONS}" \
    FAKE_CURL_ACTIONS="${CURL_ACTIONS}" \
    FAKE_FLOCK_ACTIONS="${FLOCK_ACTIONS}" \
    FAKE_CLEANUP_ACTIONS="${CLEANUP_ACTIONS}" \
    "$@" \
    bash "${LAUNCHER_SCRIPT}" < /dev/null > "${output_file}" 2>&1
}

assert_contains() {
  local file="$1" pattern="$2"
  grep -Eq -- "${pattern}" "${file}" || {
    printf 'missing pattern %s in %s:\n' "${pattern}" "${file}" >&2
    sed -n '1,200p' "${file}" >&2
    exit 1
  }
}

assert_not_contains() {
  local file="$1" pattern="$2"
  if grep -Eq -- "${pattern}" "${file}"; then
    printf 'unexpected pattern %s in %s:\n' "${pattern}" "${file}" >&2
    sed -n '1,200p' "${file}" >&2
    exit 1
  fi
}

reset_logs
run_launcher "${TMP_DIR}/success.out"
assert_contains "${CURL_ACTIONS}" '^http://192\.168\.1\.119:16333/$'
assert_contains "${CURL_ACTIONS}" '^http://192\.168\.1\.119:16333/collections$'
assert_contains "${CURL_ACTIONS}" '^http://192\.168\.1\.119:11435/api/tags$'
assert_contains "${DOCKER_ACTIONS}" 'run .*--memory=3g'
assert_contains "${DOCKER_ACTIONS}" 'run .*--memory-swap=3g'
assert_contains "${DOCKER_ACTIONS}" 'run .*--pids-limit=256'
assert_contains "${DOCKER_ACTIONS}" 'run .*--cgroup-parent=socraticode\.slice'
assert_contains "${DOCKER_ACTIONS}" 'run .*-e QDRANT_MODE=external'
assert_contains "${DOCKER_ACTIONS}" 'run .*-e QDRANT_URL=http://192\.168\.1\.119:16333'
assert_contains "${DOCKER_ACTIONS}" 'run .*-e OLLAMA_MODE=external'
assert_contains "${DOCKER_ACTIONS}" 'run .*-e OLLAMA_URL=http://192\.168\.1\.119:11435'
assert_not_contains "${DOCKER_ACTIONS}" '/var/run/docker\.sock'
assert_not_contains "${DOCKER_ACTIONS}" '--group-add'
assert_contains "${FLOCK_ACTIONS}" '^-n [0-9]+$'
assert_contains "${FLOCK_ACTIONS}" '^-w [0-9]+ [0-9]+$'
assert_contains "${FLOCK_ACTIONS}" '^-u [0-9]+$'
assert_contains "${CLEANUP_ACTIONS}" '^--apply$'
assert_contains "${DOCKER_ACTIONS}" '^inspect .*socraticode-mcp-[0-9]+$'

reset_logs
if run_launcher "${TMP_DIR}/qdrant-failure.out" \
  FAKE_CURL_FAIL_PATTERN='192.168.1.119:16333'; then
  echo "expected Qdrant preflight failure" >&2
  exit 1
fi
assert_contains "${TMP_DIR}/qdrant-failure.out" 'firewall/ESET.*192\.168\.1\.119'
assert_not_contains "${DOCKER_ACTIONS}" '^run '
test ! -s "${CLEANUP_ACTIONS}"

reset_logs
if run_launcher "${TMP_DIR}/ollama-failure.out" \
  FAKE_CURL_FAIL_PATTERN='192.168.1.119:11435'; then
  echo "expected Ollama preflight failure" >&2
  exit 1
fi
assert_contains "${TMP_DIR}/ollama-failure.out" 'firewall/ESET.*192\.168\.1\.119'
assert_not_contains "${DOCKER_ACTIONS}" '^run '
test ! -s "${CLEANUP_ACTIONS}"

reset_logs
if run_launcher "${TMP_DIR}/missing-model.out" \
  FAKE_OLLAMA_TAGS='{"models":[]}'; then
  echo "expected missing-model preflight failure" >&2
  exit 1
fi
assert_contains "${TMP_DIR}/missing-model.out" 'nomic-embed-text'
assert_contains "${TMP_DIR}/missing-model.out" 'firewall/ESET.*192\.168\.1\.119'
assert_not_contains "${DOCKER_ACTIONS}" '^run '
test ! -s "${CLEANUP_ACTIONS}"

reset_logs
if run_launcher "${TMP_DIR}/slots-full.out" FAKE_FLOCK_FAIL=1; then
  echo "expected slot exhaustion failure" >&2
  exit 1
fi
assert_contains "${TMP_DIR}/slots-full.out" 'maximum concurrent MCP sessions.*2'
assert_not_contains "${DOCKER_ACTIONS}" '^run '
test ! -s "${CURL_ACTIONS}"
test ! -s "${CLEANUP_ACTIONS}"

reset_logs
if run_launcher "${TMP_DIR}/managed-full.out" FAKE_DOCKER_RUNNING_COUNT=2; then
  echo "expected managed-container admission failure" >&2
  exit 1
fi
assert_contains "${TMP_DIR}/managed-full.out" 'managed MCP containers already running.*2'
assert_not_contains "${DOCKER_ACTIONS}" '^run '

echo "external launcher tests: PASS"
