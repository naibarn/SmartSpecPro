#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DOCTOR="${ROOT}/scripts/celery-doctor.sh"
FAKE_DOCKER="${ROOT}/scripts/tests/fixtures/celery-doctor-docker"
TEST_DIR="$(mktemp -d)"
trap 'rm -rf "${TEST_DIR}"' EXIT

run_doctor() {
    FAKE_CELERY_DOCTOR_STATE_FILE="${TEST_DIR}/state" \
    FAKE_CELERY_DOCTOR_CALL_LOG="${TEST_DIR}/calls" \
    CELERY_DOCTOR_DOCKER_BIN="${FAKE_DOCKER}" \
    CELERY_DOCTOR_LOCK_FILE="${TEST_DIR}/doctor.lock" \
    CELERY_DOCTOR_COMPOSE_FILE="${ROOT}/docker-compose.media.yml" \
    "${DOCTOR}" --once
}

cp "${ROOT}/scripts/tests/fixtures/celery-doctor-healthy.state" "${TEST_DIR}/state"
: > "${TEST_DIR}/calls"
run_doctor >/dev/null
[[ ! -s "${TEST_DIR}/calls" ]]

cp "${ROOT}/scripts/tests/fixtures/celery-doctor-repair.state" "${TEST_DIR}/state"
: > "${TEST_DIR}/calls"
FAKE_CELERY_DOCTOR_FAIL_NORMAL=1 run_doctor >/dev/null
grep -q -- '--force-recreate celery-media' "${TEST_DIR}/calls"
grep -q -- '--force-recreate celery-beat' "${TEST_DIR}/calls"
grep -q '^smartspec-celery-media|running|' "${TEST_DIR}/state"
grep -q '^smartspec-celery-beat|running|' "${TEST_DIR}/state"

cp "${ROOT}/scripts/tests/fixtures/celery-doctor-foreign.state" "${TEST_DIR}/state"
: > "${TEST_DIR}/calls"
if run_doctor >/dev/null 2>&1; then
    echo 'expected foreign Compose project to be refused' >&2
    exit 1
fi
[[ ! -s "${TEST_DIR}/calls" ]]

cp "${ROOT}/scripts/tests/fixtures/celery-doctor-duplicate.state" "${TEST_DIR}/state"
: > "${TEST_DIR}/calls"
if run_doctor >/dev/null 2>&1; then
    echo 'expected duplicate Compose service to be refused' >&2
    exit 1
fi
[[ ! -s "${TEST_DIR}/calls" ]]

echo '[PASS] Celery media doctor shell tests'
