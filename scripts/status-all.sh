#!/bin/bash

# SmartSpecPro Full Stack Status Script
# ตรวจสอบสถานะการทำงานของทุกโมดูล (Docker, Ports, Desktop App)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                SmartSpecPro System Status                     ║"
echo "║           Checking All Services & Applications                ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. ตรวจสอบ Docker Services
log_step "1. Docker Services Status:"
if [ -f "./dev.sh" ]; then
    ./dev.sh status
else
    docker compose -f docker-compose.dev.yml -p smartspec ps
fi

# 2. ตรวจสอบ Desktop App Processes
echo ""
log_step "2. Desktop Application Processes:"
TAURI_PID=$(pgrep -f "tauri" | head -n 1)
VITE_PID=$(pgrep -f "vite" | head -n 1)

if [ ! -z "$TAURI_PID" ]; then
    echo -e "  Tauri App:    ${GREEN}RUNNING${NC} (PID: $TAURI_PID)"
else
    echo -e "  Tauri App:    ${RED}STOPPED${NC}"
fi

if [ ! -z "$VITE_PID" ]; then
    echo -e "  Vite Server:  ${GREEN}RUNNING${NC} (PID: $VITE_PID)"
else
    echo -e "  Vite Server:  ${RED}STOPPED${NC}"
fi

# 3. ตรวจสอบ Network Ports
echo ""
log_step "3. Network Ports & Connectivity:"
declare -A services=(
    ["3000"]="SmartSpec Web"
    ["8000"]="Python Backend"
    ["5432"]="PostgreSQL"
    ["6379"]="Redis"
    ["7070"]="Control Plane"
)

for port in "${!services[@]}"; do
    name=${services[$port]}
    if nc -z localhost $port 2>/dev/null; then
        echo -e "  Port $port ($name): ${GREEN}LISTENING${NC}"
    else
        echo -e "  Port $port ($name): ${RED}CLOSED${NC}"
    fi
done

# 4. ตรวจสอบ Backend Health API
echo ""
log_step "4. Backend Health Check:"
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health 2>/dev/null || echo "FAILED")
if [ "$HEALTH_STATUS" == "200" ]; then
    echo -e "  API Health: ${GREEN}OK (200)${NC}"
else
    echo -e "  API Health: ${RED}UNREACHABLE ($HEALTH_STATUS)${NC}"
fi

echo ""
echo "--------------------------------------------------"
log_info "Status check complete."
echo ""
