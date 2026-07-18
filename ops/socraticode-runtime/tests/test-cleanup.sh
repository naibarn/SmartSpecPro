#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLEANUP_SCRIPT="${ROOT_DIR}/socraticode-cleanup.sh"
LAUNCHER_SCRIPT="${ROOT_DIR}/socraticode-mcp.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "${TMP_DIR}"' EXIT

FAKE_DOCKER="${TMP_DIR}/fake-docker"
FAKE_CURL="${TMP_DIR}/fake-curl"
STATE_FILE="${TMP_DIR}/containers.tsv"
ACTIONS_FILE="${TMP_DIR}/actions.log"
PROC_ROOT="${TMP_DIR}/proc"
PROJECT_ROOT="/home/dev/projects/SmartSpecPro"
NOW=2000000000
UID_NOW="$(id -u)"

mkdir -p "${PROC_ROOT}"
: > "${STATE_FILE}"
: > "${ACTIONS_FILE}"

cat > "${FAKE_DOCKER}" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail

command="${1:-}"
shift || true
case "${command}" in
  ps)
    if [ "${FAKE_DOCKER_SLEEP_PS:-0}" = "1" ]; then
      sleep 2
    fi
    awk -F '\t' 'NF >= 2 {print $1 "|" $2}' "${FAKE_DOCKER_STATE}"
    ;;
  inspect)
    if [[ "$*" == *".State.Running"* ]]; then
      printf 'true\n'
      exit 0
    fi
    id="${*: -1}"
    awk -F '\t' -v wanted="${id}" '$1 == wanted {print $3 "|" $4 "|" $5 "|" $6 "|" $7 "|" $8 "|" $9}' "${FAKE_DOCKER_STATE}"
    ;;
  stop|rm)
    printf '%s %s\n' "${command}" "${*: -1}" >> "${FAKE_DOCKER_ACTIONS}"
    ;;
  run)
    printf 'run %s\n' "$*" >> "${FAKE_DOCKER_ACTIONS}"
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
case "${*: -1}" in
  */api/tags)
    printf '{"models":[{"name":"nomic-embed-text:latest"}]}\n'
    ;;
  *)
    printf '{"status":"ok"}\n'
    ;;
esac
FAKE

chmod +x "${FAKE_DOCKER}" "${FAKE_CURL}"

write_state() {
  : > "${STATE_FILE}"
  printf '%s\n' "$@" >> "${STATE_FILE}"
  : > "${ACTIONS_FILE}"
}

write_proc() {
  local pid="$1" uid="$2" start_ticks="$3" command_line="$4" field
  mkdir -p "${PROC_ROOT}/${pid}"
  printf '%s\0' "${command_line}" > "${PROC_ROOT}/${pid}/cmdline"
  printf 'Uid:\t%s\t%s\t%s\t%s\n' "${uid}" "${uid}" "${uid}" "${uid}" > "${PROC_ROOT}/${pid}/status"
  printf '%s (bash) S' "${pid}" > "${PROC_ROOT}/${pid}/stat"
  for field in $(seq 4 21); do
    printf ' 0' >> "${PROC_ROOT}/${pid}/stat"
  done
  printf ' %s 0 0\n' "${start_ticks}" >> "${PROC_ROOT}/${pid}/stat"
}

reset_proc() {
  rm -rf -- "${PROC_ROOT}"
  mkdir -p "${PROC_ROOT}"
}

run_cleanup() {
  env \
    SOCRATICODE_DOCKER_BIN="${FAKE_DOCKER}" \
    SOCRATICODE_PROC_ROOT="${PROC_ROOT}" \
    SOCRATICODE_PROJECT_ROOT="${PROJECT_ROOT}" \
    SOCRATICODE_NOW_EPOCH="${NOW}" \
    SOCRATICODE_ORPHAN_GRACE_SECONDS=900 \
    SOCRATICODE_DOCKER_TIMEOUT_SECONDS="${SOCRATICODE_DOCKER_TIMEOUT_SECONDS:-1}" \
    SOCRATICODE_CLEANUP_LOCK="${TMP_DIR}/cleanup.lock" \
    FAKE_DOCKER_STATE="${STATE_FILE}" \
    FAKE_DOCKER_ACTIONS="${ACTIONS_FILE}" \
    FAKE_DOCKER_SLEEP_PS="${FAKE_DOCKER_SLEEP_PS:-0}" \
    SOCRATICODE_OWNED_CONTAINER="${SOCRATICODE_OWNED_CONTAINER:-}" \
    bash "${CLEANUP_SCRIPT}" "$@"
}

assert_empty_actions() {
  if [ -s "${ACTIONS_FILE}" ]; then
    echo "expected no Docker mutations, got:" >&2
    cat "${ACTIONS_FILE}" >&2
    exit 1
  fi
}

assert_action() {
  local pattern="$1"
  grep -Eq "${pattern}" "${ACTIONS_FILE}" || {
    echo "missing action pattern: ${pattern}" >&2
    cat "${ACTIONS_FILE}" >&2
    exit 1
  }
}

reset_proc
write_proc 123 "${UID_NOW}" 999 "/bin/bash ${ROOT_DIR}/socraticode-mcp.sh"
write_state $'c-live\tsocraticode-mcp-123\ttrue\t'"${PROJECT_ROOT}"$'\t123\t'"${UID_NOW}"$'\t999\tinteractive\t1999998000'
run_cleanup --apply > "${TMP_DIR}/live.out"
assert_empty_actions
grep -q 'preserve.*launcher-live' "${TMP_DIR}/live.out"

reset_proc
write_state $'c-orphan\tsocraticode-mcp-124\ttrue\t'"${PROJECT_ROOT}"$'\t124\t'"${UID_NOW}"$'\t111\tinteractive\t1999998000'
run_cleanup --dry-run > "${TMP_DIR}/dry-run.out"
assert_empty_actions
grep -q 'would-remove.*launcher-absent' "${TMP_DIR}/dry-run.out"

run_cleanup --apply > "${TMP_DIR}/apply.out"
assert_action '^stop socraticode-mcp-124$'
assert_action '^rm socraticode-mcp-124$'

reset_proc
write_proc 125 "${UID_NOW}" 777 "/bin/bash ${ROOT_DIR}/socraticode-mcp.sh"
write_state $'c-reused\tsocraticode-mcp-125\ttrue\t'"${PROJECT_ROOT}"$'\t125\t'"${UID_NOW}"$'\t222\tinteractive\t1999998000'
run_cleanup --apply > "${TMP_DIR}/reused.out"
assert_action '^rm socraticode-mcp-125$'
grep -q 'remove.*launcher-identity-mismatch' "${TMP_DIR}/reused.out"

reset_proc
write_state $'c-owned\tsocraticode-mcp-126\ttrue\t'"${PROJECT_ROOT}"$'\t126\t'"${UID_NOW}"$'\t333\tinteractive\t1999998000'
SOCRATICODE_OWNED_CONTAINER=socraticode-mcp-126 run_cleanup --apply > "${TMP_DIR}/owned.out"
assert_empty_actions
grep -q 'preserve.*caller-owned' "${TMP_DIR}/owned.out"

reset_proc
write_state $'c-legacy\tsocraticode-mcp-127\tfalse\t\t\t\t\tlegacy\t1999998000'
run_cleanup --apply > "${TMP_DIR}/legacy.out"
assert_empty_actions
grep -q 'legacy-unmanaged' "${TMP_DIR}/legacy.out"

reset_proc
write_state $'c-malformed\tsocraticode-mcp-128\ttrue\t'"${PROJECT_ROOT}"$'\t128\t'"${UID_NOW}"$'\t444\tinteractive\tnot-a-time'
run_cleanup --apply > "${TMP_DIR}/malformed.out"
assert_empty_actions
grep -q 'preserve.*invalid-metadata' "${TMP_DIR}/malformed.out"

reset_proc
write_state $'c-young\tsocraticode-mcp-1281\ttrue\t'"${PROJECT_ROOT}"$'\t1281\t'"${UID_NOW}"$'\t445\tinteractive\t1999999500'
run_cleanup --apply > "${TMP_DIR}/young.out"
assert_empty_actions
grep -q 'preserve.*grace-period' "${TMP_DIR}/young.out"

reset_proc
write_state $'c-other\tsocraticode-mcp-1282\ttrue\t/another/project\t1282\t'"${UID_NOW}"$'\t446\tinteractive\t1999998000'
run_cleanup --apply > "${TMP_DIR}/other-project.out"
assert_empty_actions
grep -q 'preserve.*project-mismatch' "${TMP_DIR}/other-project.out"

reset_proc
write_state $'c-timeout\tsocraticode-mcp-129\ttrue\t'"${PROJECT_ROOT}"$'\t129\t'"${UID_NOW}"$'\t555\tinteractive\t1999998000'
FAKE_DOCKER_SLEEP_PS=1 run_cleanup --apply > "${TMP_DIR}/timeout.out" 2>&1
assert_empty_actions
grep -q 'docker-list-timeout' "${TMP_DIR}/timeout.out"

reset_proc
write_state
env \
  SOCRATICODE_DOCKER_BIN="${FAKE_DOCKER}" \
  SOCRATICODE_CURL_BIN="${FAKE_CURL}" \
  SOCRATICODE_CLEANUP_SCRIPT="${CLEANUP_SCRIPT}" \
  SOCRATICODE_PROJECT_ROOT="${PROJECT_ROOT}" \
  SOCRATICODE_SLOT_DIR="${TMP_DIR}/launcher-slots" \
  SOCRATICODE_PROC_ROOT="${PROC_ROOT}" \
  SOCRATICODE_NOW_EPOCH="${NOW}" \
  SOCRATICODE_CLEANUP_LOCK="${TMP_DIR}/cleanup.lock" \
  SOCRATICODE_DOCKER_TIMEOUT_SECONDS=1 \
  SOCRATICODE_CONTAINER_STOP_SECONDS=1 \
  SOCRATICODE_MCP_ROLE=test \
  FAKE_DOCKER_STATE="${STATE_FILE}" \
  FAKE_DOCKER_ACTIONS="${ACTIONS_FILE}" \
  bash "${LAUNCHER_SCRIPT}" < /dev/null > "${TMP_DIR}/launcher.out" 2>&1
assert_action '^run .*com\.smartspec\.socraticode\.managed=true'
assert_action '^rm socraticode-mcp-[0-9]+$'

echo "cleanup lifecycle tests: PASS"
