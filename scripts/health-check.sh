#!/bin/bash

# SmartSpecPro Health Check & Auto-Recovery Script
# Run this periodically (e.g., every 5 minutes via cron) to detect and fix common issues
# Web and Backend are managed by systemd (auto-restart on crash).

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }

# Check systemd-managed services (web and backend)
check_systemd_services() {
    local failed=0

    for service in smartspec-web smartspec-backend; do
        local active=$(systemctl is-active ${service}.service 2>/dev/null || echo "inactive")
        local restarts=$(systemctl show ${service}.service -p NRestarts --value 2>/dev/null || echo "?")

        if [ "$active" = "active" ]; then
            log_info "${service}: active (restarts: $restarts)"
        else
            log_error "${service}: $active (restarts: $restarts)"
            ((failed++))
        fi
    done

    if [ $failed -eq 0 ]; then
        log_info "All systemd services running"
    fi

    return $failed
}

# Check screen session (docker-status only)
check_screen_sessions() {
    if ! screen -ls 2>/dev/null | grep -q "\.smartspec-docker-status"; then
        log_warn "Missing screen session: smartspec-docker-status"
        return 1
    fi

    log_info "Screen session smartspec-docker-status: running"
    return 0
}

# Check if services respond to health checks
check_service_health() {
    local failed=0

    # Check Backend
    local backend_status=$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo "unreachable")
    if [[ "$backend_status" != "healthy" ]] && [[ "$backend_status" != "degraded" ]]; then
        log_error "Backend health check failed (status: $backend_status)"
        failed=1
    else
        log_info "Backend responding ($backend_status)"
    fi

    # Check Web App
    local web_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
    if [ "$web_status" != "200" ]; then
        log_error "Web app health check failed (HTTP $web_status)"
        failed=1
    else
        log_info "Web app responding (HTTP $web_status)"
    fi

    return $failed
}

# Main health check
main() {
    echo "---"
    echo "SmartSpecPro Health Check - $(date)"
    echo "---"
    echo ""

    local issues=0

    # 1. Check systemd services
    if ! check_systemd_services; then
        ((issues++))
    fi

    # 2. Check screen sessions (docker-status)
    if ! check_screen_sessions; then
        ((issues++))
    fi

    # 3. Check service health
    if ! check_service_health; then
        ((issues++))
    fi

    echo ""
    if [ $issues -eq 0 ]; then
        log_info "Health check PASSED - All systems operational"
        exit 0
    else
        log_error "Health check FAILED - $issues issue(s) detected"
        log_warn "Web and Backend auto-recover via systemd (Restart=always)."
        log_warn "If issues persist: ./run-services.sh restart"
        exit 1
    fi
}

main "$@"
