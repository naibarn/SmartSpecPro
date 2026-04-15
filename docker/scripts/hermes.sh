#!/usr/bin/env bash
# =============================================================================
# SmartSpec Pro - Hermes Agent Runtime Manager
# =============================================================================
# Purpose: Manage Hermes agents through a dedicated Docker Compose stack
# Usage:   ./hermes.sh [command]
#
# Safety posture:
# - No host ports are published
# - Hermes is routed to the SmartSpec Pro gateway by default
# - External provider keys are blanked in the compose environment
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
DOCKER_DIR="${PROJECT_ROOT}/docker"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.hermes.yml"
ENV_FILE="${HERMES_ENV_FILE:-${DOCKER_DIR}/hermes.env}"
EXAMPLE_ENV_FILE="${DOCKER_DIR}/hermes.env.example"
DEFAULT_PROJECT_NAME="smartspec-hermes"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_header() { echo -e "\n${BLUE}=== $1 ===${NC}\n"; }

check_docker() {
    if ! command -v docker &>/dev/null; then
        log_error "Docker is not installed!"
        exit 1
    fi
    if ! docker compose version &>/dev/null 2>&1 && ! command -v docker-compose &>/dev/null; then
        log_error "Docker Compose is not installed!"
        exit 1
    fi
}

get_compose_cmd() {
    if docker compose version &>/dev/null 2>&1; then
        echo "docker compose"
    else
        echo "docker-compose"
    fi
}

COMPOSE_CMD=$(get_compose_cmd)

resolve_project_name() {
    if [ -n "${HERMES_PROJECT_NAME:-}" ]; then
        echo "${HERMES_PROJECT_NAME}"
        return
    fi

    local file_project_name
    file_project_name="$(grep -E '^HERMES_PROJECT_NAME=' "${ENV_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
    if [ -n "${file_project_name}" ]; then
        echo "${file_project_name}"
    else
        echo "${DEFAULT_PROJECT_NAME}"
    fi
}

compose() {
    local project_name
    project_name="$(resolve_project_name)"
    ${COMPOSE_CMD} --project-name "${project_name}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" "$@"
}

ensure_env() {
    if [ ! -f "${ENV_FILE}" ]; then
        if [ -f "${EXAMPLE_ENV_FILE}" ]; then
            log_warn "Environment file not found. Creating ${ENV_FILE} from example..."
            cp "${EXAMPLE_ENV_FILE}" "${ENV_FILE}"
            log_warn "Please edit ${ENV_FILE} and set SMARTSPEC_WEB_GATEWAY_TOKEN before starting Hermes."
        else
            log_error "Missing environment file: ${ENV_FILE}"
            exit 1
        fi
    fi
}

ensure_data_dir() {
    local data_dir
    data_dir="$(grep -E '^HERMES_DATA_DIR=' "${ENV_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)"
    if [ -z "${data_dir}" ]; then
        data_dir="./data/hermes"
    fi
    mkdir -p "${PROJECT_ROOT}/${data_dir#./}"
}

ensure_gateway_token() {
    local token
    token="${SMARTSPEC_WEB_GATEWAY_TOKEN:-$(grep -E '^SMARTSPEC_WEB_GATEWAY_TOKEN=' "${ENV_FILE}" 2>/dev/null | tail -n1 | cut -d= -f2- || true)}"
    token="${token:-}"
    if [ -z "${token}" ] || [[ "${token}" == replace_me* ]]; then
        log_error "SMARTSPEC_WEB_GATEWAY_TOKEN is missing. Set it in ${ENV_FILE} before running Hermes."
        exit 1
    fi
}

cmd_setup() {
    log_header "Setting Up Hermes Runtime"
    check_docker
    ensure_env
    ensure_data_dir
    ensure_gateway_token

    log_info "Validating compose file..."
    compose config >/dev/null

    log_info "Running Hermes setup step inside container..."
    compose run --rm hermes setup

    log_info "Hermes setup complete."
    log_info "Next: ./docker/scripts/hermes.sh up"
}

cmd_up() {
    log_header "Starting Hermes Runtime"
    check_docker
    ensure_env
    ensure_data_dir
    ensure_gateway_token

    if [ "${1:-}" = "--build" ]; then
        log_info "Compose build phase skipped (image is external)."
    fi

    log_info "Starting Hermes..."
    compose up -d --wait --wait-timeout "${HERMES_WAIT_TIMEOUT:-120}"

    log_info "Hermes started."
    log_info "Logs: ./docker/scripts/hermes.sh logs -f"
}

cmd_down() {
    log_header "Stopping Hermes Runtime"
    check_docker
    ensure_env
    compose down "$@"
    log_info "Hermes stopped."
}

cmd_restart() {
    log_header "Restarting Hermes Runtime"
    cmd_down
    cmd_up
}

cmd_status() {
    log_header "Hermes Runtime Status"
    check_docker
    ensure_env
    compose ps
}

cmd_logs() {
    log_header "Hermes Logs"
    check_docker
    ensure_env
    compose logs "$@"
}

cmd_check() {
    log_header "Hermes Compose Check"
    check_docker
    ensure_env
    compose config
}

cmd_help() {
    cat << EOF
SmartSpec Pro - Hermes Agent Runtime Manager

Usage: ./hermes.sh <command> [options]

Commands:
    setup           Create data dir, validate compose, and run Hermes setup
    up [--build]    Start Hermes agents
    down            Stop Hermes agents
    restart         Restart Hermes agents
    status          Show container status
    logs [-f]       Show Hermes logs
    check           Validate compose configuration
    help            Show this help message

Environment:
    HERMES_ENV_FILE       Path to env file (default: docker/hermes.env)
    HERMES_PROJECT_NAME   Compose project name (default: smartspec-hermes)

Examples:
    cp docker/hermes.env.example docker/hermes.env
    ./docker/scripts/hermes.sh setup
    ./docker/scripts/hermes.sh up
    ./docker/scripts/hermes.sh logs -f
    HERMES_PROJECT_NAME=smartspec-hermes-a ./docker/scripts/hermes.sh up

EOF
}

main() {
    check_docker

    case "${1:-help}" in
        setup)
            cmd_setup
            ;;
        up)
            shift || true
            cmd_up "${1:-}"
            ;;
        down)
            shift || true
            cmd_down "$@"
            ;;
        restart)
            cmd_restart
            ;;
        status)
            cmd_status
            ;;
        logs)
            shift || true
            cmd_logs "$@"
            ;;
        check)
            cmd_check
            ;;
        help|--help|-h)
            cmd_help
            ;;
        *)
            log_error "Unknown command: ${1}"
            cmd_help
            exit 1
            ;;
    esac
}

main "$@"
