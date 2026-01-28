#!/bin/bash

# SmartSpecPro Automated Tasks Setup (Cron)
# สคริปต์สำหรับตั้งค่าการสำรองข้อมูลและตรวจสอบการกู้คืนอัตโนมัติ

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

# รับเส้นทางปัจจุบันของโปรเจกต์
PROJECT_DIR=$(pwd)
BACKUP_SCRIPT="$PROJECT_DIR/backup-prod.sh"
RESTORE_TEST_SCRIPT="$PROJECT_DIR/restore-test.sh"
LOG_DIR="$PROJECT_DIR/logs"

mkdir -p "$LOG_DIR"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                SmartSpecPro Cron Job Setup                    ║"
echo "║          Automating Backups & Restore Verification            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# ตรวจสอบว่าสคริปต์มีอยู่จริงและรันได้
if [ ! -f "$BACKUP_SCRIPT" ] || [ ! -f "$RESTORE_TEST_SCRIPT" ]; then
    echo -e "${RED}[ERROR]${NC} Required scripts not found in $PROJECT_DIR"
    exit 1
fi

chmod +x "$BACKUP_SCRIPT" "$RESTORE_TEST_SCRIPT"

# สร้างเนื้อหาสำหรับ Cron
# 1. สำรองข้อมูลทุกวัน เวลา 02:00 น.
# 2. ทดสอบการกู้คืนทุกวันอาทิตย์ เวลา 04:00 น.
CRON_BACKUP="0 2 * * * cd $PROJECT_DIR && ./backup-prod.sh >> $LOG_DIR/backup.log 2>&1"
CRON_RESTORE_TEST="0 4 * * 0 cd $PROJECT_DIR && ./restore-test.sh >> $LOG_DIR/restore_test.log 2>&1"

log_step "Current user: $(whoami)"
log_step "Setting up the following tasks:"
echo "  - Daily Backup: Every day at 02:00 AM"
echo "  - Weekly Restore Test: Every Sunday at 04:00 AM"

# อ่าน cron เดิมที่มีอยู่ (ถ้ามี)
TMP_CRON=$(mktemp)
crontab -l > "$TMP_CRON" 2>/dev/null || true

# ลบรายการเดิมที่เกี่ยวกับ SmartSpecPro ออกก่อนเพื่อป้องกันการซ้ำซ้อน
sed -i "/SmartSpecPro/d" "$TMP_CRON"
sed -i "/backup-prod.sh/d" "$TMP_CRON"
sed -i "/restore-test.sh/d" "$TMP_CRON"

# เพิ่มรายการใหม่
echo "# SmartSpecPro Automated Tasks" >> "$TMP_CRON"
echo "$CRON_BACKUP" >> "$TMP_CRON"
echo "$CRON_RESTORE_TEST" >> "$TMP_CRON"

# ติดตั้ง crontab ใหม่
if crontab "$TMP_CRON"; then
    log_info "Cron jobs installed successfully!"
    echo ""
    echo -e "${YELLOW}Current Crontab:${NC}"
    crontab -l | grep "SmartSpecPro" -A 2
else
    echo -e "${RED}[ERROR]${NC} Failed to install cron jobs."
fi

rm "$TMP_CRON"

echo ""
log_info "Logs will be stored in: $LOG_DIR"
echo "--------------------------------------------------"
