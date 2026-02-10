#!/bin/bash

# SmartSpecPro Service Manager with Screen
# Usage: ./run-services.sh [start|stop|status|attach|logs]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIA_COMPOSE="docker-compose.media.yml"

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

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║         SmartSpecPro Service Manager (Screen)                 ║"
    echo "║         Services run in detached screen sessions              ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_screen() {
    if ! command -v screen &> /dev/null; then
        log_error "Screen is not installed. Run: sudo apt install screen"
        exit 1
    fi
}

# Health check functions
wait_for_postgres() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for PostgreSQL to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-postgres pg_isready -U smartspec > /dev/null 2>&1; then
            log_info "✓ PostgreSQL is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "✗ PostgreSQL failed to start after ${max_attempts}s"
    return 1
}

wait_for_redis() {
    local max_attempts=15
    local attempt=1

    log_step "Waiting for Redis to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-redis redis-cli ping > /dev/null 2>&1; then
            log_info "✓ Redis is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "✗ Redis failed to start after ${max_attempts}s"
    return 1
}

wait_for_backend() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for Python Backend to be ready..."
    while [ $attempt -le $max_attempts ]; do
        local status=$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unreachable")
        if [[ "$status" == "healthy" ]] || [[ "$status" == "degraded" ]]; then
            log_info "✓ Python Backend is ready (status: $status, ${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "✗ Python Backend failed to start after ${max_attempts}s"
    return 1
}

wait_for_docker_status() {
    local max_attempts=30
    local attempt=1

    log_step "Waiting for Docker Status to be ready..."
    while [ $attempt -le $max_attempts ]; do
        local status_code
        status_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")
        if [ "$status_code" = "200" ]; then
            log_info "✓ Docker Status is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "✗ Docker Status failed to start after ${max_attempts}s"
    return 1
}

wait_for_nginx() {
    local max_attempts=15
    local attempt=1

    log_step "Waiting for Nginx to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if docker exec smartspec-nginx-dev nginx -t > /dev/null 2>&1; then
            log_info "✓ Nginx is ready (${attempt}s)"
            return 0
        fi
        echo -n "."
        sleep 1
        ((attempt++))
    done

    log_error "✗ Nginx failed to start after ${max_attempts}s"
    return 1
}

validate_infrastructure() {
    log_step "Validating infrastructure services..."

    # Check PostgreSQL
    if ! docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$'; then
        log_error "✗ PostgreSQL container is not running"
        return 1
    fi

    if ! wait_for_postgres; then
        return 1
    fi

    # Check Redis
    if ! docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$'; then
        log_error "✗ Redis container is not running"
        return 1
    fi

    if ! wait_for_redis; then
        return 1
    fi

    # Check Nginx
    if ! docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        log_error "✗ Nginx container is not running"
        return 1
    fi

    if ! wait_for_nginx; then
        return 1
    fi

    log_info "✓ All infrastructure services validated"
    return 0
}

show_startup_summary() {
    # Brief wait for containers to stabilize after startup
    sleep 2

    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                    STARTUP SUMMARY                            ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    # Infrastructure
    echo -e "${BLUE}Infrastructure:${NC}"
    local pg_running=$(docker ps --filter name=smartspec-postgres --format '{{.Names}}' 2>/dev/null)
    local redis_running=$(docker ps --filter name=smartspec-redis --format '{{.Names}}' 2>/dev/null)
    local nginx_running=$(docker ps --filter name=smartspec-nginx-dev --format '{{.Names}}' 2>/dev/null)
    local pg_status=$([ -n "$pg_running" ] && echo "Up" || echo "Down")
    local redis_status=$([ -n "$redis_running" ] && echo "Up" || echo "Down")
    local nginx_status=$([ -n "$nginx_running" ] && echo "Up" || echo "Down")
    echo -e "  PostgreSQL:  $([ "$pg_status" = "Up" ] && echo -e "${GREEN}✓${NC} Running" || echo -e "${RED}✗${NC} $pg_status")"
    echo -e "  Redis:       $([ "$redis_status" = "Up" ] && echo -e "${GREEN}✓${NC} Running" || echo -e "${RED}✗${NC} $redis_status")"
    echo -e "  Nginx:       $([ "$nginx_status" = "Up" ] && echo -e "${GREEN}✓${NC} Running (https://smartaihub.app)" || echo -e "${RED}✗${NC} $nginx_status")"

    # Application Services
    echo ""
    echo -e "${BLUE}Application Services:${NC}"
    local backend_health=$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unreachable")
    local web_status=$(screen -list | grep -q "\.smartspec-web" && echo "Running" || echo "Down")
    local docker_status=$(screen -list | grep -q "\.smartspec-docker-status" && echo "Running" || echo "Down")
    local docker_status_health=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")
    echo -e "  Backend:     $([ "$backend_health" = "healthy" ] || [ "$backend_health" = "degraded" ] && echo -e "${GREEN}✓${NC} $backend_health (http://localhost:8000)" || echo -e "${RED}✗${NC} $backend_health")"
    echo -e "  Web:         $([ "$web_status" = "Running" ] && echo -e "${GREEN}✓${NC} Running (http://localhost:3000)" || echo -e "${RED}✗${NC} $web_status")"
    echo -e "  Docker UI:   $([ "$docker_status" = "Running" ] && [ "$docker_status_health" = "200" ] && echo -e "${GREEN}✓${NC} Running (http://localhost:3001)" || echo -e "${RED}✗${NC} ${docker_status}/${docker_status_health}")"

    # Workers
    echo ""
    echo -e "${BLUE}Celery Workers:${NC}"
    for worker in smartspec-celery-media smartspec-celery-beat smartspec-flower; do
        local worker_status=$(docker ps --format '{{.Status}}' --filter name=$worker 2>/dev/null | cut -d' ' -f1 || echo "Down")
        local worker_name=$(echo $worker | sed 's/smartspec-celery-//' | sed 's/smartspec-//')
        echo -e "  ${worker_name}:$(printf '%*s' $((15 - ${#worker_name})) '')$([ "$worker_status" = "Up" ] && echo -e "${GREEN}✓${NC} Running" || echo -e "${RED}✗${NC} $worker_status")"
    done

    echo ""
}

start_service() {
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

stop_service() {
    local service_name=$1

    if screen -list | grep -q "\.${service_name}"; then
        log_step "Stopping ${service_name}..."
        screen -S "${service_name}" -X quit 2>/dev/null || true
        log_info "${service_name} stopped"
    else
        log_warn "${service_name} is not running"
    fi
}

# Nginx reverse proxy management
start_nginx() {
    log_step "Starting Nginx reverse proxy..."

    # Check if nginx container exists
    if docker ps -a --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        # Container exists, check if running
        if docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
            log_warn "Nginx is already running"
            return 0
        else
            # Container exists but not running, remove and recreate
            log_step "Removing old Nginx container..."
            docker rm smartspec-nginx-dev > /dev/null 2>&1 || true
        fi
    fi

    # Ensure network exists
    if ! docker network ls --format '{{.Name}}' | grep -q '^smartspec-network$'; then
        log_warn "Network smartspec-network not found — creating it"
        docker network create smartspec-network || true
    fi

    # Start nginx container
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

# Docker media workers management
start_media_workers() {
    log_step "Starting Docker media workers (celery-media, celery-video, celery-beat, flower)..."

    # Ensure the network exists (created by base infra stack)
    if ! docker network ls --format '{{.Name}}' | grep -q '^smartspec-network$'; then
        log_warn "Network smartspec-network not found — creating it"
        docker network create smartspec-network || true
    fi

    cd "$PROJECT_ROOT"
    docker compose -p smartspecpro -f "$MEDIA_COMPOSE" up -d > /dev/null 2>&1

    # Check containers started
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

media_workers_status() {
    local containers=("smartspec-celery-media" "smartspec-celery-video" "smartspec-celery-beat" "smartspec-flower")
    for cname in "${containers[@]}"; do
        local state
        state=$(docker inspect --format='{{.State.Status}}' "$cname" 2>/dev/null || echo "not found")
        local health=""
        if [ "$state" = "running" ]; then
            health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' "$cname" 2>/dev/null || echo "")
            echo -e "  ${GREEN}✓${NC} $cname (${state}, ${health})"
        else
            echo -e "  ${RED}✗${NC} $cname (${state})"
        fi
    done
}

cmd_start() {
    print_banner
    check_screen

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

    log_step "Starting infrastructure (PostgreSQL, Redis)..."
    if ! docker compose -p smartspecpro -f docker-compose.infra.yml up -d; then
        log_error "Failed to start infrastructure services"
        log_warn "Check Docker is running: docker ps"
        exit 1
    fi
    log_info "Infrastructure containers started"

    # Wait for PostgreSQL and Redis to be ready
    if ! wait_for_postgres; then
        log_error "PostgreSQL failed to become ready"
        exit 1
    fi

    if ! wait_for_redis; then
        log_error "Redis failed to become ready"
        exit 1
    fi

    echo ""
    log_step "Starting Nginx reverse proxy..."
    if ! start_nginx; then
        log_error "Failed to start Nginx"
        exit 1
    fi

    if ! wait_for_nginx; then
        log_error "Nginx failed to start properly"
        exit 1
    fi

    echo ""
    log_step "Starting services in screen sessions..."

    # Start Backend first (Web depends on it)
    if ! start_service "smartspec-backend" "bash dev-local.sh backend"; then
        log_error "Failed to start backend service"
        exit 1
    fi

    # Wait for backend to be healthy before starting web
    if ! wait_for_backend; then
        log_error "Backend health check failed! Cannot start web service."
        exit 1
    fi

    # Start Web
    if ! start_service "smartspec-web" "bash dev-local.sh web"; then
        log_error "Failed to start web service"
        exit 1
    fi

    # Start Docker Status UI
    if ! start_service "smartspec-docker-status" "cd docker-status && npm run dev"; then
        log_error "Failed to start docker status service"
        exit 1
    fi

    if ! wait_for_docker_status; then
        log_error "Docker Status health check failed!"
        exit 1
    fi

    # Start Docker media workers (replaces host-based celery)
    echo ""
    if ! start_media_workers; then
        log_error "Failed to start media workers"
        exit 1
    fi

    # Brief validation check
    sleep 3
    local failed_workers=0
    for worker in smartspec-celery-media smartspec-celery-beat; do
        if ! docker ps --format '{{.Names}}' | grep -q "^${worker}$"; then
            log_warn "✗ ${worker} is not running"
            ((failed_workers++))
        fi
    done

    if [ $failed_workers -gt 0 ]; then
        log_warn "${failed_workers} media worker(s) failed to start - check logs with: docker logs <container>"
    else
        log_info "✓ All media workers validated"
    fi

    echo ""
    log_info "All services started successfully!"

    # Show detailed startup summary
    show_startup_summary

    echo -e "${GREEN}Services URLs:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │ SmartSpec Web      │ http://localhost:3000                  │"
    echo "  │ Python Backend     │ http://localhost:8000                  │"
    echo "  │ Docker Status UI   │ http://localhost:3001                  │"
    echo "  │ Flower Dashboard   │ http://localhost:5555                  │"
    echo "  │ Public Domain      │ https://smartaihub.app                 │"
    echo "  │ Docker Status URL  │ https://docker.smartaihub.app          │"
    echo "  │ Public API         │ https://api.smartaihub.app             │"
    echo "  └─────────────────────────────────────────────────────────────┘"
    echo ""
    echo -e "${CYAN}Useful commands:${NC}"
    echo "  ./run-services.sh status          - Show service status"
    echo "  ./run-services.sh attach web      - Attach to web console"
    echo "  ./run-services.sh attach backend  - Attach to backend console"
    echo "  ./run-services.sh logs web        - View web logs"
    echo "  ./run-services.sh logs media      - View media worker logs"
    echo "  ./run-services.sh restart media   - Restart media workers"
    echo "  ./run-services.sh stop            - Stop all services"
    echo ""
    echo -e "${YELLOW}Tip:${NC} To detach from screen, press: Ctrl+A then D"
}

cmd_stop() {
    log_step "Stopping all services..."

    stop_service "smartspec-web"
    stop_service "smartspec-backend"
    stop_service "smartspec-docker-status"

    # Stop Docker media workers
    stop_media_workers

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
    echo -e "${BLUE}━━━ Infrastructure Services ━━━${NC}"

    # PostgreSQL
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$'; then
        if docker exec smartspec-postgres pg_isready -U smartspec -d smartspec > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} PostgreSQL       Running (port 5432)"
        else
            echo -e "  ${YELLOW}⚠${NC} PostgreSQL       Running but not ready"
        fi
    else
        echo -e "  ${RED}✗${NC} PostgreSQL       Not running"
    fi

    # Redis
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$'; then
        local redis_status=$(docker exec smartspec-redis redis-cli ping 2>/dev/null || echo "FAILED")
        if [ "$redis_status" = "PONG" ]; then
            echo -e "  ${GREEN}✓${NC} Redis            Running (port 6379)"
        else
            echo -e "  ${YELLOW}⚠${NC} Redis            Running but not responding"
        fi
    else
        echo -e "  ${RED}✗${NC} Redis            Not running"
    fi

    # Nginx
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$'; then
        local nginx_test=$(docker exec smartspec-nginx-dev nginx -t 2>&1 | grep -q "successful" && echo "ok" || echo "error")
        if [ "$nginx_test" = "ok" ]; then
            echo -e "  ${GREEN}✓${NC} Nginx            Running (ports 80, 443) → https://smartaihub.app"
        else
            echo -e "  ${YELLOW}⚠${NC} Nginx            Running but config has errors"
        fi
    else
        echo -e "  ${RED}✗${NC} Nginx            Not running (https://smartaihub.app unavailable!)"
    fi

    echo ""
    # 2. Application Layer
    echo -e "${BLUE}━━━ Application Services ━━━${NC}"

    # Backend
    if screen -list | grep -q "\.smartspec-backend"; then
        local backend_health=$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unreachable")
        if [ "$backend_health" = "healthy" ]; then
            echo -e "  ${GREEN}✓${NC} Python Backend   Running (healthy) → http://localhost:8000"
        elif [ "$backend_health" = "degraded" ]; then
            echo -e "  ${YELLOW}⚠${NC} Python Backend   Running (degraded) → http://localhost:8000"
        else
            echo -e "  ${YELLOW}⚠${NC} Python Backend   Running but not responding"
        fi
    else
        echo -e "  ${RED}✗${NC} Python Backend   Not running"
    fi

    # Web
    if screen -list | grep -q "\.smartspec-web"; then
        local web_responding=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
        if [ "$web_responding" = "200" ] || [ "$web_responding" = "304" ]; then
            echo -e "  ${GREEN}✓${NC} Web Application  Running → http://localhost:3000"
        else
            echo -e "  ${YELLOW}⚠${NC} Web Application  Running but not responding (code: $web_responding)"
        fi
    else
        echo -e "  ${RED}✗${NC} Web Application  Not running"
    fi

    # Docker Status
    if screen -list | grep -q "\.smartspec-docker-status"; then
        local ds_responding=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null || echo "000")
        if [ "$ds_responding" = "200" ]; then
            echo -e "  ${GREEN}✓${NC} Docker Status    Running → https://docker.smartaihub.app"
        else
            echo -e "  ${YELLOW}⚠${NC} Docker Status    Running but not healthy (code: $ds_responding)"
        fi
    else
        echo -e "  ${RED}✗${NC} Docker Status    Not running"
    fi

    echo ""
    # 3. Background Workers
    echo -e "${BLUE}━━━ Celery Workers (Background Tasks) ━━━${NC}"

    # Media Worker
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-media$'; then
        local media_status=$(docker inspect --format='{{.State.Status}}' smartspec-celery-media 2>/dev/null)
        local media_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}no healthcheck{{end}}' smartspec-celery-media 2>/dev/null)
        if [ "$media_status" = "running" ]; then
            echo -e "  ${GREEN}✓${NC} Media Worker     Running (health: $media_health)"
        else
            echo -e "  ${RED}✗${NC} Media Worker     Status: $media_status"
        fi
    else
        echo -e "  ${RED}✗${NC} Media Worker     Not running"
    fi

    # Video Worker (if exists)
    if docker ps -a --format '{{.Names}}' | grep -q '^smartspec-celery-video$'; then
        if docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-video$'; then
            local video_status=$(docker inspect --format='{{.State.Status}}' smartspec-celery-video 2>/dev/null)
            echo -e "  ${GREEN}✓${NC} Video Worker     Running"
        else
            echo -e "  ${RED}✗${NC} Video Worker     Not running"
        fi
    fi

    # Beat Scheduler
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-beat$'; then
        local beat_status=$(docker inspect --format='{{.State.Status}}' smartspec-celery-beat 2>/dev/null)
        if [ "$beat_status" = "running" ]; then
            echo -e "  ${GREEN}✓${NC} Beat Scheduler   Running (periodic tasks)"
        else
            echo -e "  ${RED}✗${NC} Beat Scheduler   Status: $beat_status"
        fi
    else
        echo -e "  ${RED}✗${NC} Beat Scheduler   Not running"
    fi

    # Flower Dashboard
    if docker ps --format '{{.Names}}' | grep -q '^smartspec-flower$'; then
        local flower_status=$(docker inspect --format='{{.State.Status}}' smartspec-flower 2>/dev/null)
        if [ "$flower_status" = "running" ]; then
            echo -e "  ${GREEN}✓${NC} Flower Dashboard Running → http://localhost:5555"
        else
            echo -e "  ${RED}✗${NC} Flower Dashboard Status: $flower_status"
        fi
    else
        echo -e "  ${RED}✗${NC} Flower Dashboard Not running"
    fi

    echo ""
    # 4. Summary
    echo -e "${BLUE}━━━ Service Summary ━━━${NC}"

    # Count running services
    local total_services=10  # PostgreSQL, Redis, Nginx, Backend, Web, Docker Status, Media, Beat, Flower (+ optional Video)
    local running_count=0

    docker ps --format '{{.Names}}' | grep -q '^smartspec-postgres$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-redis$' && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-nginx-dev$' && ((running_count++)) || true
    screen -list 2>/dev/null | grep -q "\.smartspec-backend" && ((running_count++)) || true
    screen -list 2>/dev/null | grep -q "\.smartspec-web" && ((running_count++)) || true
    screen -list 2>/dev/null | grep -q "\.smartspec-docker-status" && ((running_count++)) || true
    docker ps --format '{{.Names}}' | grep -q '^smartspec-celery-media$' && ((running_count++)) || true
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
    echo "  ./run-services.sh start          - Start all services"
    echo "  ./run-services.sh attach backend - Attach to backend console"
    echo "  ./run-services.sh attach docker  - Attach to docker-status console"
    echo "  ./run-services.sh logs media     - View media worker logs"
    echo "  ./run-services.sh restart media  - Restart media workers"
    echo ""
}

cmd_attach() {
    local service=$1

    case "$service" in
        web)
            if screen -list | grep -q "\.smartspec-web"; then
                log_info "Attaching to smartspec-web... (Press Ctrl+A then D to detach)"
                sleep 1
                screen -r smartspec-web
            else
                log_error "smartspec-web is not running"
            fi
            ;;
        backend)
            if screen -list | grep -q "\.smartspec-backend"; then
                log_info "Attaching to smartspec-backend... (Press Ctrl+A then D to detach)"
                sleep 1
                screen -r smartspec-backend
            else
                log_error "smartspec-backend is not running"
            fi
            ;;
        docker)
            if screen -list | grep -q "\.smartspec-docker-status"; then
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
            echo "  docker logs -f smartspec-celery-beat    # Beat scheduler logs"
            echo "  docker logs -f smartspec-flower         # Flower dashboard logs"
            echo "  http://localhost:5555                    # Flower web dashboard"
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./run-services.sh attach [web|backend|docker|media]"
            exit 1
            ;;
    esac
}

cmd_logs() {
    local service=$1

    case "$service" in
        web)
            if screen -list | grep -q "\.smartspec-web"; then
                log_info "Showing logs for smartspec-web... (Press Ctrl+C to exit)"
                screen -S smartspec-web -X hardcopy /tmp/smartspec-web.log
                cat /tmp/smartspec-web.log
                echo ""
                log_info "To see live logs, use: ./run-services.sh attach web"
            else
                log_error "smartspec-web is not running"
            fi
            ;;
        backend)
            if screen -list | grep -q "\.smartspec-backend"; then
                log_info "Showing logs for smartspec-backend... (Press Ctrl+C to exit)"
                screen -S smartspec-backend -X hardcopy /tmp/smartspec-backend.log
                cat /tmp/smartspec-backend.log
                echo ""
                log_info "To see live logs, use: ./run-services.sh attach backend"
            else
                log_error "smartspec-backend is not running"
            fi
            ;;
        docker)
            if screen -list | grep -q "\.smartspec-docker-status"; then
                log_info "Showing logs for smartspec-docker-status... (Press Ctrl+C to exit)"
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
            echo -e "${CYAN}=== celery-beat (last 10 lines) ===${NC}"
            docker logs --tail 10 smartspec-celery-beat 2>&1 || echo "  Container not running"
            echo ""
            log_info "For live logs: docker logs -f smartspec-celery-media"
            log_info "Flower dashboard: http://localhost:5555"
            ;;
        *)
            log_error "Unknown service: $service"
            echo "Usage: ./run-services.sh logs [web|backend|docker|media]"
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
                stop_service "smartspec-web"
                sleep 1
                start_service "smartspec-web" "bash dev-local.sh web"
                ;;
            backend)
                stop_service "smartspec-backend"
                sleep 1
                start_service "smartspec-backend" "bash dev-local.sh backend"
                ;;
            docker)
                stop_service "smartspec-docker-status"
                sleep 1
                start_service "smartspec-docker-status" "cd docker-status && npm run dev"
                ;;
            media)
                log_step "Restarting Docker media workers..."
                cd "$PROJECT_ROOT"
                docker compose -p smartspecpro -f "$MEDIA_COMPOSE" restart
                log_info "Docker media workers restarted"
                ;;
            *)
                log_error "Unknown service: $service"
                echo "Usage: ./run-services.sh restart [web|backend|docker|media]"
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
    echo "  start                Start all services (screen + Docker media workers)"
    echo "  stop                 Stop all services"
    echo "  restart [service]    Restart all services or specific service"
    echo "  status               Show status of all services"
    echo "  attach <service>     Attach to service console (web|backend|docker|media)"
    echo "  logs <service>       View service logs (web|backend|docker|media)"
    echo "  help                 Show this help message"
    echo ""
    echo -e "${CYAN}Services:${NC}"
    echo "  web       SmartSpec Web (Node.js/React, screen session)"
    echo "  backend   Python Backend (FastAPI, screen session)"
    echo "  docker    Docker Status UI (Node.js/React, screen session)"
    echo "  media     Media Workers (Docker: celery-media, celery-video, celery-beat, flower)"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./run-services.sh start          # Start all services"
    echo "  ./run-services.sh status         # Check status"
    echo "  ./run-services.sh attach backend # Attach to backend console"
    echo "  ./run-services.sh logs docker    # View docker-status logs"
    echo "  ./run-services.sh logs media     # View media worker logs"
    echo "  ./run-services.sh restart media  # Restart media workers"
    echo "  ./run-services.sh stop           # Stop everything"
    echo ""
    echo -e "${CYAN}Docker Media Workers:${NC}"
    echo "  celery-media   API-bound media generation (2 CPUs, 3GB)"
    echo "  celery-video   FFmpeg video rendering (4 CPUs, 8GB)"
    echo "  celery-beat    Periodic task scheduler"
    echo "  flower         Monitoring dashboard → http://localhost:5555"
    echo ""
    echo -e "${YELLOW}Screen Tips:${NC}"
    echo "  Ctrl+A then D  - Detach from screen (leave it running)"
    echo "  Ctrl+A then K  - Kill current screen window"
    echo "  Ctrl+C         - Stop the process in screen"
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
