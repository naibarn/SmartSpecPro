#!/bin/bash

# SmartSpecPro Production Log Viewer
# สคริปต์สำหรับตรวจสอบ Log ของบริการต่างๆ ในโหมด Production

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

COMPOSE_FILE="docker-compose.full.yml"
PROJECT_NAME="smartspec"

log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

print_usage() {
    echo -e "${CYAN}Usage:${NC} ./logs-prod.sh [service_name] [--tail N] [--follow]"
    echo ""
    echo -e "${YELLOW}Available Services:${NC}"
    echo "  backend        - Python FastAPI Backend"
    echo "  web            - SmartSpec Web Application"
    echo "  db             - PostgreSQL Database"
    echo "  mysql          - MySQL Database"
    echo "  redis          - Redis Cache"
    echo "  chroma         - ChromaDB Vector Store"
    echo "  control        - Control Plane"
    echo "  docker-status  - Docker Monitoring Service"
    echo "  all            - View logs from all services"
    echo ""
    echo -e "${YELLOW}Options:${NC}"
    echo "  --tail N       - Show last N lines (default: 100)"
    echo "  --follow, -f   - Stream logs in real-time"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    echo "  ./logs-prod.sh backend --follow"
    echo "  ./logs-prod.sh all --tail 50"
}

# ตรวจสอบว่ามี Docker Compose หรือไม่
if ! docker compose version &> /dev/null; then
    DOCKER_CMD="docker-compose"
else
    DOCKER_CMD="docker compose"
fi

SERVICE=$1
TAIL=100
FOLLOW=""

# จัดการ Arguments
shift
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --tail) TAIL="$2"; shift ;;
        --follow|-f) FOLLOW="-f" ;;
        *) echo "Unknown parameter: $1"; print_usage; exit 1 ;;
    esac
    shift
done

# แมปชื่อบริการให้ตรงกับ docker-compose.full.yml
case "$SERVICE" in
    backend) TARGET="python-backend" ;;
    web) TARGET="smartspec-web" ;;
    db|postgres) TARGET="postgres" ;;
    mysql) TARGET="mysql" ;;
    redis) TARGET="redis" ;;
    chroma|chromadb) TARGET="chromadb" ;;
    control|cp) TARGET="control-plane" ;;
    docker-status|ds) TARGET="docker-status" ;;
    all|"") TARGET="" ;;
    help|--help) print_usage; exit 0 ;;
    *) log_error "Unknown service: $SERVICE"; print_usage; exit 1 ;;
esac

log_step "Fetching logs for: ${TARGET:-all services} (Tail: $TAIL, Follow: ${FOLLOW:-No})"
echo "--------------------------------------------------"

$DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs $FOLLOW --tail="$TAIL" $TARGET
