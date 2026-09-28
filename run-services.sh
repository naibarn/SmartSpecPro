#!/bin/bash

# SmartSpecPro Service Manager (systemd + screen hybrid)
# Usage: ./run-services.sh [start|stop|status|restart|attach|logs]
#
# Web and Backend are managed by systemd (auto-restart on crash).
# Docker Status UI prefers systemd and falls back to a screen session.
# Infrastructure and media workers run in Docker.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load NVM if available
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    \. "$NVM_DIR/nvm.sh"
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

localhost_http_code() {
    local code
    code="$(curl -sS -o /dev/null -w "%{http_code}" "$1" 2>/dev/null)" || code="000"
    echo "${code:-000}"
}

localhost_json_status() {
    local body
    body="$(curl -sS "$1" 2>/dev/null)" || {
        echo "unreachable"
        return 0
    }

    local status
    status="$(printf '%s' "$body" | jq -r '.status // empty' 2>/dev/null || true)"
    echo "${status:-unreachable}"
}

systemd_available() {
    systemctl show smartspec-web.service -p LoadState > /dev/null 2>&1
}

systemd_is_active() {
    local unit=$1
    if systemd_available; then
        systemctl is-active "$unit" 2>/dev/null || echo "inactive"
    else
        echo "unknown"
    fi
}

systemd_restart_count() {
    local unit=$1
    if systemd_available; then
        systemctl show "$unit" -p NRestarts --value 2>/dev/null || echo "?"
    else
        echo "?"
    fi
}

docker_status_unit_installed() {
    [ -f /etc/systemd/system/smartspec-docker-status.service ] \
        || [ -f /lib/systemd/system/smartspec-docker-status.service ] \
        || [ -f /usr/lib/systemd/system/smartspec-docker-status.service ]
}

docker_status_screen_running() {
    screen -list 2>/dev/null | grep -q "\.smartspec-docker-status"
}

docker_status_health_code() {
    localhost_http_code "http://127.0.0.1:3001/health"
}

start_docker_status() {
    if docker_status_unit_installed && systemd_available; then
        log_step "Starting Docker Status UI (systemd)..."
        sudo systemctl start smartspec-docker-status.service
        return $?
    fi

    start_screen_service "smartspec-docker-status" "cd docker-status && npm run dev"
}

stop_docker_status() {
    if docker_status_unit_installed && systemd_available; then
        log_step "Stopping Docker Status UI (systemd)..."
        sudo systemctl stop smartspec-docker-status.service 2>/dev/null || true
    fi

    stop_screen_service "smartspec-docker-status"
}

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║         SmartSpecPro Service Manager (systemd)               ║"
    echo "║         Web + Backend managed by systemd (auto-restart)      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ============================================================
# Cleanup: kill conflicting screen sessions for systemd services
# ============================================================
cleanup_screen_conflicts() {
    for session in smartspec-web smartspec-backend; do
        if screen -list 2>/dev/null | grep -q "\.${session}"; then
            log_warn "Killing conflicting screen session: ${session}"
            screen -S "${session}" -X quit 2>/dev/null || true
        fi
    done
    # Also kill orphan tsx/uvicorn processes not managed by systemd
    local systemd_web_pid=$(systemctl show smartspec-web.service -p ExecMainPID --value 2>/dev/null || echo "0")
    local systemd_backend_pid=$(systemctl show smartspec-backend.service -p ExecMainPID --value 2>/dev/null || echo "0")

    # Kill orphan web processes (tsx for apps/web) not owned by systemd
    for pid in $(pgrep -f "tsx.*apps/web.*server/_core" 2>/dev/null || true); do
        if [ "$pid" != "$systemd_web_pid" ]; then
            local parent=$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')
            # Don't kill if parent is systemd's web process
            if [ "$parent" != "$systemd_web_pid" ]; then
                log_warn "Killing orphan web process: PID $pid"
                kill "$pid" 2>/dev/null || true
            fi
        fi
    done
}

# ============================================================
# Health check functions
# ============================================================
wait_for_postgres() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for PostgreSQL to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-postgres pg_isready -U smartspec > /dev/null 2>&1; then
            log_info "PostgreSQL is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "PostgreSQL failed to start after ${max_attempts}s"
    return 1
}

wait_for_redis() {
    local max_attempts=15
    local attempt=1

    log_step "Waiting for Redis to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-redis redis-cli ping > /dev/null 2>&1; then
            log_info "Redis is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "Redis failed to start after ${max_attempts}s"
    return 1
}

wait_for_backend() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for Python Backend to be ready..."
    while [ $attempt -le $max_attempts ]; do
        local status=$(localhost_json_status "http://127.0.0.1:8000/health")
        if [[ "$status" == "healthy" ]] || [[ "$status" == "degraded" ]]; then
            log_info "Python Backend is ready (status: $status, ${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "Python Backend failed to start after ${max_attempts}s"
    return 1
}

wait_for_web() {
    local max_attempts=45
    local attempt=1

    log_step "Waiting for Web Application to be ready..."
    while [ $attempt -le $max_attempts ]; do
        local status_code=$(localhost_http_code "http://127.0.0.1:3000")
        if [ "$status_code" = "200" ] || [ "$status_code" = "304" ]; then
            log_info "Web Application is ready (HTTP $status_code, ${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "Web Application failed to start after ${max_attempts}s"
    return 1
}

wait_for_docker_status() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for Docker Status to be ready..."
    while [ $attempt -le $max_attempts ]; do
        local status_code
        status_code=$(docker_status_health_code)
        if [ "$status_code" = "200" ]; then
            log_info "Docker Status is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "Docker Status failed to start after ${max_attempts}s"
    return 1
}

wait_for_nginx() {
    local max_attempts=15
    local attempt=1

    log_step "Waiting for Nginx to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-nginx-dev nginx -t > /dev/null 2>&1; then
            log_info "Nginx is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "Nginx failed to start after ${max_attempts}s"
    return 1
}

# ============================================================
# Screen session management (only for docker-status)
# ============================================================
start_screen_service() {
    local service_name=$1
    local command=$2

    if screen -list | grep -q "\.${service_name}"; then
        log_warn "${service_name} is already running"
        return 0
    fi

    log_step "Starting ${service_name} in screen session..."
    screen -dmS "${service_name}" bash -c "export NVM_DIR=\"\$HOME/.nvm\" && [ -s \"\$NVM_DIR/nvm.sh\" ] && source \"\$NVM_DIR/nvm.sh\" && cd ${PROJECT_ROOT} && ${command}"
    sleep 2

    if screen -list | grep -q "\.${service_name}"; then
        log_info "${service_name} started successfully"
    else
        log_error "Failed to start ${service_name}"
        return 1
    fi
}

stop_screen_service() {
    local service_name=$1

    if screen -list | grep -q "\.${service_name}"; then
        log_step "Stopping ${service_name}..."
        screen -S "${service_name}" -X quit 2>/dev/null || true
        log_info "${service_name} stopped"
    else
        log_warn "${service_name} is not running"
    fi
}

# ============================================================
# Docker media workers management
# ============================================================
start_media_workers() {
    log_step "Restarting canonical PostgreSQL-pull worker..."
    sudo systemctl restart smartspec-node-worker.service
}

stop_media_workers() {
    log_step "Stopping canonical PostgreSQL-pull worker..."
    sudo systemctl stop smartspec-node-worker.service
}

# ============================================================
# Nginx management
# ============================================================
start_nginx() {
    log_step "Starting Nginx reverse proxy..."

    if docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        log_warn "Nginx is already running"
        return 0
    fi

    # Remove old container if exists
    docker rm smartspec-nginx-dev > /dev/null 2>&1 || true

    if ! docker network ls --format '{{.Name}}' | grep -q '^smartspec-network$'; then
        log_warn "Network smartspec-network not found — creating it"
        docker network create smartspec-network || true
    fi

    docker run -d \
        --name smartspec-nginx-dev \
        --network smartspec-network \
        --add-host=host.docker.internal:host-gateway \
        -p 80:80 \
        -p 443:443 \
        -v "${PROJECT_ROOT}/nginx/conf.d:/etc/nginx/conf.d:ro" \
        -v "${PROJECT_ROOT}/nginx/ssl:/etc/nginx/ssl:ro" \
        --restart unless-stopped \
        nginx:alpine > /dev/null 2>&1

    if [ $? -eq 0 ]; then
        sleep 1
        docker exec smartspec-nginx-dev nginx -s reload > /dev/null 2>&1 || true
        log_info "Nginx started successfully (https://smartaihub.app)"
        return 0
    else
        log_error "Failed to start Nginx"
        return 1
    fi
}

stop_nginx() {
    log_step "Stopping Nginx reverse proxy..."
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        docker stop smartspec-nginx-dev > /dev/null 2>&1 || true
        docker rm smartspec-nginx-dev > /dev/null 2>&1 || true
        log_info "Nginx stopped"
    else
        log_warn "Nginx is not running"
    fi
}

# ============================================================
# Main commands
# ============================================================

cmd_start() {
    print_banner

    # Clean up conflicting screen sessions first
    cleanup_screen_conflicts

    # Validate database configuration before starting
    log_step "Validating database configuration..."
    if [ -f "./scripts/validate-db-config.sh" ]; then
        if ! ./scripts/validate-db-config.sh; then
            log_error "Database configuration validation failed!"
            log_warn "Fix the configuration mismatch before starting services."
            exit 1
        fi
    else
        log_warn "Database validator not found (scripts/validate-db-config.sh)"
    fi
    echo ""

    # Step 1: Infrastructure (Docker)
    log_step "Starting infrastructure (PostgreSQL, Redis)..."
    if ! docker compose -p smartspecpro -f docker-compose.infra.yml up -d; then
        log_error "Failed to start infrastructure services"
        log_warn "Check Docker is running: docker ps"
        exit 1
    fi
    log_info "Infrastructure containers started"

    if ! wait_for_postgres; then
        log_error "PostgreSQL failed to become ready"
        exit 1
    fi

    if ! wait_for_redis; then
        log_error "Redis failed to become ready"
        exit 1
    fi

    # Step 2: Nginx
    echo ""
    if ! start_nginx; then
        log_error "Failed to start Nginx"
        exit 1
    fi
    if ! wait_for_nginx; then
        log_error "Nginx failed to start properly"
        exit 1
    fi

    # Step 3: Backend (systemd)
    echo ""
    log_step "Starting Python Backend (systemd, auto-restart enabled)..."
    sudo systemctl start smartspec-backend.service
    if ! wait_for_backend; then
        log_error "Backend health check failed!"
        log_warn "Check logs: sudo journalctl -u smartspec-backend.service -f"
        exit 1
    fi

    # Step 4: Web Application (systemd)
    echo ""
    log_step "Starting Web Application (systemd, auto-restart enabled)..."
    sudo systemctl start smartspec-web.service
    if ! wait_for_web; then
        log_error "Web Application health check failed!"
        log_warn "Check logs: sudo journalctl -u smartspec-web.service -f"
        exit 1
    fi

    # Step 5: Docker Status (systemd preferred, screen fallback)
    echo ""
    if ! start_docker_status; then
        log_error "Failed to start docker status service"
        exit 1
    fi
    if ! wait_for_docker_status; then
        log_error "Docker Status health check failed!"
        exit 1
    fi

    # Step 6: Canonical PostgreSQL-pull worker
    echo ""
    if ! sudo systemctl restart smartspec-node-worker.service; then
        log_error "Failed to start canonical worker_jobs runtime"
        exit 1
    fi

    local total_services=7
    local running_count=0

    docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$' && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-backend.service)" = "active" ] || [[ "$(localhost_json_status "http://127.0.0.1:8000/health")" =~ ^(healthy|degraded)$ ]] && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-web.service)" = "active" ] || [ "$(localhost_http_code "http://127.0.0.1:3000")" = "200" ] || [ "$(localhost_http_code "http://127.0.0.1:3000")" = "304" ] && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-docker-status.service)" = "active" ] || docker_status_screen_running || [ "$(docker_status_health_code)" = "200" ] && ((running_count++)) || true

    if [ $running_count -eq $total_services ]; then
        echo -e "  ${GREEN}All services running${NC} ($running_count/$total_services)"
    elif [ $running_count -eq 0 ]; then
        echo -e "  ${RED}All services stopped${NC} (0/$total_services)"
    else
        echo -e "  ${YELLOW}Partial deployment${NC} ($running_count/$total_services running)"
    fi

    echo ""
    echo -e "${CYAN}Quick Actions:${NC}"
    echo "  ./run-services.sh start            - Start all services"
    echo "  ./run-services.sh logs web         - View web logs (live)"
    echo "  ./run-services.sh logs backend     - View backend logs (live)"
    echo "  ./run-services.sh logs worker      - View worker_jobs logs"
    echo "  ./run-services.sh restart web      - Restart web"
    echo "  ./run-services.sh restart backend  - Restart backend"
    echo "  ./run-services.sh restart worker   - Restart worker_jobs worker"
    echo ""
}

cmd_attach() {
    local service=$1

    case "$service" in
        web)
            log_info "Web is managed by systemd. Showing live logs (Ctrl+C to exit)..."
            sudo journalctl -u smartspec-web.service -f --no-pager
            ;;
        backend)
            log_info "Backend is managed by systemd. Showing live logs (Ctrl+C to exit)..."
            sudo journalctl -u smartspec-backend.service -f --no-pager
            ;;
        docker)
            if docker_status_unit_installed && systemd_available; then
                log_info "Docker Status is managed by systemd. Showing live logs (Ctrl+C to exit)..."
                sudo journalctl -u smartspec-docker-status.service -f --no-pager
            elif docker_status_screen_running; then
                log_info "Attaching to smartspec-docker-status... (Press Ctrl+A then D to detach)"
                sleep 1
                screen -r smartspec-docker-status
            else
                log_error "smartspec-docker-status is not running"
            fi
            ;;
        media|worker)
            sudo journalctl -u smartspec-node-worker.service -f --no-pager
            ;;
        *)
            log_error "Unknown service: $service"
            exit 1
            ;;
    esac
}

cmd_logs() {
    local service=$1

    case "$service" in
        web)
            log_info "Showing recent logs for Web Application (systemd)..."
            sudo journalctl -u smartspec-web.service --since "30 min ago" --no-pager
            echo ""
            log_info "For live logs: ./run-services.sh attach web"
            ;;
        backend)
            log_info "Showing recent logs for Python Backend (systemd)..."
            sudo journalctl -u smartspec-backend.service --since "30 min ago" --no-pager
            echo ""
            log_info "For live logs: ./run-services.sh attach backend"
            ;;
        docker)
            if docker_status_unit_installed && systemd_available; then
                log_info "Showing recent logs for Docker Status (systemd)..."
                sudo journalctl -u smartspec-docker-status.service --since "30 min ago" --no-pager
                echo ""
                log_info "For live logs: ./run-services.sh attach docker"
            elif docker_status_screen_running; then
                log_info "Showing logs for smartspec-docker-status..."
                screen -S smartspec-docker-status -X hardcopy /tmp/smartspec-docker-status.log
                cat /tmp/smartspec-docker-status.log
                echo ""
                log_info "To see live logs, use: ./run-services.sh attach docker"
            else
                log_error "smartspec-docker-status is not running"
            fi
            ;;
        media|worker)
            sudo journalctl -u smartspec-node-worker.service -n 100 --no-pager
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./run-services.sh logs [web|backend|docker|worker]"
            exit 1
            ;;
    esac
}

cmd_restart() {
    local service=$1

    if [ -z "$service" ]; then
        log_step "Restarting all services..."
        cmd_stop
        sleep 2
        cmd_start
    else
        case "$service" in
            web)
                log_step "Restarting Web Application (systemd)..."
                sudo systemctl restart smartspec-web.service
                wait_for_web
                ;;
            backend)
                log_step "Restarting Python Backend (systemd)..."
                sudo systemctl restart smartspec-backend.service
                wait_for_backend
                ;;
            docker)
                stop_docker_status
                sleep 1
                start_docker_status
                wait_for_docker_status
                ;;
            media|worker)
                sudo systemctl restart smartspec-node-worker.service
                ;;
            *)
                log_error "Unknown service: $service"
                echo "Usage: ./run-services.sh restart [web|backend|docker|worker]"
                exit 1
                ;;
        esac
    fi
}

cmd_help() {
    print_banner

    echo "Usage: ./run-services.sh <command> [options]"
    echo ""
    echo -e "${CYAN}Commands:${NC}"
    echo "  start                Start all services"
    echo "  stop                 Stop all services"
    echo "  restart [service]    Restart all services or specific service"
    echo "  status               Show status of all services"
    echo "  attach <service>     View live logs / attach to console"
    echo "  logs <service>       View recent service logs"
    echo "  help                 Show this help message"
    echo ""
    echo -e "${CYAN}Services:${NC}"
    echo "  web       SmartSpec Web (systemd, auto-restart on crash)"
    echo "  backend   Python Backend (systemd, auto-restart on crash)"
    echo "  docker    Docker Status UI (screen session)"
    echo "  worker    Canonical PostgreSQL-pull worker for worker_jobs"
    echo ""
    echo -e "${CYAN}Service Management:${NC}"
    echo "  Web and Backend are managed by systemd with Restart=always."
    echo "  If they crash, systemd will automatically restart them within 5 seconds."
    echo "  No manual intervention needed for crashes."
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./run-services.sh start          # Start all services"
    echo "  ./run-services.sh status         # Check status"
    echo "  ./run-services.sh logs web       # View web logs"
    echo "  ./run-services.sh logs backend   # View backend logs"
    echo "  ./run-services.sh logs media     # View media worker logs"
    echo "  ./run-services.sh attach web     # Live tail web logs"
    echo "  ./run-services.sh restart media  # Restart media workers"
    echo "  ./run-services.sh stop           # Stop everything"
    echo ""
}

# Main
case "${1:-help}" in
    start)
        cmd_start
        ;;
    stop)
        cmd_stop
        ;;
    restart)
        cmd_restart "$2"
        ;;
    status)
        cmd_status
        ;;
    attach)
        cmd_attach "$2"
        ;;
    logs)
        cmd_logs "$2"
        ;;
    help|--help|-h)
        cmd_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run './run-services.sh help' for usage information."
        exit 1
        ;;
esac
