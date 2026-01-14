#!/bin/bash

# SmartSpecPro System Health Monitor & Alert Script
# ตรวจสอบสุขภาพของระบบและส่งการแจ้งเตือนผ่าน Webhook (Discord/Slack)

# ============================================
# Configuration
# ============================================
# ใส่ URL ของ Webhook ของคุณที่นี่ (หรือตั้งค่าใน .env)
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
CHECK_INTERVAL=300 # ตรวจสอบทุกๆ 5 นาที (300 วินาที)
PROJECT_NAME="SmartSpecPro-Production"

# รายการบริการและ URL ที่ต้องตรวจสอบ
declare -A SERVICES=(
    ["SmartSpec Web"]="http://localhost:3000/health"
    ["Python Backend"]="http://localhost:8000/health"
    ["Control Plane"]="http://localhost:7070/health"
)

# รายการพอร์ตที่ต้องตรวจสอบ (TCP Check)
declare -A PORTS=(
    ["PostgreSQL"]="5432"
    ["Redis"]="6379"
    ["MySQL"]="3306"
)

# ============================================
# Colors & Helpers
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

send_alert() {
    local message="$1"
    local level="$2" # INFO, WARN, CRITICAL
    
    if [ -z "$WEBHOOK_URL" ]; then
        echo -e "${YELLOW}[ALERT-SKIP]${NC} Webhook URL not set. Message: $message"
        return
    fi

    # สร้าง JSON สำหรับ Discord (ปรับแต่งได้ตามต้องการ)
    local color=3066993 # Blue
    if [ "$level" == "CRITICAL" ]; then color=15158332; fi # Red
    if [ "$level" == "WARN" ]; then color=16776960; fi # Yellow

    local payload=$(cat <<EOF
{
  "username": "SmartSpec Monitor",
  "embeds": [{
    "title": "[$level] $PROJECT_NAME Status Update",
    "description": "$message",
    "color": $color,
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
EOF
)

    curl -H "Content-Type: application/json" -X POST -d "$payload" "$WEBHOOK_URL" > /dev/null 2>&1
}

check_health() {
    echo "--- Starting Health Check: $(date) ---"
    local issues=""

    # 1. ตรวจสอบ HTTP Services
    for name in "${!SERVICES[@]}"; do
        url=${SERVICES[$name]}
        status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" || echo "DOWN")
        
        if [ "$status" != "200" ]; then
            issues+="- ❌ $name is DOWN (Status: $status)\n"
            echo -e "${RED}[ERROR]${NC} $name is down."
        else
            echo -e "${GREEN}[OK]${NC} $name is healthy."
        fi
    done

    # 2. ตรวจสอบ TCP Ports
    for name in "${!PORTS[@]}"; do
        port=${PORTS[$name]}
        if ! nc -z localhost "$port" 2>/dev/null; then
            issues+="- ❌ $name (Port $port) is NOT RESPONDING\n"
            echo -e "${RED}[ERROR]${NC} $name is down."
        else
            echo -e "${GREEN}[OK]${NC} $name is up."
        fi
    done

    # 3. ส่งการแจ้งเตือนหากพบปัญหา
    if [ ! -z "$issues" ]; then
        send_alert "Detected system issues:\n$issues" "CRITICAL"
    else
        echo "All services are healthy."
    fi
}

# โหมดการทำงาน
case "$1" in
    "once")
        check_health
        ;;
    "daemon")
        echo "Starting monitor daemon (Interval: ${CHECK_INTERVAL}s)..."
        send_alert "Monitor daemon started for $PROJECT_NAME" "INFO"
        while true; do
            check_health
            sleep "$CHECK_INTERVAL"
        done
        ;;
    *)
        echo "Usage: $0 {once|daemon}"
        echo "  once   - Run check once and exit"
        echo "  daemon - Run in background and check periodically"
        ;;
esac
