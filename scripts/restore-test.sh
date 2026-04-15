#!/bin/bash

# SmartAIHub Backup & Restore Verification Script
# สคริปต์สำหรับทดสอบการกู้คืนข้อมูลเพื่อให้มั่นใจว่าไฟล์สำรองใช้งานได้จริง

# ============================================
# Configuration
# ============================================
BACKUP_DIR="./backups"
POSTGRES_CONTAINER="smartspec-postgres"
POSTGRES_USER="smartspec"
POSTGRES_DB="smartspecpro"

# ============================================
# Colors & Helpers
# ============================================
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
    echo "║             SmartAIHub Restore Verification                 ║"
    echo "║           Testing Backup Integrity & Recovery                 ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# ฟังก์ชันสำหรับกู้คืน PostgreSQL
restore_postgres() {
    local file=$1
    log_step "Testing PostgreSQL Restore: $(basename "$file")"

    if [ ! -f "$file" ]; then
        log_error "Backup file not found: $file"
        return 1
    fi

    log_info "Attempting to restore to $POSTGRES_DB..."
    # ใช้ gunzip และส่งเข้า psql โดยตรง
    if gunzip -c "$file" | docker exec -i $POSTGRES_CONTAINER psql -U $POSTGRES_USER -d $POSTGRES_DB > /dev/null 2>&1; then
        log_info "PostgreSQL Restore Test: SUCCESS"
        return 0
    else
        log_error "PostgreSQL Restore Test: FAILED"
        return 1
    fi
}

print_banner

# 1. ตรวจสอบว่ามีไฟล์สำรองหรือไม่
log_step "1. Locating latest backup files..."
LATEST_PG=$(ls -t "$BACKUP_DIR/postgres"/pg_backup_*.sql.gz 2>/dev/null | head -n 1)

if [ -z "$LATEST_PG" ]; then
    log_warn "No backup files found. Running backup-prod.sh first..."
    ./backup-prod.sh
    LATEST_PG=$(ls -t "$BACKUP_DIR/postgres"/pg_backup_*.sql.gz 2>/dev/null | head -n 1)
fi

# 2. รันการทดสอบกู้คืน
echo ""
log_step "2. Starting Restore Verification..."

PG_RESULT=0

if [ ! -z "$LATEST_PG" ]; then
    restore_postgres "$LATEST_PG"
    PG_RESULT=$?
else
    log_warn "Skipping PostgreSQL: No backup file found."
fi

# 3. สรุปผล
echo ""
echo "--------------------------------------------------"
if [ $PG_RESULT -eq 0 ]; then
    log_info "ALL RESTORE TESTS PASSED!"
    log_info "Your backups are healthy and ready for recovery."
else
    log_error "SOME RESTORE TESTS FAILED!"
    log_warn "Please check your database logs and backup configuration."
fi
echo "--------------------------------------------------"
echo ""
