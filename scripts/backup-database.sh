#!/bin/bash
# Database Backup Script - SmartSpec Pro
# Usage: ./scripts/backup-database.sh

set -e

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=".db-backups"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$PROJECT_ROOT"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   SmartSpec Pro Database Backup       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR/env-files"

# Backup PostgreSQL database
echo -e "${YELLOW}📦 Backing up PostgreSQL database...${NC}"
docker exec smartspec-postgres pg_dump -U smartspec -d smartspec \
  --file=/tmp/backup_${TIMESTAMP}.sql

docker cp smartspec-postgres:/tmp/backup_${TIMESTAMP}.sql \
  "$BACKUP_DIR/backup_${TIMESTAMP}.sql"

docker exec smartspec-postgres rm /tmp/backup_${TIMESTAMP}.sql

echo -e "${GREEN}✓ Database backup: backup_${TIMESTAMP}.sql${NC}"

# Save row counts for verification
echo -e "${YELLOW}📊 Saving row counts...${NC}"
docker exec smartspec-postgres psql -U smartspec -d smartspec -c "
  SELECT schemaname, relname as table_name, n_live_tup as row_count
  FROM pg_stat_user_tables
  WHERE schemaname = 'public'
  ORDER BY n_live_tup DESC;
" > "$BACKUP_DIR/row_counts_${TIMESTAMP}.txt"

echo -e "${GREEN}✓ Row counts: row_counts_${TIMESTAMP}.txt${NC}"

# Backup environment files
echo -e "${YELLOW}⚙️  Backing up environment files...${NC}"
cp apps/web/.env "$BACKUP_DIR/env-files/web.env.${TIMESTAMP}"
cp python-backend/.env "$BACKUP_DIR/env-files/python-backend.env.${TIMESTAMP}"

echo -e "${GREEN}✓ Environment files backed up${NC}"

# Calculate sizes
DB_SIZE=$(du -h "$BACKUP_DIR/backup_${TIMESTAMP}.sql" | cut -f1)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Backup completed successfully!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "📁 Location: $BACKUP_DIR/"
echo -e "💾 Database size: $DB_SIZE"
echo -e "📦 Total size: $TOTAL_SIZE"
echo -e "🕐 Timestamp: $TIMESTAMP"
echo ""

# Cleanup old backups (keep last 7 days)
echo -e "${YELLOW}🧹 Cleaning up old backups (keeping last 7 days)...${NC}"
find "$BACKUP_DIR" -name "backup_*.sql" -mtime +7 -delete
find "$BACKUP_DIR" -name "row_counts_*.txt" -mtime +7 -delete
find "$BACKUP_DIR/env-files" -name "*.env.*" -mtime +7 -delete

echo -e "${GREEN}✓ Cleanup complete${NC}"
echo ""
echo -e "${YELLOW}⚠️  Remember to:${NC}"
echo -e "  1. Test restore in dev environment"
echo -e "  2. Keep backups secure (sensitive data)"
echo -e "  3. Change admin password after restore"
echo ""
