#!/bin/bash
set -e

# SmartAIHub - Database Configuration Validator
# ตรวจสอบว่า credentials ใน .env ตรงกับ docker-compose.yml หรือไม่

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[VALIDATION] Checking database configuration...${NC}"

# Check if .env exists
if [ ! -f "apps/web/.env" ]; then
    echo -e "${RED}[ERROR] apps/web/.env not found!${NC}"
    exit 1
fi

# Extract credentials from .env
DB_URL=$(grep "^DATABASE_URL=" apps/web/.env | cut -d'=' -f2)
if [ -z "$DB_URL" ]; then
    echo -e "${RED}[ERROR] DATABASE_URL not found in .env${NC}"
    exit 1
fi

# Parse DATABASE_URL (postgresql://user:password@host:port/database)
ENV_USER=$(echo "$DB_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
ENV_PASS=$(echo "$DB_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
ENV_DB=$(echo "$DB_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo -e "${BLUE}[INFO] .env credentials:${NC}"
echo "  User: $ENV_USER"
echo "  Password: ${ENV_PASS:0:3}***"
echo "  Database: $ENV_DB"

# Extract credentials from docker-compose.yml
COMPOSE_USER=$(grep "POSTGRES_USER:" docker-compose.yml | awk '{print $2}')
COMPOSE_PASS=$(grep "POSTGRES_PASSWORD:" docker-compose.yml | awk '{print $2}')
COMPOSE_DB=$(grep "POSTGRES_DB:" docker-compose.yml | awk '{print $2}')

echo -e "${BLUE}[INFO] docker-compose.yml credentials:${NC}"
echo "  User: $COMPOSE_USER"
echo "  Password: ${COMPOSE_PASS:0:3}***"
echo "  Database: $COMPOSE_DB"

# Validate
ERRORS=0

if [ "$ENV_USER" != "$COMPOSE_USER" ]; then
    echo -e "${RED}[ERROR] Username mismatch!${NC}"
    echo "  .env: $ENV_USER"
    echo "  docker-compose.yml: $COMPOSE_USER"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ENV_PASS" != "$COMPOSE_PASS" ]; then
    echo -e "${RED}[ERROR] Password mismatch!${NC}"
    echo "  .env: ${ENV_PASS:0:3}***"
    echo "  docker-compose.yml: ${COMPOSE_PASS:0:3}***"
    ERRORS=$((ERRORS + 1))
fi

if [ "$ENV_DB" != "$COMPOSE_DB" ]; then
    echo -e "${RED}[ERROR] Database name mismatch!${NC}"
    echo "  .env: $ENV_DB"
    echo "  docker-compose.yml: $COMPOSE_DB"
    ERRORS=$((ERRORS + 1))
fi

# Check if PostgreSQL container is using external volume
VOLUME_TYPE=$(grep -A 2 "postgres_data:" docker-compose.yml | grep -E "external|driver" | head -1 | awk '{print $1}')
if [ "$VOLUME_TYPE" = "external:" ]; then
    echo -e "${YELLOW}[WARNING] PostgreSQL volume is set to 'external: true'${NC}"
    echo "  This may cause password mismatches if the volume has old data."
    echo "  Consider changing to 'driver: local' in docker-compose.yml"
fi

# Summary
if [ $ERRORS -eq 0 ]; then
    echo -e "${GREEN}[SUCCESS] All credentials match!${NC}"
    exit 0
else
    echo -e "${RED}[FAILED] Found $ERRORS configuration error(s)${NC}"
    echo ""
    echo "To fix:"
    echo "1. Update .env or docker-compose.yml to match"
    echo "2. If PostgreSQL is running, reset the password:"
    echo "   docker exec smartspec-postgres psql -U smartspec -d smartspec -c \"ALTER USER $COMPOSE_USER WITH PASSWORD '$COMPOSE_PASS';\""
    exit 1
fi
