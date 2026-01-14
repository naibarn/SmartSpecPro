#!/bin/bash

# SmartSpecPro Production Restart Script
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
    echo "  db             - PostgreSQL Database"
    echo "  mysql          - MySQL Database"
    echo "  redis          - Redis Cache"
    echo "  chroma         - ChromaDB Vector Store"
    echo "  control        - Control Plane"
    echo "  docker-status  - Docker Monitoring Service"
    echo "  all            - Restart all services"
    echo ""
    echo -e "${CYAN}Example:${NC}"
    echo "  ./restart-prod.sh backend"
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
    all) TARGET="" ;;
    *) log_error "Unknown service: $SERVICE"; print_usage; exit 1 ;;
esac

if [ -z "$TARGET" ]; then
    log_step "Restarting ALL services in Production..."
    $DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart
else
    log_step "Restarting service: $TARGET..."
    $DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" restart $TARGET
fi

echo "--------------------------------------------------"
log_info "Restart command sent successfully."
echo ""
# แสดงสถานะหลังรีสตาร์ท
$DOCKER_CMD -f "$COMPOSE_FILE" -p "$PROJECT_NAME" ps
