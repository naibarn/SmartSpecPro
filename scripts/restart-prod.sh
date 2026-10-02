#!/bin/bash

# SmartAIHub Production Restart Script
# สคริปต์สำหรับรีสตาร์ทบริการต่างๆ ในโหมด Production

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.full.yml"
PROJECT_NAME="smartspec"

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_usage() {
    echo -e "${CYAN}Usage:${NC} ./restart-prod.sh [service_name]"
    echo ""
    echo -e "${YELLOW}Available Services:${NC}"
    echo "  backend        - Python FastAPI Backend"
    echo "  web            - SmartSpec Web Application"
    echo "  node-worker    - Feature 186 PostgreSQL Node Job Worker"
    echo "  python-worker  - Feature 186 PostgreSQL Python Job Worker"
    echo "  db             - PostgreSQL Database"
    echo "  chroma         - ChromaDB Vector Store"
    echo "  control        - Control Plane"
    echo "  docker-status  - Docker Monitoring Service"
    echo "  all            - Restart all services"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    echo "  ./restart-prod.sh backend"
    echo "  sudo ./restart-prod.sh backend"
    echo "  ./restart-prod.sh all"
}

# ตรวจสอบว่ามี Docker Compose หรือไม่
if ! docker compose version &> /dev/null; then
    DOCKER_CMD="docker-compose"
else
    DOCKER_CMD="docker compose"
fi

SERVICE=$1

if [ -z "$SERVICE" ] || [ "$SERVICE" == "help" ] || [ "$SERVICE" == "--help" ]; then
    print_usage
    exit 0
fi

# Route native production services to systemd; keep infrastructure services on Compose.
case "$SERVICE" in
    backend) SYSTEMD_TARGET="smartspec-backend.service" ;;
    web) SYSTEMD_TARGET="smartspec-web.service" ;;
    node-worker|worker) SYSTEMD_TARGET="smartspec-node-worker.service" ;;
    python-worker|python-job-worker) SYSTEMD_TARGET="smartspec-python-job-worker.service" ;;
    db|postgres) TARGET="postgres" ;;
    chroma|chromadb) TARGET="chromadb" ;;
    control|cp) TARGET="control-plane" ;;
    docker-status|ds) TARGET="docker-status" ;;
    all) TARGET="" ;;
    *) log_error "Unknown service: $SERVICE"; print_usage; exit 1 ;;
esac

if [ -n "${SYSTEMD_TARGET:-}" ] || [ "$SERVICE" = "all" ]; then
    if [ "$EUID" -ne 0 ]; then
        log_error "Restarting systemd services requires root privileges."
        echo "Run: sudo \"$0\" $SERVICE" >&2
        exit 1
    fi
fi

restart_systemd_service() {
    local systemd_service="$1"

    log_step "Restarting systemd service: $systemd_service..."
    if ! systemctl restart "$systemd_service"; then
        log_error "systemctl failed to restart $systemd_service."
        systemctl status "$systemd_service" --no-pager || true
        return 1
    fi
    if ! systemctl is-active --quiet "$systemd_service"; then
        log_error "$systemd_service did not become active after restart."
        systemctl status "$systemd_service" --no-pager || true
        return 1
    fi

    log_info "$systemd_service is active after restart."
    systemctl show "$systemd_service" -p ActiveEnterTimestamp -p MainPID --no-pager || true
}

if [ -n "${SYSTEMD_TARGET:-}" ]; then
    restart_systemd_service "$SYSTEMD_TARGET" || exit 1
elif [ -z "$TARGET" ]; then
    log_step "Restarting ALL services in Production..."
    if ! $DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart; then
        log_error "Docker Compose failed to restart production services."
        exit 1
    fi
    for systemd_service in \
        smartspec-web.service \
        smartspec-backend.service \
        smartspec-node-worker.service \
        smartspec-python-job-worker.service; do
        restart_systemd_service "$systemd_service" || exit 1
    done
else
    log_step "Restarting service: $TARGET..."
    if ! $DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart "$TARGET"; then
        log_error "Docker Compose failed to restart $TARGET."
        exit 1
    fi
fi

echo "--------------------------------------------------"
log_info "Restart command completed successfully."
echo ""
# แสดงสถานะหลังรีสตาร์ท
if [ -z "${SYSTEMD_TARGET:-}" ]; then
    $DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
fi
if [ "$SERVICE" = "all" ]; then
    systemctl --no-pager status \
        smartspec-web.service smartspec-backend.service \
        smartspec-node-worker.service smartspec-python-job-worker.service
fi
