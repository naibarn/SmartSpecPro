#!/bin/bash

# =============================================================================
# Database Configuration Validation Script
# =============================================================================
# Purpose: Detect configuration drift across all config files
# Usage: ./scripts/validate-db-config.sh
# Exit codes: 0 (pass), 1 (fail)
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

ERRORS=0
WARNINGS=0

# =============================================================================
# Helper Functions
# =============================================================================

log_error() {
    echo -e "${RED}✗ ERROR:${NC} $1"
    ERRORS=$((ERRORS + 1))
}

log_warn() {
    echo -e "${YELLOW}⚠ WARNING:${NC} $1"
    WARNINGS=$((WARNINGS + 1))
}

log_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
}

# =============================================================================
# Validation Rules
# =============================================================================

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Database Configuration Validation${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

# -----------------------------------------------------------------------------
# Rule 1: Check .env.example files have consistent values
# -----------------------------------------------------------------------------

echo -e "${BLUE}[1/6]${NC} Checking .env.example files consistency..."

EXPECTED_PASSWORD="smartspec123"
EXPECTED_DB="smartspec"

# Root .env.example
if [ -f ".env.example" ]; then
    ROOT_PASSWORD=$(grep "^POSTGRES_PASSWORD=" .env.example 2>/dev/null | cut -d'=' -f2 || echo "")
    ROOT_DB=$(grep "^POSTGRES_DB=" .env.example 2>/dev/null | cut -d'=' -f2 || echo "")

    if [ "$ROOT_PASSWORD" != "$EXPECTED_PASSWORD" ]; then
        log_error ".env.example has POSTGRES_PASSWORD=$ROOT_PASSWORD (expected: $EXPECTED_PASSWORD)"
    else
        log_success ".env.example uses correct password"
    fi

    if [ "$ROOT_DB" != "$EXPECTED_DB" ]; then
        log_error ".env.example has POSTGRES_DB=$ROOT_DB (expected: $EXPECTED_DB)"
    else
        log_success ".env.example uses correct database name"
    fi
else
    log_warn ".env.example not found"
fi

# apps/web/.env.example
if [ -f "apps/web/.env.example" ]; then
    WEB_URL=$(grep "^DATABASE_URL=" apps/web/.env.example 2>/dev/null | cut -d'=' -f2 || echo "")

    if echo "$WEB_URL" | grep -q "smartspec123"; then
        log_success "apps/web/.env.example uses correct password"
    else
        log_error "apps/web/.env.example DATABASE_URL doesn't contain smartspec123"
    fi

    if echo "$WEB_URL" | grep -q "/smartspec$\|/smartspec?"; then
        log_success "apps/web/.env.example uses correct database name"
    else
        log_warn "apps/web/.env.example DATABASE_URL doesn't end with /smartspec"
    fi
else
    log_warn "apps/web/.env.example not found"
fi

# python-backend/.env.example
if [ -f "python-backend/.env.example" ]; then
    BACKEND_URL=$(grep "^DATABASE_URL=" python-backend/.env.example 2>/dev/null | cut -d'=' -f2 || echo "")

    if echo "$BACKEND_URL" | grep -q "smartspec123"; then
        log_success "python-backend/.env.example uses correct password"
    else
        log_error "python-backend/.env.example DATABASE_URL doesn't contain smartspec123"
    fi

    if echo "$BACKEND_URL" | grep -q "/smartspec$\|/smartspec?"; then
        log_success "python-backend/.env.example uses correct database name"
    else
        log_error "python-backend/.env.example DATABASE_URL doesn't end with /smartspec"
    fi
else
    log_warn "python-backend/.env.example not found"
fi

echo ""

# -----------------------------------------------------------------------------
# Rule 2: Check docker-compose files use consistent defaults
# -----------------------------------------------------------------------------

echo -e "${BLUE}[2/6]${NC} Checking docker-compose files consistency..."

check_compose_file() {
    local file=$1

    if [ ! -f "$file" ]; then
        log_warn "$file not found (skipping)"
        return
    fi

    # Check for hardcoded smartspec_dev
    if grep -q "smartspec_dev" "$file"; then
        log_error "$file contains hardcoded 'smartspec_dev'"
    else
        log_success "$file doesn't contain legacy password"
    fi

    # Check for hardcoded smartspecpro database
    if grep -q "smartspecpro" "$file"; then
        log_error "$file contains 'smartspecpro' database name (should be 'smartspec')"
    else
        log_success "$file uses correct database name"
    fi
}

check_compose_file "docker-compose.yml"
check_compose_file "docker-compose.dev.yml"
check_compose_file "docker-compose.full.yml"
check_compose_file "docker-compose.infra.yml"
check_compose_file "docker-compose.media.yml"

echo ""

# -----------------------------------------------------------------------------
# Rule 3: Check setup.sh doesn't have wrong hardcoded values
# -----------------------------------------------------------------------------

echo -e "${BLUE}[3/6]${NC} Checking setup.sh..."

if [ -f "setup.sh" ]; then
    if grep -q "smartspec_dev" setup.sh; then
        log_error "setup.sh contains hardcoded 'smartspec_dev'"
    else
        log_success "setup.sh doesn't contain legacy password"
    fi
else
    log_warn "setup.sh not found"
fi

echo ""

# -----------------------------------------------------------------------------
# Rule 4: Check dev-local.sh doesn't have wrong hardcoded values
# -----------------------------------------------------------------------------

echo -e "${BLUE}[4/6]${NC} Checking dev-local.sh..."

if [ -f "dev-local.sh" ]; then
    if grep -q "smartspec_dev" dev-local.sh; then
        log_error "dev-local.sh contains hardcoded 'smartspec_dev'"
    else
        log_success "dev-local.sh doesn't contain legacy password"
    fi
else
    log_warn "dev-local.sh not found"
fi

echo ""

# -----------------------------------------------------------------------------
# Rule 5: Check current .env if it exists
# -----------------------------------------------------------------------------

echo -e "${BLUE}[5/6]${NC} Checking current .env files (if they exist)..."

if [ -f "apps/web/.env" ]; then
    CURRENT_URL=$(grep "^DATABASE_URL=" apps/web/.env 2>/dev/null | cut -d'=' -f2 || echo "")

    if echo "$CURRENT_URL" | grep -q "smartspec123"; then
        log_success "apps/web/.env uses correct password"
    else
        log_warn "apps/web/.env might be using old password (check manually)"
    fi

    if echo "$CURRENT_URL" | grep -q "/smartspec$\|/smartspec?"; then
        log_success "apps/web/.env uses correct database name"
    else
        log_warn "apps/web/.env database name might be incorrect"
    fi
else
    log_info "apps/web/.env not found (not yet created - OK)"
fi

if [ -f "python-backend/.env" ]; then
    BACKEND_CURRENT_URL=$(grep "^DATABASE_URL=" python-backend/.env 2>/dev/null | cut -d'=' -f2 || echo "")

    if echo "$BACKEND_CURRENT_URL" | grep -q "smartspec123"; then
        log_success "python-backend/.env uses correct password"
    else
        log_warn "python-backend/.env might be using old password (check manually)"
    fi
else
    log_info "python-backend/.env not found (not yet created - OK)"
fi

echo ""

# -----------------------------------------------------------------------------
# Rule 6: Check docker-compose.yml vs actual running container
# -----------------------------------------------------------------------------

echo -e "${BLUE}[6/6]${NC} Checking running PostgreSQL container (if any)..."

if docker ps --filter "name=smartspec-postgres" --format "{{.Names}}" | grep -q "smartspec-postgres"; then
    log_info "PostgreSQL container is running"

    # Try to check database name
    if docker exec smartspec-postgres psql -U smartspec -d smartspec -c "SELECT 1" &>/dev/null; then
        log_success "Running container uses database 'smartspec'"
    else
        log_warn "Could not verify running container database (might use different name)"
    fi
else
    log_info "PostgreSQL container not running (OK - nothing to check)"
fi

echo ""

# =============================================================================
# Summary
# =============================================================================

echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Validation Summary${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════════${NC}"
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ ALL CHECKS PASSED${NC}"
    echo ""
    echo "Configuration is consistent across all files:"
    echo "  • Password: smartspec123"
    echo "  • Database: smartspec"
    echo "  • User: smartspec"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "${YELLOW}⚠ PASSED WITH WARNINGS${NC}"
    echo ""
    echo "  Warnings: $WARNINGS"
    echo ""
    echo "Configuration is mostly consistent, but review warnings above."
    exit 0
else
    echo -e "${RED}✗ VALIDATION FAILED${NC}"
    echo ""
    echo "  Errors: $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""
    echo "Configuration drift detected! Please fix errors above."
    echo ""
    echo "Expected values:"
    echo "  • POSTGRES_PASSWORD: smartspec123"
    echo "  • POSTGRES_DB: smartspec"
    echo "  • POSTGRES_USER: smartspec"
    exit 1
fi
