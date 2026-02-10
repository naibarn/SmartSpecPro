#!/bin/bash

# SmartSpecPro Comprehensive Config Validation
# Validates all config files for consistency, prevents recurring issues
# CRITICAL RULES:
# 1. Production domain is ONLY https://smartaihub.app (NO OTHER DOMAINS)
# 2. localhost:8000 and localhost:3000 for local dev ONLY
# 3. All services must start completely

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Define the ONLY allowed production domain
PROD_DOMAIN="smartaihub.app"
WRONG_DOMAINS=(
    "smartspec.pro"
    "smartspec.local"
    "smarthubai.app"
    "api.smartspec.pro"
    "smartaihub.com"
)

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       SmartSpecPro Comprehensive Config Validation           ║"
    echo "║       Prevents recurring domain and startup issues           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

# Validation functions
check_nginx_config() {
    log_step "Checking Nginx configuration..."

    local nginx_config="${PROJECT_ROOT}/nginx/conf.d/dev-host.conf"

    if [ ! -f "$nginx_config" ]; then
        log_error "Nginx config not found: $nginx_config"
        ((VALIDATION_ERRORS++))
        return 1
    fi

    # Check server_name contains ONLY allowed domain
    local server_names=$(grep "server_name" "$nginx_config" | sed 's/.*server_name\s*//' | sed 's/;//')

    log_info "Found server_name: $server_names"

    # Must contain smartaihub.app
    if ! echo "$server_names" | grep -q "$PROD_DOMAIN"; then
        log_error "Nginx config missing required domain: $PROD_DOMAIN"
        ((VALIDATION_ERRORS++))
    fi

    # Check for wrong domains
    for wrong_domain in "${WRONG_DOMAINS[@]}"; do
        if echo "$server_names" | grep -q "$wrong_domain"; then
            log_warn "Nginx config contains deprecated domain: $wrong_domain (should only use $PROD_DOMAIN)"
            ((VALIDATION_WARNINGS++))
        fi
    done

    # Check upstream configuration
    if ! grep -q "upstream backend_host" "$nginx_config"; then
        log_error "Nginx missing backend_host upstream"
        ((VALIDATION_ERRORS++))
    fi

    if ! grep -q "upstream web_host" "$nginx_config"; then
        log_error "Nginx missing web_host upstream"
        ((VALIDATION_ERRORS++))
    fi

    # Check for host.docker.internal
    if ! grep -q "host.docker.internal:8000" "$nginx_config"; then
        log_error "Nginx backend upstream not configured for host.docker.internal:8000"
        ((VALIDATION_ERRORS++))
    fi

    if ! grep -q "host.docker.internal:3000" "$nginx_config"; then
        log_error "Nginx web upstream not configured for host.docker.internal:3000"
        ((VALIDATION_ERRORS++))
    fi

    log_info "✓ Nginx configuration check complete"
}

check_env_files() {
    log_step "Checking environment files..."

    local web_env="${PROJECT_ROOT}/apps/web/.env"
    local python_env="${PROJECT_ROOT}/python-backend/.env"

    # Check web .env
    if [ -f "$web_env" ]; then
        # Check DATABASE_URL consistency
        if grep -q "DATABASE_URL" "$web_env"; then
            local db_url=$(grep "DATABASE_URL" "$web_env" | head -1 | cut -d'=' -f2-)
            log_info "Web DATABASE_URL configured"

            # Should use smartspec-postgres container name
            if ! echo "$db_url" | grep -q "smartspec-postgres"; then
                log_warn "DATABASE_URL should use container name 'smartspec-postgres'"
                ((VALIDATION_WARNINGS++))
            fi
        else
            log_error "DATABASE_URL not found in $web_env"
            ((VALIDATION_ERRORS++))
        fi

        # Check JWT_SECRET exists
        if ! grep -q "JWT_SECRET" "$web_env"; then
            log_error "JWT_SECRET not found in $web_env"
            ((VALIDATION_ERRORS++))
        fi

        # Check LLM_ENCRYPTION_KEY exists
        if ! grep -q "LLM_ENCRYPTION_KEY" "$web_env"; then
            log_error "LLM_ENCRYPTION_KEY not found in $web_env"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_error "Web .env not found: $web_env"
        ((VALIDATION_ERRORS++))
    fi

    # Check python .env
    if [ -f "$python_env" ]; then
        if grep -q "DATABASE_URL" "$python_env"; then
            local py_db_url=$(grep "DATABASE_URL" "$python_env" | head -1 | cut -d'=' -f2-)
            log_info "Python DATABASE_URL configured"

            if ! echo "$py_db_url" | grep -q "smartspec-postgres"; then
                log_warn "Python DATABASE_URL should use container name 'smartspec-postgres'"
                ((VALIDATION_WARNINGS++))
            fi
        else
            log_error "DATABASE_URL not found in $python_env"
            ((VALIDATION_ERRORS++))
        fi

        # Check LLM_ENCRYPTION_KEY exists
        if ! grep -q "LLM_ENCRYPTION_KEY" "$python_env"; then
            log_error "LLM_ENCRYPTION_KEY not found in $python_env"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_error "Python .env not found: $python_env"
        ((VALIDATION_ERRORS++))
    fi

    log_info "✓ Environment files check complete"
}

check_docker_compose() {
    log_step "Checking Docker Compose configurations..."

    local base_compose="${PROJECT_ROOT}/docker-compose.yml"
    local media_compose="${PROJECT_ROOT}/docker-compose.media.yml"

    # Check base compose
    if [ -f "$base_compose" ]; then
        # Check network name
        if ! grep -q "smartspecpro_default" "$base_compose"; then
            log_warn "docker-compose.yml network name may not match (should be smartspecpro_default)"
            ((VALIDATION_WARNINGS++))
        fi

        # Check container names
        if ! grep -q "container_name: smartspec-postgres" "$base_compose"; then
            log_error "PostgreSQL container name mismatch (should be smartspec-postgres)"
            ((VALIDATION_ERRORS++))
        fi

        if ! grep -q "container_name: smartspec-redis" "$base_compose"; then
            log_error "Redis container name mismatch (should be smartspec-redis)"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_error "Base docker-compose.yml not found"
        ((VALIDATION_ERRORS++))
    fi

    # Check media compose
    if [ -f "$media_compose" ]; then
        # Check worker names
        for worker in smartspec-celery-media smartspec-celery-beat smartspec-flower; do
            if ! grep -q "container_name: $worker" "$media_compose"; then
                log_error "Media worker $worker not found in docker-compose.media.yml"
                ((VALIDATION_ERRORS++))
            fi
        done

        # Check network
        if ! grep -q "smartspecpro_default" "$media_compose"; then
            log_error "docker-compose.media.yml not using correct network (smartspecpro_default)"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_error "docker-compose.media.yml not found"
        ((VALIDATION_ERRORS++))
    fi

    log_info "✓ Docker Compose configuration check complete"
}

check_service_startup_script() {
    log_step "Checking service startup script..."

    local startup_script="${PROJECT_ROOT}/run-services.sh"

    if [ -f "$startup_script" ]; then
        # Check for nginx startup
        if ! grep -q "start_nginx" "$startup_script"; then
            log_error "run-services.sh missing nginx startup function"
            ((VALIDATION_ERRORS++))
        fi

        # Check for validate_infrastructure
        if ! grep -q "validate_infrastructure" "$startup_script"; then
            log_error "run-services.sh missing infrastructure validation"
            ((VALIDATION_ERRORS++))
        fi

        # Check for wait_for_postgres, wait_for_redis, wait_for_backend
        for check_func in wait_for_postgres wait_for_redis wait_for_backend wait_for_nginx; do
            if ! grep -q "$check_func" "$startup_script"; then
                log_error "run-services.sh missing $check_func function"
                ((VALIDATION_ERRORS++))
            fi
        done

        # Check startup sequence
        if ! grep -q "start_nginx" "$startup_script" && ! grep -A5 "cmd_start" "$startup_script" | grep -q "nginx"; then
            log_error "run-services.sh cmd_start does not start nginx"
            ((VALIDATION_ERRORS++))
        fi
    else
        log_error "run-services.sh not found"
        ((VALIDATION_ERRORS++))
    fi

    log_info "✓ Service startup script check complete"
}

check_for_wrong_domains_in_code() {
    log_step "Scanning codebase for wrong domain references..."

    local found_issues=0

    for wrong_domain in "${WRONG_DOMAINS[@]}"; do
        # Search in specific config files only (not all source code)
        local files_to_check=(
            "nginx/conf.d/*.conf"
            "apps/web/.env.example"
            "python-backend/.env.example"
            "docker-compose*.yml"
            "scripts/*.sh"
        )

        for pattern in "${files_to_check[@]}"; do
            local matches=$(find "$PROJECT_ROOT" -path "*/$pattern" -type f -exec grep -l "$wrong_domain" {} \; 2>/dev/null || true)

            if [ -n "$matches" ]; then
                log_warn "Found deprecated domain '$wrong_domain' in config files:"
                echo "$matches" | while read -r file; do
                    local rel_path=$(realpath --relative-to="$PROJECT_ROOT" "$file")
                    log_warn "  → $rel_path"
                    ((VALIDATION_WARNINGS++))
                    found_issues=1
                done
            fi
        done
    done

    if [ $found_issues -eq 0 ]; then
        log_info "✓ No wrong domain references found in config files"
    fi
}

check_required_services() {
    log_step "Checking required Docker services..."

    local required_services=(
        "smartspec-postgres:PostgreSQL database"
        "smartspec-redis:Redis cache"
        "smartspec-nginx-dev:Nginx reverse proxy"
    )

    for service_info in "${required_services[@]}"; do
        local service_name=$(echo "$service_info" | cut -d':' -f1)
        local service_desc=$(echo "$service_info" | cut -d':' -f2)

        if docker ps --format '{{.Names}}' | grep -q "^${service_name}$"; then
            log_info "✓ $service_desc ($service_name) is running"
        else
            log_error "✗ $service_desc ($service_name) is NOT running"
            ((VALIDATION_ERRORS++))
        fi
    done
}

print_summary() {
    echo ""
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                  VALIDATION SUMMARY                           ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ $VALIDATION_ERRORS -eq 0 ] && [ $VALIDATION_WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ ALL VALIDATION CHECKS PASSED${NC}"
        echo ""
        echo -e "${GREEN}Configuration is correct and consistent:${NC}"
        echo -e "  • Production domain: https://$PROD_DOMAIN"
        echo -e "  • All services configured properly"
        echo -e "  • No deprecated domains found"
        echo ""
        return 0
    else
        if [ $VALIDATION_ERRORS -gt 0 ]; then
            echo -e "${RED}✗ VALIDATION FAILED: $VALIDATION_ERRORS ERROR(S)${NC}"
        fi

        if [ $VALIDATION_WARNINGS -gt 0 ]; then
            echo -e "${YELLOW}⚠ $VALIDATION_WARNINGS WARNING(S)${NC}"
        fi

        echo ""
        echo -e "${YELLOW}ACTION REQUIRED:${NC}"
        echo "  1. Fix all errors listed above"
        echo "  2. Update configs to use ONLY: https://$PROD_DOMAIN"
        echo "  3. Remove all references to deprecated domains"
        echo "  4. Run this validation script again"
        echo ""
        return 1
    fi
}

# Main execution
main() {
    print_banner

    check_nginx_config
    echo ""

    check_env_files
    echo ""

    check_docker_compose
    echo ""

    check_service_startup_script
    echo ""

    check_for_wrong_domains_in_code
    echo ""

    check_required_services

    print_summary
}

main
exit $VALIDATION_ERRORS
