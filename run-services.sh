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

# Docker media workers management
start_media_workers() {
    log_step "Starting Docker media workers (celery-media, celery-video, celery-beat, flower)..."

    # Ensure the network exists (created by base infra stack)
    if ! docker network ls --format '{{.Name}}' | grep -q '^smartspecpro_default$'; then
        log_warn "Network smartspecpro_default not found — infra may not be running"
    fi

    cd "$PROJECT_ROOT"
    docker compose -f "$MEDIA_COMPOSE" up -d 2>&1

    # Check containers started
    local running
    running=$(docker compose -f "$MEDIA_COMPOSE" ps --status running -q 2>/dev/null | wc -l)
    if [ "$running" -ge 3 ]; then
        log_info "Docker media workers started ($running containers running)"
    else
        log_warn "Only $running media containers running — check: docker compose -f $MEDIA_COMPOSE ps"
    fi
}

stop_media_workers() {
    log_step "Stopping Docker media workers..."
    cd "$PROJECT_ROOT"
    docker compose -f "$MEDIA_COMPOSE" down 2>&1 || true
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

    log_step "Starting infrastructure..."
    sg docker -c "bash dev-local.sh infra start"

    echo ""
    log_step "Starting services in screen sessions..."

    # Start Web
    start_service "smartspec-web" "bash dev-local.sh web"

    # Start Backend
    start_service "smartspec-backend" "bash dev-local.sh backend"

    # Start Docker media workers (replaces host-based celery)
    echo ""
    start_media_workers

    echo ""
    log_info "All services started!"
    echo ""
    echo -e "${GREEN}Services URLs:${NC}"
    echo "  ┌─────────────────────────────────────────────────────────────┐"
    echo "  │ SmartSpec Web      │ http://localhost:3000                  │"
    echo "  │ Python Backend     │ http://localhost:8000                  │"
    echo "  │ Flower Dashboard   │ http://localhost:5555                  │"
    echo "  │ Public Domain      │ https://smartaihub.app                 │"
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

    # Stop Docker media workers
    stop_media_workers

    log_step "Stopping infrastructure..."
    sg docker -c "bash dev-local.sh infra stop"

    log_info "All services stopped"
}

cmd_status() {
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    echo ""

    # Check Web
    if screen -list | grep -q "\.smartspec-web"; then
        echo -e "  ${GREEN}✓${NC} SmartSpec Web (screen session: smartspec-web)"
    else
        echo -e "  ${RED}✗${NC} SmartSpec Web (not running)"
    fi

    # Check Backend
    if screen -list | grep -q "\.smartspec-backend"; then
        echo -e "  ${GREEN}✓${NC} Python Backend (screen session: smartspec-backend)"
    else
        echo -e "  ${RED}✗${NC} Python Backend (not running)"
    fi

    echo ""
    echo -e "${CYAN}Docker Media Workers:${NC}"
    media_workers_status

    echo ""
    echo -e "${CYAN}Infrastructure Status:${NC}"
    sg docker -c "bash dev-local.sh infra status"

    echo ""
    echo -e "${CYAN}Screen Sessions:${NC}"
    screen -list | grep smartspec || echo "  No screen sessions found"
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
            echo "Usage: ./run-services.sh attach [web|backend|media]"
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
            echo "Usage: ./run-services.sh logs [web|backend|media]"
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
            media)
                log_step "Restarting Docker media workers..."
                cd "$PROJECT_ROOT"
                docker compose -f "$MEDIA_COMPOSE" restart
                log_info "Docker media workers restarted"
                ;;
            *)
                log_error "Unknown service: $service"
                echo "Usage: ./run-services.sh restart [web|backend|media]"
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
    echo "  attach <service>     Attach to service console (web|backend|media)"
    echo "  logs <service>       View service logs (web|backend|media)"
    echo "  help                 Show this help message"
    echo ""
    echo -e "${CYAN}Services:${NC}"
    echo "  web       SmartSpec Web (Node.js/React, screen session)"
    echo "  backend   Python Backend (FastAPI, screen session)"
    echo "  media     Media Workers (Docker: celery-media, celery-video, celery-beat, flower)"
    echo ""
    echo -e "${CYAN}Examples:${NC}"
    echo "  ./run-services.sh start          # Start all services"
    echo "  ./run-services.sh status         # Check status"
    echo "  ./run-services.sh attach backend # Attach to backend console"
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
