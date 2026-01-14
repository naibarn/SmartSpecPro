#!/bin/bash

# SmartSpecPro Production Backup Script
# สคริปต์สำหรับสำรองข้อมูลฐานข้อมูล (PostgreSQL & MySQL) และจัดการไฟล์สำรอง

# ============================================
# Configuration
# ============================================
BACKUP_DIR="./backups"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
RETENTION_DAYS=7 # เก็บไฟล์สำรองไว้ย้อนหลัง 7 วัน

# รายละเอียดคอนเทนเนอร์ (อ้างอิงจาก docker-compose.full.yml)
POSTGRES_CONTAINER="smartspec-postgres"
MYSQL_CONTAINER="smartspec-mysql"
POSTGRES_USER="smartspec"
POSTGRES_DB="smartspecpro"
MYSQL_USER="smartspec"
MYSQL_DB="smartspecweb"

# ============================================
# Colors & Helpers
# ============================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# สร้างโฟลเดอร์สำรองข้อมูลหากยังไม่มี
mkdir -p "$BACKUP_DIR/postgres"
mkdir -p "$BACKUP_DIR/mysql"

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                SmartSpecPro Database Backup                   ║"
echo "║              Starting Production Data Backup                  ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# 1. Backup PostgreSQL
log_step "1. Backing up PostgreSQL ($POSTGRES_DB)..."
PG_BACKUP_FILE="$BACKUP_DIR/postgres/pg_backup_$DATE.sql.gz"
if docker exec $POSTGRES_CONTAINER pg_dump -U $POSTGRES_USER $POSTGRES_DB | gzip > "$PG_BACKUP_FILE"; then
    log_info "PostgreSQL backup successful: $PG_BACKUP_FILE"
else
    log_error "PostgreSQL backup failed!"
fi

# 2. Backup MySQL
log_step "2. Backing up MySQL ($MYSQL_DB)..."
MY_BACKUP_FILE="$BACKUP_DIR/mysql/my_backup_$DATE.sql.gz"
# ดึงรหัสผ่านจาก environment variable ในคอนเทนเนอร์
MYSQL_PWD=$(docker exec $MYSQL_CONTAINER printenv MYSQL_PASSWORD)
if docker exec -e MYSQL_PWD=$MYSQL_PWD $MYSQL_CONTAINER /usr/bin/mysqldump -u $MYSQL_USER $MYSQL_DB | gzip > "$MY_BACKUP_FILE"; then
    log_info "MySQL backup successful: $MY_BACKUP_FILE"
else
    log_error "MySQL backup failed!"
fi

# 3. Cleanup old backups (Retention)
log_step "3. Cleaning up backups older than $RETENTION_DAYS days..."
find "$BACKUP_DIR" -type f -mtime +$RETENTION_DAYS -name "*.gz" -exec rm {} \;
log_info "Cleanup complete."

echo ""
echo "--------------------------------------------------"
log_info "Backup process finished at $(date)"
echo -e "Backup location: ${YELLOW}$(realpath $BACKUP_DIR)${NC}"
echo "--------------------------------------------------"
echo ""
