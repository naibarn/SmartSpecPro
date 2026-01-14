#!/bin/bash

# SmartSpecPro Production Deployment Script
# สคริปต์สำหรับ Deploy ระบบขึ้น Production (Build, Security Check, Deploy)

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
    echo "║                SmartSpecPro Production Deploy                 ║"
    echo "║          Preparing System for Production Environment          ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ตรวจสอบไฟล์ .env
check_env() {
    if [ ! -f ".env" ]; then
        log_error ".env file not found! Please create it from .env.example"
        exit 1
    fi
    
    # ตรวจสอบความปลอดภัยเบื้องต้นใน .env
    if grep -q "your-session-secret-change-in-production" .env; then
        log_warn "SESSION_SECRET is still using the default value. Please change it for production!"
    fi
}

print_banner
check_env

# 1. รันการทดสอบทั้งหมดก่อน Deploy
log_step "1. Running all tests to ensure stability..."
if [ -f "./dev.sh" ]; then
    ./dev.sh test all || { log_error "Tests failed! Deployment aborted."; exit 1; }
else
    log_warn "dev.sh not found, skipping automated tests."
fi

# 2. Build Docker Images สำหรับ Production
log_step "2. Building Production Docker Images..."
docker compose -f docker-compose.full.yml build --no-cache

# 3. Build Desktop Application (Production Release)
log_step "3. Building Desktop Application (Production Release)..."
cd desktop-app
if [ -d "node_modules" ]; then
    pnpm tauri build
else
    pnpm install && pnpm tauri build
fi
cd ..

# 4. เริ่มต้นระบบในโหมด Production
log_step "4. Deploying services with Docker Compose..."
docker compose -f docker-compose.full.yml up -d

# 5. ตรวจสอบสถานะหลัง Deploy
echo ""
log_step "5. Verifying Deployment Status..."
sleep 10
docker compose -f docker-compose.full.yml ps

# 6. สรุปผล
echo ""
echo -e "${GREEN}✅ Deployment to Production completed successfully!${NC}"
echo "--------------------------------------------------"
echo -e "Web Interface:    ${CYAN}http://localhost:3000${NC}"
echo -e "Backend API:      ${CYAN}http://localhost:8000${NC}"
echo -e "Control Plane:    ${CYAN}http://localhost:7070${NC}"
echo "--------------------------------------------------"
log_info "Desktop App installer can be found in: desktop-app/src-tauri/target/release/bundle/"
echo ""
