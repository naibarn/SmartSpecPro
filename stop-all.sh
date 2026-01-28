#!/bin/bash

# SmartSpecPro Full Stack Stop Script
# หยุดการทำงานของทุกโมดูล (Docker Services + Desktop App processes)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

echo -e "${YELLOW}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                SmartSpecPro Full Stack Stop                   ║"
echo "║          Shutting Down All Services & Applications            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. หยุด Desktop App processes
log_step "Stopping Desktop Application processes..."
# ค้นหาและหยุด process ที่เกี่ยวข้องกับ tauri และ vite
pkill -f "tauri" || true
pkill -f "vite" || true
log_info "Desktop app processes stopped."

# 2. หยุด Docker Services
log_step "Stopping Docker services (Backend, Database, Redis, etc.)..."
if [ -f "./dev.sh" ]; then
    ./dev.sh stop
else
    # กรณีหา dev.sh ไม่เจอ ให้ใช้ docker-compose โดยตรง
    docker compose -f docker-compose.dev.yml -p smartspec down
fi
log_info "Docker services stopped."

# 3. ตรวจสอบพอร์ตที่อาจค้างอยู่
log_step "Cleaning up remaining ports..."
for port in 3000 8000 5432 6379 7070 3001; do
    pid=$(lsof -t -i:$port 2>/dev/null)
    if [ ! -z "$pid" ]; then
        log_warn "Port $port is still in use by PID $pid. Killing it..."
        kill -9 $pid 2>/dev/null || true
    fi
done

echo ""
echo -e "${GREEN}✅ All SmartSpecPro modules have been stopped successfully.${NC}"
echo ""
