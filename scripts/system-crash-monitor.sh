#!/bin/bash

# SmartAIHub System Crash Monitor
# Detects service restart loops and RAM pressure before they become fatal.
# Runs every minute via cron:
#   * * * * * /home/dev/projects/SmartAIHub/scripts/system-crash-monitor.sh >> /home/dev/projects/SmartAIHub/logs/system-watch/cron.log 2>&1

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/system-watch"
DAILY_LOG="${LOG_DIR}/system-watch-$(date +%Y-%m-%d).log"
ALERT_LOG="${LOG_DIR}/alerts.log"
RESTART_THRESHOLD="${CRASH_MONITOR_RESTART_THRESHOLD:-2}"
RAM_WARN_PCT="${CRASH_MONITOR_RAM_WARN_PCT:-70}"
RAM_CRIT_PCT="${CRASH_MONITOR_RAM_CRIT_PCT:-85}"
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-${SLACK_WEBHOOK_URL:-${DISCORD_WEBHOOK_URL:-}}}"

mkdir -p "${LOG_DIR}"

timestamp="$(date '+%Y-%m-%d %T %z')"

# ---------------------------------------------------------------------------
# send_webhook MESSAGE LEVEL
# Sends to webhook if URL configured; otherwise logs only.
# ---------------------------------------------------------------------------
send_webhook() {
    local msg="$1"
    local level="${2:-WARN}"

    if [ -z "${WEBHOOK_URL}" ]; then
        echo "[ALERT-SKIP] Webhook not configured. ${level}: ${msg}" >> "${ALERT_LOG}"
        return 0
    fi

    local color=16776960  # yellow = WARN
    if [ "${level}" = "CRITICAL" ]; then color=15158332; fi  # red
    if [ "${level}" = "INFO" ]; then color=3066993; fi       # blue

    local payload
    payload="$(cat <<EOF
{
  "username": "SmartSpec CrashMonitor",
  "embeds": [{
    "title": "[${level}] SmartAIHub Crash Monitor",
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
# Main logic — wrapped so any unexpected error is caught and logged
# ---------------------------------------------------------------------------
main() {
    local alerts=()

    # ------------------------------------------------------------------
    # 1. Restart-loop detection
    # Count "Started SmartAIHub" events in the last 10 minutes across
    # all smartspec-*.service units.
    # ------------------------------------------------------------------
    local restart_output
    restart_output="$(sudo journalctl -u 'smartspec-*.service' \
        --since '10 minutes ago' --no-pager -q 2>/dev/null || true)"

    for service in smartspec-web smartspec-backend; do
        local count
        count="$(echo "${restart_output}" | grep -c "Started SmartAIHub" 2>/dev/null || echo 0)"
        # Per-service count: grep the service name too
        count="$(echo "${restart_output}" | grep "${service}" | grep -c "Started SmartAIHub" 2>/dev/null || echo 0)"

        if [ "${count}" -gt "${RESTART_THRESHOLD}" ]; then
            alerts+=("CRITICAL restart_loop service=${service} restarts_10m=${count} threshold=${RESTART_THRESHOLD}")
        elif [ "${count}" -gt 0 ]; then
            alerts+=("INFO restarted service=${service} restarts_10m=${count}")
        fi
    done

    # ------------------------------------------------------------------
    # 2. RAM usage check
    # ------------------------------------------------------------------
    local mem_total mem_used mem_pct
    mem_total="$(free -m | awk '/^Mem:/ {print $2}')"
    mem_used="$(free -m | awk '/^Mem:/ {print $3}')"

    if [ -n "${mem_total}" ] && [ "${mem_total}" -gt 0 ]; then
        mem_pct=$(( (mem_used * 100) / mem_total ))
        if [ "${mem_pct}" -ge "${RAM_CRIT_PCT}" ]; then
            alerts+=("CRITICAL high_ram ram_pct=${mem_pct} used_mb=${mem_used} total_mb=${mem_total}")
        elif [ "${mem_pct}" -ge "${RAM_WARN_PCT}" ]; then
            alerts+=("WARNING high_ram ram_pct=${mem_pct} used_mb=${mem_used} total_mb=${mem_total}")
        fi
    fi

    # ------------------------------------------------------------------
    # 3. Write to daily log
    # ------------------------------------------------------------------
    {
        echo "===== ${timestamp} ====="
        echo "ram_pct=${mem_pct:-?} used_mb=${mem_used:-?} total_mb=${mem_total:-?}"
        if [ "${#alerts[@]}" -eq 0 ]; then
            echo "alerts=none"
        else
            printf 'alert: %s\n' "${alerts[@]}"
        fi
        echo ""
    } >> "${DAILY_LOG}"

    # ------------------------------------------------------------------
    # 4. Fire webhooks for actionable alerts
    # ------------------------------------------------------------------
    for alert in "${alerts[@]}"; do
        local level
        if [[ "${alert}" == CRITICAL* ]]; then
            level="CRITICAL"
        elif [[ "${alert}" == WARNING* ]]; then
            level="WARN"
        else
            level="INFO"
        fi

        # Only alert on CRITICAL or WARNING (skip INFO restarts to avoid noise)
        if [ "${level}" = "CRITICAL" ] || [ "${level}" = "WARN" ]; then
            send_webhook "${alert}" "${level}"
            echo "[${level}] ${alert}" >> "${ALERT_LOG}"
        fi
    done

    # Print summary to stdout (captured by cron into cron.log)
    echo "${timestamp} alerts=${#alerts[@]}"
}

# Run main, capturing any unexpected errors so the script never exits dirty
if ! main 2>>"${ALERT_LOG}"; then
    echo "${timestamp} crash-monitor-error: main() failed, see ${ALERT_LOG}" >> "${DAILY_LOG}"
fi
