#!/bin/bash

# SmartSpecPro Health Check & Auto-Recovery Script
# Run this periodically (e.g., every 5 minutes via cron) to detect and fix common issues

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

# Check if services are running in screen (not orphaned)
check_screen_sessions() {
    local expected_sessions=("smartspec-backend" "smartspec-web" "smartspec-docker-status")
    local missing_sessions=()

    for session in "${expected_sessions[@]}"; do
        if ! screen -ls | grep -q "\.${session}"; then
            missing_sessions+=("$session")
        fi
    done

    if [ ${#missing_sessions[@]} -gt 0 ]; then
        log_error "Missing screen sessions: ${missing_sessions[*]}"
        return 1
    fi

    log_info "✓ All screen sessions running"
    return 0
}

# Check for truly orphaned processes (parent is not screen/bash in screen session)
check_orphaned_processes() {
    local orphaned=0

    # Get all screen session PIDs
    local screen_pids=$(screen -ls | grep "smartspec-" | awk '{print $1}' | cut -d. -f1)

    # Function to check if a process is child of screen session
    is_child_of_screen() {
        local pid=$1
        local ppid=$(ps -o ppid= -p $pid 2>/dev/null | tr -d ' ')

        # Trace up to 5 levels of parents
        for i in {1..5}; do
            [ -z "$ppid" ] && return 1

            # Check if this parent is a screen session
            for spid in $screen_pids; do
                [ "$ppid" = "$spid" ] && return 0
            done

            # Get parent's parent
            ppid=$(ps -o ppid= -p $ppid 2>/dev/null | tr -d ' ')
        done

        return 1
    }

    # Check for uvicorn processes
    while IFS= read -r pid; do
        if ! is_child_of_screen "$pid"; then
            log_warn "Found orphaned backend process: $pid (started: $(ps -o lstart= -p $pid))"
            orphaned=1
        fi
    done < <(pgrep -f "uvicorn.*app.main" 2>/dev/null || true)

    # Check for tsx web processes (exclude docker-status)
    while IFS= read -r pid; do
        local cmd=$(ps -o args= -p $pid)
        if [[ ! "$cmd" =~ "docker-status" ]] && ! is_child_of_screen "$pid"; then
            log_warn "Found orphaned web process: $pid (started: $(ps -o lstart= -p $pid))"
            orphaned=1
        fi
    done < <(pgrep -f "tsx.*server/_core" 2>/dev/null || true)

    if [ $orphaned -eq 0 ]; then
        log_info "✓ No orphaned processes detected"
        return 0
    else
        log_error "Orphaned processes detected!"
        return 1
    fi
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
        log_info "✓ Backend responding ($backend_status)"
    fi

    # Check Web App
    local web_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ 2>/dev/null || echo "000")
    if [ "$web_status" != "200" ]; then
        log_error "Web app health check failed (HTTP $web_status)"
        failed=1
    else
        log_info "✓ Web app responding (HTTP $web_status)"
    fi

    return $failed
}

# Main health check
main() {
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "SmartSpecPro Health Check - $(date)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""

    local issues=0

    # 1. Check screen sessions
    if ! check_screen_sessions; then
        ((issues++))
    fi

    # 2. Check for orphans
    if ! check_orphaned_processes; then
        ((issues++))
    fi

    # 3. Check service health
    if ! check_service_health; then
        ((issues++))
    fi

    echo ""
    if [ $issues -eq 0 ]; then
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_info "Health check PASSED - All systems operational"
        log_info "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        exit 0
    else
        log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_error "Health check FAILED - $issues issue(s) detected"
        log_error "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        log_warn ""
        log_warn "Recommended action: Run ./run-services.sh stop && ./run-services.sh start"
        exit 1
    fi
}

main "$@"
