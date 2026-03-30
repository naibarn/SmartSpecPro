#!/bin/bash

# SmartSpecPro Service Manager (systemd + screen hybrid)
# Usage: ./run-services.sh [start|stop|status|restart|attach|logs]
#
# Web and Backend are managed by systemd (auto-restart on crash).
# Docker Status UI prefers systemd and falls back to a screen session.
# Infrastructure and media workers run in Docker.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIA_COMPOSE="docker-compose.media.yml"
SANDBOX_COMPOSE="docker-compose.opensandbox.yml"

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
    log_step "Starting Docker media workers (celery-media, celery-video, celery-import, celery-presentation, celery-beat, flower)..."

    if ! docker network ls --format '{{.Name}}' | grep -q '^smartspec-network$'; then
        log_warn "Network smartspec-network not found — creating it"
        docker network create smartspec-network || true
    fi

    cd "$PROJECT_ROOT"
    docker compose -p smartspecpro -f "$MEDIA_COMPOSE" up -d > /dev/null 2>&1

    local running
    running=$(docker compose -p smartspecpro -f "$MEDIA_COMPOSE" ps --status running -q 2>/dev/null | wc -l)
    if [ "$running" -ge 3 ]; then
        log_info "Docker media workers started ($running containers running)"
    else
        log_warn "Only $running media containers running — check: docker compose -p smartspecpro -f $MEDIA_COMPOSE ps"
    fi
}

stop_media_workers() {
    log_step "Stopping Docker media workers..."
    cd "$PROJECT_ROOT"
    docker compose -p smartspecpro -f "$MEDIA_COMPOSE" down > /dev/null 2>&1 || true
    log_info "Docker media workers stopped"
}

# ============================================================
# OpenSandbox management (optional)
# ============================================================
wait_for_sandbox() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for OpenSandbox to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://127.0.0.1:8080/health > /dev/null 2>&1; then
            log_info "OpenSandbox is ready ($((attempt * 2))s)"
            return 0
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done

    log_warn "OpenSandbox failed to start after $((max_attempts * 2))s (optional service)"
    return 1
}

start_sandbox() {
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
        log_warn "OpenSandbox is already running"
        return 0
    fi

    log_step "Starting OpenSandbox execution plane..."
    cd "$PROJECT_ROOT"
    if ! docker compose -p smartspecpro -f "$SANDBOX_COMPOSE" up -d 2>/tmp/sandbox-start.log; then
        log_warn "docker compose failed:"
        cat /tmp/sandbox-start.log 2>/dev/null
        return 1
    fi

    if wait_for_sandbox; then
        log_info "OpenSandbox started successfully"
        return 0
    else
        log_warn "OpenSandbox failed to start (system will use legacy mode)"
        return 1
    fi
}

stop_sandbox() {
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
        log_step "Stopping OpenSandbox..."
        cd "$PROJECT_ROOT"
        docker compose -p smartspecpro -f "$SANDBOX_COMPOSE" down > /dev/null 2>&1 || true
        log_info "OpenSandbox stopped"
    else
        log_warn "OpenSandbox is not running"
    fi
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

    # Step 6: Media workers (Docker)
    echo ""
    if ! start_media_workers; then
        log_error "Failed to start media workers"
        exit 1
    fi

    # Brief validation check
    sleep 3
    local failed_workers=0
    for worker in smartspec-celery-media smartspec-celery-import smartspec-celery-presentation smartspec-celery-sandbox smartspec-celery-beat; do
        if ! docker ps --format '{{.Names}}' | grep -q "^${worker}$"; then
            log_warn "${worker} is not running"
            ((failed_workers++))
        fi
    done

    if [ $failed_workers -gt 0 ]; then
        log_warn "${failed_workers} media worker(s) failed to start - check logs with: docker logs <container>"
    else
        log_info "All media workers validated"
    fi

    # Step 7: OpenSandbox (optional — failure does not block startup)
    echo ""
    if [ -f "$PROJECT_ROOT/$SANDBOX_COMPOSE" ]; then
        start_sandbox || log_warn "OpenSandbox unavailable — system will use legacy execution mode"
    else
        log_warn "OpenSandbox compose file not found — skipping"
    fi

    echo ""
    log_info "All services started successfully!"

    # Show summary
    cmd_status

    echo -e "${GREEN}Services URLs:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │ SmartSpec Web      │ http://localhost:3000                  │"
    echo "  │ Python Backend     │ http://localhost:8000                  │"
    echo "  │ Docker Status UI   │ http://localhost:3001                  │"
    echo "  │ Flower Dashboard   │ http://localhost:5555                  │"
    echo "  │ Public Domain      │ https://smartaihub.app                 │"
    echo "  │ Docker Status URL  │ https://docker.smartaihub.app          │"
    echo "  │ Public API         │ https://api.smartaihub.app             │"
    echo "  │ OpenSandbox API   │ http://localhost:8080 (when enabled)   │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${CYAN}Useful commands:${NC}"
    echo "  ./run-services.sh status          - Show service status"
    echo "  ./run-services.sh logs web        - View web logs (journalctl)"
    echo "  ./run-services.sh logs backend    - View backend logs (journalctl)"
    echo "  ./run-services.sh logs media      - View media worker logs"
    echo "  ./run-services.sh restart web     - Restart web (systemd auto-restart)"
    echo "  ./run-services.sh restart backend - Restart backend"
    echo "  ./run-services.sh restart media   - Restart media workers"
    echo "  ./run-services.sh stop            - Stop all services"
    echo ""
}

cmd_stop() {
    log_step "Stopping all services..."

    # Stop systemd services
    log_step "Stopping Web Application (systemd)..."
    sudo systemctl stop smartspec-web.service 2>/dev/null || true
    log_info "Web stopped"

    log_step "Stopping Python Backend (systemd)..."
    sudo systemctl stop smartspec-backend.service 2>/dev/null || true
    log_info "Backend stopped"

    # Stop Docker Status UI
    stop_docker_status

    # Clean up any orphan screen sessions
    cleanup_screen_conflicts

    # Stop Docker media workers
    stop_media_workers

    # Stop OpenSandbox
    stop_sandbox

    # Stop Nginx
    stop_nginx

    log_step "Stopping infrastructure (PostgreSQL, Redis)..."
    docker compose -p smartspecpro -f docker-compose.infra.yml down || true

    log_info "All services stopped"
}

cmd_status() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    SERVICE STATUS                             ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # 1. Infrastructure Layer
    echo -e "${BLUE}--- Infrastructure Services ---${NC}"

    # PostgreSQL
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$'; then
        if docker exec smartspec-postgres pg_isready -U smartspec -d smartspec > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} PostgreSQL       Running (port 5432)"
        else
            echo -e "  ${YELLOW}!${NC} PostgreSQL       Running but not ready"
        fi
    else
        echo -e "  ${RED}x${NC} PostgreSQL       Not running"
    fi

    # Redis
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$'; then
        local redis_status=$(docker exec smartspec-redis redis-cli ping 2>/dev/null || echo "FAILED")
        if [ "$redis_status" = "PONG" ]; then
            echo -e "  ${GREEN}✓${NC} Redis            Running (port 6379)"
        else
            echo -e "  ${YELLOW}!${NC} Redis            Running but not responding"
        fi
    else
        echo -e "  ${RED}x${NC} Redis            Not running"
    fi

    # Nginx
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        local nginx_test=$(docker exec smartspec-nginx-dev nginx -t 2>&1 | grep -q "successful" && echo "ok" || echo "error")
        if [ "$nginx_test" = "ok" ]; then
            echo -e "  ${GREEN}✓${NC} Nginx            Running (ports 80, 443) -> https://smartaihub.app"
        else
            echo -e "  ${YELLOW}!${NC} Nginx            Running but config has errors"
        fi
    else
        echo -e "  ${RED}x${NC} Nginx            Not running (https://smartaihub.app unavailable!)"
    fi

    echo ""
    # 1b. Sandbox Layer (optional)
    echo -e "${BLUE}--- Sandbox Services (optional) ---${NC}"

    if docker ps --format '{{.Names}}' | grep -q '^smartspec-opensandbox$'; then
        local sandbox_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}unknown{{end}}' smartspec-opensandbox 2>/dev/null || echo "unknown")
        if [ "$sandbox_health" = "healthy" ]; then
            echo -e "  ${GREEN}✓${NC} OpenSandbox      Running (healthy) [port 8080]"
        else
            echo -e "  ${YELLOW}!${NC} OpenSandbox      Running ($sandbox_health) [port 8080]"
        fi
    else
        echo -e "  ${YELLOW}-${NC} OpenSandbox      Not running (optional)"
    fi

    echo ""
    # 2. Application Layer (systemd managed)
    echo -e "${BLUE}--- Application Services ---${NC}"

    # Backend (systemd)
    local backend_active=$(systemd_is_active smartspec-backend.service)
    local backend_restarts=$(systemd_restart_count smartspec-backend.service)
    if [ "$backend_active" = "active" ]; then
        local backend_health=$(localhost_json_status "http://127.0.0.1:8000/health")
        echo -e "  ${GREEN}✓${NC} Python Backend   Running ($backend_health) [systemd, restarts: $backend_restarts]"
    elif [[ "$(localhost_json_status "http://127.0.0.1:8000/health")" =~ ^(healthy|degraded)$ ]]; then
        local backend_health=$(localhost_json_status "http://127.0.0.1:8000/health")
        echo -e "  ${GREEN}✓${NC} Python Backend   Running ($backend_health) [health endpoint]"
    else
        echo -e "  ${RED}x${NC} Python Backend   $backend_active [systemd, restarts: $backend_restarts]"
    fi

    # Web (systemd)
    local web_active=$(systemd_is_active smartspec-web.service)
    local web_restarts=$(systemd_restart_count smartspec-web.service)
    if [ "$web_active" = "active" ]; then
        local web_responding=$(localhost_http_code "http://127.0.0.1:3000")
        echo -e "  ${GREEN}✓${NC} Web Application  Running (HTTP $web_responding) [systemd, restarts: $web_restarts]"
    elif [ "$(localhost_http_code "http://127.0.0.1:3000")" = "200" ] || [ "$(localhost_http_code "http://127.0.0.1:3000")" = "304" ]; then
        local web_responding=$(localhost_http_code "http://127.0.0.1:3000")
        echo -e "  ${GREEN}✓${NC} Web Application  Running (HTTP $web_responding) [health endpoint]"
    else
        echo -e "  ${RED}x${NC} Web Application  $web_active [systemd, restarts: $web_restarts]"
    fi

    # Docker Status (systemd or screen)
    local docker_status_active=$(systemd_is_active smartspec-docker-status.service)
    if [ "$docker_status_active" = "active" ]; then
        local ds_responding=$(docker_status_health_code)
        if [ "$ds_responding" = "200" ]; then
            echo -e "  ${GREEN}✓${NC} Docker Status    Running (HTTP $ds_responding) [systemd]"
        else
            echo -e "  ${YELLOW}!${NC} Docker Status    Running but not healthy [systemd]"
        fi
    elif docker_status_screen_running; then
        local ds_responding=$(docker_status_health_code)
        if [ "$ds_responding" = "200" ]; then
            echo -e "  ${GREEN}✓${NC} Docker Status    Running (HTTP $ds_responding) [screen]"
        else
            echo -e "  ${YELLOW}!${NC} Docker Status    Running but not healthy [screen]"
        fi
    elif [ "$(docker_status_health_code)" = "200" ]; then
        echo -e "  ${GREEN}✓${NC} Docker Status    Running (HTTP 200) [health endpoint]"
    else
        echo -e "  ${RED}x${NC} Docker Status    Not running"
    fi

    echo ""
    # 3. Background Workers
    echo -e "${BLUE}--- Celery Workers (Background Tasks) ---${NC}"

    for worker in smartspec-celery-media smartspec-celery-video smartspec-celery-import smartspec-celery-presentation smartspec-celery-sandbox smartspec-celery-beat smartspec-flower; do
        local worker_name=$(echo $worker | sed 's/smartspec-celery-//' | sed 's/smartspec-//')
        if docker ps --format '{{.Names}}' | grep -q "^${worker}$"; then
            local worker_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}ok{{end}}' "$worker" 2>/dev/null || echo "")
            echo -e "  ${GREEN}✓${NC} ${worker_name}$(printf '%*s' $((15 - ${#worker_name})) '')Running ($worker_health)"
        else
            echo -e "  ${RED}x${NC} ${worker_name}$(printf '%*s' $((15 - ${#worker_name})) '')Not running"
        fi
    done

    echo ""
    # 4. Summary
    echo -e "${BLUE}--- Service Summary ---${NC}"

    local total_services=12
    local running_count=0

    docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$' && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-backend.service)" = "active" ] || [[ "$(localhost_json_status "http://127.0.0.1:8000/health")" =~ ^(healthy|degraded)$ ]] && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-web.service)" = "active" ] || [ "$(localhost_http_code "http://127.0.0.1:3000")" = "200" ] || [ "$(localhost_http_code "http://127.0.0.1:3000")" = "304" ] && ((running_count++)) || true
    [ "$(systemd_is_active smartspec-docker-status.service)" = "active" ] || docker_status_screen_running || [ "$(docker_status_health_code)" = "200" ] && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-media$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-import$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-presentation$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-sandbox$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-beat$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-flower$' && ((running_count++)) || true

    if docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-video$'; then
        ((total_services++))
        ((running_count++))
    fi

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
    echo "  ./run-services.sh logs media       - View media worker logs"
    echo "  ./run-services.sh restart web      - Restart web"
    echo "  ./run-services.sh restart backend  - Restart backend"
    echo "  ./run-services.sh restart media    - Restart media workers"
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
        media)
            log_info "Media workers run in Docker. Use these commands instead:"
            echo "  docker logs -f smartspec-celery-media   # Media worker logs"
            echo "  docker logs -f smartspec-celery-video   # Video worker logs"
            echo "  docker logs -f smartspec-celery-import  # Import worker logs"
            echo "  docker logs -f smartspec-celery-presentation # Presentation export worker logs"
            echo "  docker logs -f smartspec-celery-beat    # Beat scheduler logs"
            echo "  docker logs -f smartspec-flower         # Flower dashboard logs"
            echo "  http://localhost:5555                    # Flower web dashboard"
            ;;
        sandbox)
            log_info "Showing live OpenSandbox logs (Ctrl+C to exit)..."
            docker logs -f smartspec-opensandbox 2>&1 || echo "  Container not running"
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./run-services.sh attach [web|backend|docker|media|sandbox]"
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
        media)
            log_info "Showing recent logs for Docker media workers..."
            echo ""
            echo -e "${CYAN}=== celery-media (last 30 lines) ===${NC}"
            docker logs --tail 30 smartspec-celery-media 2>&1 || echo "  Container not running"
            echo ""
            echo -e "${CYAN}=== celery-video (last 30 lines) ===${NC}"
            docker logs --tail 30 smartspec-celery-video 2>&1 || echo "  Container not running"
            echo ""
            echo -e "${CYAN}=== celery-import (last 30 lines) ===${NC}"
            docker logs --tail 30 smartspec-celery-import 2>&1 || echo "  Container not running"
            echo ""
            echo -e "${CYAN}=== celery-presentation (last 30 lines) ===${NC}"
            docker logs --tail 30 smartspec-celery-presentation 2>&1 || echo "  Container not running"
            echo ""
            echo -e "${CYAN}=== celery-beat (last 10 lines) ===${NC}"
            docker logs --tail 10 smartspec-celery-beat 2>&1 || echo "  Container not running"
            echo ""
            log_info "For live logs: docker logs -f smartspec-celery-media"
            log_info "Flower dashboard: http://localhost:5555"
            ;;
        sandbox)
            log_info "Showing recent logs for OpenSandbox..."
            docker logs --tail 50 smartspec-opensandbox 2>&1 || echo "  Container not running"
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./run-services.sh logs [web|backend|docker|media|sandbox]"
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
            media)
                log_step "Recreating Docker media workers (apply latest compose config)..."
                cd "$PROJECT_ROOT"
                docker compose -p smartspecpro -f "$MEDIA_COMPOSE" up -d --force-recreate celery-media celery-video celery-import celery-presentation celery-sandbox celery-beat flower
                log_info "Docker media workers recreated"
                ;;
            sandbox)
                log_step "Restarting OpenSandbox..."
                stop_sandbox
                sleep 1
                start_sandbox
                ;;
            *)
                log_error "Unknown service: $service"
                echo "Usage: ./run-services.sh restart [web|backend|docker|media|sandbox]"
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
    echo "  media     Media Workers (Docker: celery-media, celery-video, celery-import, celery-presentation, celery-beat, flower)"
    echo "  sandbox   OpenSandbox execution plane (Docker, optional)"
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
