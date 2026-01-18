#!/bin/bash

# SmartSpecPro Full Stack Restart Script
# รีสตาร์ททุกโมดูล (หยุดและเริ่มใหม่ทั้งหมด)

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║               SmartSpecPro Full Stack Restart                 ║"
echo "║            Refreshing All Services & Applications             ║"
╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. หยุดการทำงานทั้งหมด
log_step "Stopping all modules..."
if [ -f "./stop-all.sh" ]; then
    ./stop-all.sh
else
    log_error "stop-all.sh not found!"
    exit 1
fi

# เว้นระยะเวลาเล็กน้อยเพื่อให้ระบบคืนทรัพยากรสมบูรณ์
sleep 2

# 2. เริ่มการทำงานใหม่ทั้งหมด
log_step "Starting all modules again..."
if [ -f "./run-all.sh" ]; then
    ./run-all.sh
else
    log_error "run-all.sh not found!"
    exit 1
fi
