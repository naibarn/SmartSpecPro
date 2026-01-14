#!/bin/bash

# SmartSpecPro Full Stack Run Script
# รันทุกโมดูลพร้อมกัน (Docker Services + Desktop App)

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

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║                SmartSpecPro Full Stack Run                    ║"
    echo "║          Starting Services & Desktop Application              ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ฟังก์ชันสำหรับจัดการเมื่อกด Ctrl+C
cleanup() {
    echo ""
    log_warn "Shutting down all processes..."
    ./dev.sh stop
    # ฆ่า process ของ desktop app ที่รันอยู่ใน background
    pkill -P $$ || true
    log_info "All processes stopped. Goodbye!"
    exit 0
}

trap cleanup SIGINT SIGTERM

print_banner

# 1. ตรวจสอบ Docker
if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker first."
    exit 1
fi

# 2. เริ่มต้น Docker Services (Backend, Web, DB, etc.)
log_step "Starting Docker services (Backend, Database, Redis, etc.)..."
./dev.sh start

# 3. รอให้ Backend พร้อมใช้งาน
log_step "Waiting for Python Backend to be ready..."
until curl -s http://localhost:8000/health > /dev/null; do
    echo -n "."
    sleep 2
done
echo ""
log_info "Backend is ready!"

# 4. เริ่มต้น Desktop App
log_step "Starting Desktop Application (Tauri)..."
log_info "Note: This will open a new window. Keep this terminal open to see logs."

# รัน desktop app ใน background เพื่อให้สคริปต์ทำงานต่อได้
./dev.sh desktop &

# 5. แสดงสถานะและคำแนะนำ
echo ""
echo -e "${GREEN}🚀 SmartSpecPro is now running!${NC}"
echo "--------------------------------------------------"
echo -e "SmartSpec Web:    ${CYAN}http://localhost:3000${NC}"
echo -e "Python Backend:   ${CYAN}http://localhost:8000${NC}"
echo -e "API Docs:         ${CYAN}http://localhost:8000/docs${NC}"
echo "--------------------------------------------------"
echo -e "${YELLOW}Press Ctrl+C to stop all services and exit.${NC}"
echo ""

# รอให้ background process ทำงานต่อไป
wait
