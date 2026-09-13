#!/usr/bin/env bash

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REDIS_PREFLIGHT_NO_RUN=1 source "${ROOT}/scripts/redis-memory-preflight.sh"

assert_success() {
    "$@" >/dev/null
}

assert_failure() {
    if "$@" >/dev/null 2>&1; then
        echo "expected command to fail: $*" >&2
        exit 1
    fi
}

assert_success validate_budget_values 4G 4G 3gb noeviction
assert_failure validate_budget_values 512M 512M 3gb noeviction
assert_failure validate_budget_values 4G 4G 4G noeviction
assert_failure validate_budget_values 4G 4G 3gb allkeys-lru

FIXTURE_DOCKER="${ROOT}/scripts/tests/fixtures/docker"
chmod +x "${FIXTURE_DOCKER}"
SMARTSPEC_CRASH_MONITOR_NO_RUN=1 CRASH_MONITOR_DOCKER_BIN="${FIXTURE_DOCKER}" source "${ROOT}/scripts/system-crash-monitor.sh"

alerts=()
FAKE_DOCKER_INSPECT='restarting|true|137|14' record_docker_redis_memory_events
[[ "${alerts[0]}" == 'CRITICAL redis_container_oom container=smartspec-redis status=restarting exit=137 restarts=14' ]]

alerts=()
FAKE_DOCKER_INSPECT='running|false|0|0' record_docker_redis_memory_events
[[ "${#alerts[@]}" -eq 0 ]]

echo '[PASS] Redis memory protection shell tests'
