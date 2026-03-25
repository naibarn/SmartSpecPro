#!/bin/bash

# SmartSpecPro Health Check & Auto-Recovery Script
# Run this periodically (e.g., every 5 minutes via cron) to detect and fix common issues.
# Web and Backend are managed by systemd (auto-restart on crash).

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

# Thresholds (overridable via env)
MEM_WARN_PCT="${HEALTH_MEM_WARN_PCT:-70}"
MEM_CRIT_PCT="${HEALTH_MEM_CRIT_PCT:-85}"
HTTP500_WARN="${HEALTH_HTTP500_WARN:-5}"
HTTP500_CRIT="${HEALTH_HTTP500_CRIT:-20}"

# Webhook URL: check all common env var names
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-${SLACK_WEBHOOK_URL:-${DISCORD_WEBHOOK_URL:-}}}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
log_crit()  { echo -e "${RED}[CRITICAL]${NC} $1"; }

# ---------------------------------------------------------------------------
# send_webhook MESSAGE LEVEL
# ---------------------------------------------------------------------------
send_webhook() {
    local msg="$1"
    local level="${2:-WARN}"

    if [ -z "${WEBHOOK_URL}" ]; then
        log_warn "[ALERT-SKIP] Webhook not configured. ${level}: ${msg}"
        return 0
    fi

    local color=16776960  # yellow = WARN
    if [ "${level}" = "CRITICAL" ]; then color=15158332; fi
    if [ "${level}" = "INFO" ]; then color=3066993; fi

    local payload
    payload="$(cat <<EOF
{
  "username": "SmartSpec HealthCheck",
  "embeds": [{
    "title": "[${level}] SmartSpecPro Health Check",
    "description": "${msg}",
    "color": ${color},
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  }]
}
EOF
)"
    curl -sf -H "Content-Type: application/json" -X POST -d "${payload}" \
        "${WEBHOOK_URL}" > /dev/null 2>&1 || true
}

# ---------------------------------------------------------------------------
# 1. systemd service status + restart count
# ---------------------------------------------------------------------------
check_systemd_services() {
    local failed=0

    for service in smartspec-web smartspec-backend; do
        local active
        active="$(systemctl is-active ${service}.service 2>/dev/null || echo 'inactive')"
        local restarts
        restarts="$(systemctl show ${service}.service -p NRestarts --value 2>/dev/null || echo '?')"

        if [ "${active}" = "active" ]; then
            log_info "${service}: active (NRestarts=${restarts})"
        else
            log_error "${service}: ${active} (NRestarts=${restarts})"
            ((failed++)) || true
        fi
    done

    if [ "${failed}" -eq 0 ]; then
        log_info "All systemd services running"
    fi

    return "${failed}"
}

# ---------------------------------------------------------------------------
# 2. Screen session (docker-status helper)
# ---------------------------------------------------------------------------
check_screen_sessions() {
    if ! screen -ls 2>/dev/null | grep -q "\.smartspec-docker-status"; then
        log_warn "Missing screen session: smartspec-docker-status"
        return 1
    fi

    log_info "Screen session smartspec-docker-status: running"
    return 0
}

# ---------------------------------------------------------------------------
# 3. HTTP health endpoints
# ---------------------------------------------------------------------------
check_service_health() {
    local failed=0

    local backend_status
    backend_status="$(curl -s http://localhost:8000/health 2>/dev/null | jq -r '.status' 2>/dev/null || echo 'unreachable')"
    if [[ "${backend_status}" != "healthy" ]] && [[ "${backend_status}" != "degraded" ]]; then
        log_error "Backend health check failed (status: ${backend_status})"
        failed=1
    else
        log_info "Backend responding (${backend_status})"
    fi

    local web_status
    web_status="$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/ 2>/dev/null || echo '000')"
    if [ "${web_status}" != "200" ]; then
        log_error "Web app health check failed (HTTP ${web_status})"
        failed=1
    else
        log_info "Web app responding (HTTP ${web_status})"
    fi

    return "${failed}"
}

# ---------------------------------------------------------------------------
# 4. Memory check
# ---------------------------------------------------------------------------
check_memory() {
    local mem_total mem_used mem_pct
    mem_total="$(free -m | awk '/^Mem:/ {print $2}')"
    mem_used="$(free -m  | awk '/^Mem:/ {print $3}')"

    if [ -z "${mem_total}" ] || [ "${mem_total}" -eq 0 ]; then
        log_warn "Could not determine memory usage"
        return 0
    fi

    mem_pct=$(( (mem_used * 100) / mem_total ))

    if [ "${mem_pct}" -ge "${MEM_CRIT_PCT}" ]; then
        log_crit "Memory CRITICAL: ${mem_pct}% used (${mem_used}MB / ${mem_total}MB)"
        send_webhook "Memory CRITICAL: ${mem_pct}% used (${mem_used}MB / ${mem_total}MB)" "CRITICAL"
        return 1
    elif [ "${mem_pct}" -ge "${MEM_WARN_PCT}" ]; then
        log_warn "Memory WARNING: ${mem_pct}% used (${mem_used}MB / ${mem_total}MB)"
        send_webhook "Memory WARNING: ${mem_pct}% used (${mem_used}MB / ${mem_total}MB)" "WARN"
        return 1
    else
        log_info "Memory OK: ${mem_pct}% used (${mem_used}MB / ${mem_total}MB)"
        return 0
    fi
}

# ---------------------------------------------------------------------------
# 5. HTTP 500/503 error rate check (last 5 minutes of backend logs)
# ---------------------------------------------------------------------------
check_error_rate() {
    local log_lines
    log_lines="$(sudo journalctl -u smartspec-backend.service --since '5 minutes ago' \
        --no-pager -q 2>/dev/null | tail -n 100 || true)"

    local error_count
    error_count="$(echo "${log_lines}" | grep -cE 'HTTP/(1\.[01]|2) (50[03])|" (500|503) ' 2>/dev/null || echo 0)"

    if [ "${error_count}" -ge "${HTTP500_CRIT}" ]; then
        log_crit "Error rate CRITICAL: ${error_count} HTTP 5xx responses in last 5 minutes"
        send_webhook "Error rate CRITICAL: ${error_count} HTTP 5xx in last 5 minutes" "CRITICAL"
        return 1
    elif [ "${error_count}" -ge "${HTTP500_WARN}" ]; then
        log_warn "Error rate WARNING: ${error_count} HTTP 5xx responses in last 5 minutes"
        send_webhook "Error rate WARNING: ${error_count} HTTP 5xx in last 5 minutes" "WARN"
        return 1
    else
        log_info "Error rate OK: ${error_count} HTTP 5xx in last 5 minutes"
        return 0
    fi
}

# ---------------------------------------------------------------------------
# 6. Process restart count (NRestarts summary)
# ---------------------------------------------------------------------------
check_restart_counts() {
    local issues=0
    for service in smartspec-web smartspec-backend; do
        local nrestarts
        nrestarts="$(systemctl show ${service}.service --property=NRestarts --value 2>/dev/null || echo '?')"
        if [ "${nrestarts}" = "?" ]; then
            log_warn "${service}: could not read NRestarts"
        elif [ "${nrestarts}" -gt 5 ] 2>/dev/null; then
            log_warn "${service}: high restart count NRestarts=${nrestarts}"
            send_webhook "${service} high NRestarts=${nrestarts}" "WARN"
            ((issues++)) || true
        else
            log_info "${service}: NRestarts=${nrestarts}"
        fi
    done
    return "${issues}"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
    echo "---"
    echo "SmartSpecPro Health Check - $(date)"
    echo "---"
    echo ""

    local issues=0

    if ! check_systemd_services; then
        ((issues++)) || true
    fi

    if ! check_screen_sessions; then
        ((issues++)) || true
    fi

    if ! check_service_health; then
        ((issues++)) || true
    fi

    if ! check_memory; then
        ((issues++)) || true
    fi

    if ! check_error_rate; then
        ((issues++)) || true
    fi

    if ! check_restart_counts; then
        ((issues++)) || true
    fi

    echo ""
    if [ "${issues}" -eq 0 ]; then
        log_info "Health check PASSED - All systems operational"
        exit 0
    else
        log_error "Health check FAILED - ${issues} issue(s) detected"
        log_warn "Web and Backend auto-recover via systemd (Restart=on-failure)."
        log_warn "If issues persist: sudo systemctl restart smartspec-backend.service smartspec-web.service"
        exit 1
    fi
}

main "$@"
