#!/usr/bin/env bash

# SmartSpecPro Celery media self-healing doctor.
#
# The doctor deliberately repairs only the two managed service containers that
# can stop media admission/recovery. It never performs a broad `docker rm`,
# `compose down`, database mutation, credit mutation, or provider retry.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${CELERY_DOCTOR_COMPOSE_FILE:-${PROJECT_ROOT}/docker-compose.media.yml}"
COMPOSE_PROJECT="${CELERY_DOCTOR_COMPOSE_PROJECT:-smartspecpro}"
DOCKER_BIN="${CELERY_DOCTOR_DOCKER_BIN:-docker}"
INTERVAL_SECONDS="${CELERY_DOCTOR_INTERVAL_SECONDS:-30}"
LOCK_FILE="${CELERY_DOCTOR_LOCK_FILE:-${TMPDIR:-/tmp}/smartspec-celery-doctor.lock}"

MEDIA_SERVICE="celery-media"
MEDIA_CONTAINER="smartspec-celery-media"
BEAT_SERVICE="celery-beat"
BEAT_CONTAINER="smartspec-celery-beat"

log() {
    printf '[%s] %s\n' "$(date '+%Y-%m-%d %T %z')" "$*"
}

container_state() {
    "${DOCKER_BIN}" inspect --format '{{.State.Status}}' "$1" 2>/dev/null || printf 'missing\n'
}

container_project() {
    "${DOCKER_BIN}" inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$1" 2>/dev/null || printf 'missing\n'
}

container_health() {
    "${DOCKER_BIN}" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" 2>/dev/null || printf 'missing\n'
}

service_candidate_count() {
    local service="$1"
    local output
    output="$(${DOCKER_BIN} ps -a --filter "label=com.docker.compose.service=${service}" --format '{{.ID}}' 2>/dev/null || true)"
    if [[ -z "${output}" ]]; then
        printf '0\n'
    else
        printf '%s\n' "${output}" | awk 'NF { count++ } END { print count + 0 }'
    fi
}

ensure_managed_container() {
    local service="$1"
    local container="$2"
    local state project health

    local candidate_count
    candidate_count="$(service_candidate_count "${service}")"
    if [[ "${candidate_count}" -gt 1 ]]; then
        log "CRITICAL refusing repair: ${service} has ${candidate_count} Compose containers; manual duplicate review required"
        return 1
    fi

    state="$(container_state "${container}")"
    project="$(container_project "${container}")"

    if [[ "${state}" != "missing" && "${project}" != "${COMPOSE_PROJECT}" ]]; then
        log "CRITICAL refusing repair: ${container} belongs to Compose project ${project}, expected ${COMPOSE_PROJECT}"
        return 1
    fi

    if [[ "${state}" == "running" ]]; then
        health="$(container_health "${container}")"
        if [[ "${health}" == "unhealthy" ]]; then
            # Do not interrupt a possibly in-flight provider request. The
            # container restart policy and the next doctor pass handle a
            # stopped process; an unhealthy running process is observable.
            log "WARN ${container} is running but unhealthy; no forced restart"
        else
            log "OK ${container} is running (health=${health})"
        fi
        return 0
    fi

    log "WARN ${container} is ${state}; starting ${service}"
    if ! "${DOCKER_BIN}" compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d --no-deps "${service}"; then
        log "WARN normal start failed for ${service}; attempting exact-service recreate"
        if ! "${DOCKER_BIN}" compose -p "${COMPOSE_PROJECT}" -f "${COMPOSE_FILE}" up -d --no-deps --force-recreate "${service}"; then
            log "CRITICAL failed to repair ${service}"
            return 1
        fi
    fi

    state="$(container_state "${container}")"
    if [[ "${state}" != "running" ]]; then
        log "CRITICAL ${container} remains ${state} after repair"
        return 1
    fi

    log "RECOVERED ${container}"
}

check_once() {
    if ! "${DOCKER_BIN}" info >/dev/null 2>&1; then
        log "CRITICAL Docker daemon is unavailable"
        return 1
    fi

    local failed=0
    ensure_managed_container "${MEDIA_SERVICE}" "${MEDIA_CONTAINER}" || failed=1
    ensure_managed_container "${BEAT_SERVICE}" "${BEAT_CONTAINER}" || failed=1

    if [[ "${failed}" -ne 0 ]]; then
        log "CRITICAL Celery media doctor could not restore all required services"
        return 1
    fi

    log "OK Celery media doctor check complete"
}

usage() {
    printf 'Usage: %s [--once|--watch] [--interval SECONDS]\n' "$0"
}

mode="once"
while [[ $# -gt 0 ]]; do
    case "$1" in
        --once)
            mode="once"
            shift
            ;;
        --watch)
            mode="watch"
            shift
            ;;
        --interval)
            [[ $# -ge 2 ]] || { usage >&2; exit 2; }
            INTERVAL_SECONDS="$2"
            shift 2
            ;;
        --help|-h)
            usage
            exit 0
            ;;
        *)
            usage >&2
            exit 2
            ;;
    esac
done

mkdir -p "$(dirname "${LOCK_FILE}")"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
    log "INFO another Celery media doctor instance is already running"
    exit 0
fi

if [[ "${mode}" == "once" ]]; then
    check_once
    exit $?
fi

while true; do
    check_once || true
    sleep "${INTERVAL_SECONDS}"
done
