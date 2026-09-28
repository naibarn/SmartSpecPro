#!/usr/bin/env bash

# Read-only Redis resource/RDB preflight for the active infrastructure stack.
# This script must never flush Redis, alter the named volume, or recreate a
# container. It is safe to run while Redis is restarting.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${REDIS_PREFLIGHT_COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.infra.yml}"
COMPOSE_PROJECT="${REDIS_PREFLIGHT_PROJECT:-smartspecpro}"
REDIS_VOLUME="${REDIS_PREFLIGHT_VOLUME:-smartspec_redis_data}"
REDIS_IMAGE="${REDIS_PREFLIGHT_IMAGE:-redis:7-alpine}"
DOCKER_BIN="${REDIS_PREFLIGHT_DOCKER_BIN:-docker}"

fail() {
    echo "[FAIL] $*" >&2
    return 1
}

warn() {
    echo "[WARN] $*" >&2
}

parse_memory_bytes() {
    local raw="${1:-}" number suffix multiplier
    raw="${raw,,}"
    raw="${raw//[[:space:]]/}"
    if [[ ! "${raw}" =~ ^([0-9]+)(b|k|kb|m|mb|g|gb|t|tb)?$ ]]; then
        return 1
    fi
    number="${BASH_REMATCH[1]}"
    suffix="${BASH_REMATCH[2]:-b}"
    case "${suffix}" in
        b) multiplier=1 ;;
        k|kb) multiplier=1024 ;;
        m|mb) multiplier=$((1024 ** 2)) ;;
        g|gb) multiplier=$((1024 ** 3)) ;;
        t|tb) multiplier=$((1024 ** 4)) ;;
    esac
    printf '%s\n' "$((number * multiplier))"
}

validate_budget_values() {
    local memory_limit="${1:-}" swap_limit="${2:-}" maxmemory="${3:-}" policy="${4:-}"
    local memory_bytes swap_bytes maxmemory_bytes
    memory_bytes="$(parse_memory_bytes "${memory_limit}")" || { echo "invalid memory limit: ${memory_limit}" >&2; return 1; }
    swap_bytes="$(parse_memory_bytes "${swap_limit}")" || { echo "invalid swap limit: ${swap_limit}" >&2; return 1; }
    maxmemory_bytes="$(parse_memory_bytes "${maxmemory}")" || { echo "invalid maxmemory: ${maxmemory}" >&2; return 1; }

    [ "${swap_bytes}" -ge "${memory_bytes}" ] || { echo "swap limit must be >= memory limit" >&2; return 1; }
    [ "${maxmemory_bytes}" -lt "${memory_bytes}" ] || { echo "Redis maxmemory must be below cgroup memory limit" >&2; return 1; }
    [ "${policy,,}" = "noeviction" ] || { echo "Redis policy must be noeviction" >&2; return 1; }
}

read_compose_budget() {
    local rendered_json="$1"
    python3 -c '
import json, shlex, sys

data = json.load(sys.stdin)
service = data["services"]["redis"]
limits = service.get("deploy", {}).get("resources", {}).get("limits", {})
memory = limits.get("memory", "")
swap = service.get("memswap_limit", "")
volume_def = data.get("volumes", {}).get("redis_data", {})
volume_name = volume_def.get("name", "") if isinstance(volume_def, dict) else ""
command = service.get("command", [])
if isinstance(command, str):
    command = shlex.split(command)
maxmemory = ""
policy = ""
for index, item in enumerate(command):
    if item == "--maxmemory" and index + 1 < len(command):
        maxmemory = command[index + 1]
    if item == "--maxmemory-policy" and index + 1 < len(command):
        policy = command[index + 1]
print("\t".join((str(memory), str(swap), str(maxmemory), str(policy), str(volume_name))))
' <<<"${rendered_json}"
}

check_rdb() {
    local maxmemory_bytes="${1:-0}" output used_mem
    if ! "${DOCKER_BIN}" volume inspect "${REDIS_VOLUME}" >/dev/null 2>&1; then
        fail "Redis volume ${REDIS_VOLUME} does not exist; refusing to proceed without an explicit data decision"
    fi

    output="$("${DOCKER_BIN}" run --rm --network none --mount "type=volume,source=${REDIS_VOLUME},target=/data,readonly" "${REDIS_IMAGE}" sh -c 'if [ ! -f /data/dump.rdb ]; then echo NO_RDB; exit 0; fi; exec redis-check-rdb /data/dump.rdb' 2>&1)" || {
        printf '%s\n' "${output}" | tail -40 >&2
        fail "Redis RDB integrity check failed"
    }
    printf '%s\n' "${output}" | tail -40
    if printf '%s\n' "${output}" | grep -q '^NO_RDB$'; then
        warn "No /data/dump.rdb found; verify persistence format before rollout"
    fi
    used_mem="$(printf '%s\n' "${output}" | sed -n "s/.*used-mem = '\\([0-9][0-9]*\\)'.*/\\1/p" | tail -1)"
    if [ -n "${used_mem}" ]; then
        printf 'rdb_used_mem_bytes=%s\n' "${used_mem}"
        if [ "${maxmemory_bytes}" -gt 0 ] && [ "${used_mem}" -ge "${maxmemory_bytes}" ]; then
            fail "RDB used memory ${used_mem} is at or above Redis maxmemory ${maxmemory_bytes}"
        fi
    fi
}

main() {
    [ "${1:-}" = "--read-only" ] || { echo "Usage: $0 --read-only" >&2; return 2; }
    command -v "${DOCKER_BIN}" >/dev/null 2>&1 || fail "Docker CLI is unavailable"
    [ -f "${COMPOSE_FILE}" ] || fail "Compose file not found: ${COMPOSE_FILE}"

    local rendered_json budget memory_limit swap_limit maxmemory policy configured_volume maxmemory_bytes
    rendered_json="$("${DOCKER_BIN}" compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" config --format json)"
    budget="$(read_compose_budget "${rendered_json}")"
    IFS=$'\t' read -r memory_limit swap_limit maxmemory policy configured_volume <<<"${budget}"
    validate_budget_values "${memory_limit}" "${swap_limit}" "${maxmemory}" "${policy}" || return 1
    [ "${configured_volume}" = "${REDIS_VOLUME}" ] || fail "Compose Redis volume ${configured_volume:-<unset>} does not match expected ${REDIS_VOLUME}"
    maxmemory_bytes="$(parse_memory_bytes "${maxmemory}")"

    printf 'compose=%s\nredis_memory_limit=%s\nredis_swap_limit=%s\nredis_maxmemory=%s\nredis_policy=%s\nvolume=%s\n' \
        "${COMPOSE_FILE}" "${memory_limit}" "${swap_limit}" "${maxmemory}" "${policy}" "${REDIS_VOLUME}"
    check_rdb "${maxmemory_bytes}"
    echo '[PASS] Redis resource and RDB preflight completed read-only'
}

if [ "${REDIS_PREFLIGHT_NO_RUN:-0}" != "1" ]; then
    main "$@"
fi
