#!/bin/bash

# SmartAIHub System Crash Monitor
# Detects service restart loops and RAM pressure before they become fatal.
# Runs every minute via cron:
#   * * * * * /home/dev/projects/SmartAIHub/scripts/system-crash-monitor.sh >> /home/dev/projects/SmartAIHub/logs/system-watch/cron.log 2>&1

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/system-watch"
DAILY_LOG="${LOG_DIR}/system-watch-$(date +%Y-%m-%d).log"
ALERT_LOG="${LOG_DIR}/alerts.log"
CGROUP_STATE_FILE="${LOG_DIR}/cgroup-memory-events.state"
ALERT_DEDUP_FILE="${LOG_DIR}/alert-dedup.state"
RESTART_THRESHOLD="${CRASH_MONITOR_RESTART_THRESHOLD:-2}"
RAM_WARN_PCT="${CRASH_MONITOR_RAM_WARN_PCT:-70}"
RAM_CRIT_PCT="${CRASH_MONITOR_RAM_CRIT_PCT:-85}"
SWAP_WARN_PCT="${CRASH_MONITOR_SWAP_WARN_PCT:-40}"
SWAP_CRIT_PCT="${CRASH_MONITOR_SWAP_CRIT_PCT:-70}"
MEM_AVAILABLE_WARN_MB="${CRASH_MONITOR_MEM_AVAILABLE_WARN_MB:-4096}"
MEM_AVAILABLE_CRIT_MB="${CRASH_MONITOR_MEM_AVAILABLE_CRIT_MB:-2048}"
MEM_PSI_CRIT_AVG10="${CRASH_MONITOR_MEM_PSI_CRIT_AVG10:-5}"
SSH_SESSION_WARN="${CRASH_MONITOR_SSH_SESSION_WARN:-12}"
SSH_SESSION_CRIT="${CRASH_MONITOR_SSH_SESSION_CRIT:-24}"
MCP_CONTAINER_WARN="${CRASH_MONITOR_MCP_CONTAINER_WARN:-6}"
MCP_CONTAINER_CRIT="${CRASH_MONITOR_MCP_CONTAINER_CRIT:-10}"
WEBHOOK_URL="${ALERT_WEBHOOK_URL:-${SLACK_WEBHOOK_URL:-${DISCORD_WEBHOOK_URL:-}}}"

mkdir -p "${LOG_DIR}"

# Cron runs every minute; a slow journal query must not overlap the next run.
exec 9>"${LOG_DIR}/.monitor.lock"
flock -n 9 || exit 0

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

# Suppress identical alert classes for 15 minutes. Dynamic values remain in
# the daily log, while webhooks/alert.log only receive actionable transitions.
should_emit_alert() {
    local alert="$1" key now previous
    key="$(printf '%s\n' "${alert}" | awk '{print $1 "|" $2}')"
    now="$(date +%s)"
    touch "${ALERT_DEDUP_FILE}"
    previous="$(awk -F '\t' -v k="${key}" '$1 == k {print $2}' "${ALERT_DEDUP_FILE}" | tail -1)"
    if [ -n "${previous}" ] && [ $((now - previous)) -lt 900 ]; then
        return 1
    fi
    awk -F '\t' -v k="${key}" '$1 != k' "${ALERT_DEDUP_FILE}" > "${ALERT_DEDUP_FILE}.tmp" 2>/dev/null || true
    printf '%s\t%s\n' "${key}" "${now}" >> "${ALERT_DEDUP_FILE}.tmp"
    mv "${ALERT_DEDUP_FILE}.tmp" "${ALERT_DEDUP_FILE}"
    return 0
}

# Detect service-local throttling/OOM even when host free memory is healthy.
# Values are cumulative in cgroup v2, so alert only on a positive delta.
record_cgroup_memory_events() {
    local cgroup path high oom_kill previous_high previous_oom
    mkdir -p "${LOG_DIR}"
    touch "${CGROUP_STATE_FILE}"

    while IFS='|' read -r cgroup path; do
        [ -r "${path}" ] || continue
        high="$(awk '$1 == "high" {print $2}' "${path}")"
        oom_kill="$(awk '$1 == "oom_kill" {print $2}' "${path}")"
        previous_high="$(awk -v s="${cgroup}" '$1 == s {print $2}' "${CGROUP_STATE_FILE}")"
        previous_oom="$(awk -v s="${cgroup}" '$1 == s {print $3}' "${CGROUP_STATE_FILE}")"

        if [ -n "${previous_high}" ] && [ "${high:-0}" -gt "${previous_high:-0}" ]; then
            alerts+=("WARNING cgroup_memory_throttle cgroup=${cgroup} high_events_delta=$((high - previous_high))")
        fi
        if [ -n "${previous_oom}" ] && [ "${oom_kill:-0}" -gt "${previous_oom:-0}" ]; then
            alerts+=("CRITICAL cgroup_oom_kill cgroup=${cgroup} oom_kill_delta=$((oom_kill - previous_oom))")
        fi

        awk -v s="${cgroup}" '$1 != s' "${CGROUP_STATE_FILE}" > "${CGROUP_STATE_FILE}.tmp" 2>/dev/null || true
        printf '%s %s %s\n' "${cgroup}" "${high:-0}" "${oom_kill:-0}" >> "${CGROUP_STATE_FILE}.tmp"
        mv "${CGROUP_STATE_FILE}.tmp" "${CGROUP_STATE_FILE}"
    done <<'CGROUPS'
smartspec-web.service|/sys/fs/cgroup/system.slice/smartspec-web.service/memory.events
smartspec-backend.service|/sys/fs/cgroup/system.slice/smartspec-backend.service/memory.events
system-smartspec-agent.slice|/sys/fs/cgroup/system.slice/system-smartspec.slice/system-smartspec-agent.slice/memory.events
user-1000.slice|/sys/fs/cgroup/user.slice/user-1000.slice/memory.events
system.slice|/sys/fs/cgroup/system.slice/memory.events
CGROUPS
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
    for service in smartspec-web smartspec-backend; do
        local count
        count="$(sudo journalctl -u "${service}.service" --since '10 minutes ago' --no-pager -q 2>/dev/null | grep -c "Started SmartAIHub" || true)"
        count="${count:-0}"

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

    # Used memory includes filesystem cache and is not sufficient to detect
    # reclaim/swap thrashing. Track available memory, swap and PSI as well.
    local mem_available swap_total swap_used swap_pct mem_psi_avg10
    mem_available="$(free -m | awk '/^Mem:/ {print $7}')"
    swap_total="$(free -m | awk '/^Swap:/ {print $2}')"
    swap_used="$(free -m | awk '/^Swap:/ {print $3}')"
    swap_pct=0
    if [ -n "${swap_total}" ] && [ "${swap_total}" -gt 0 ]; then
        swap_pct=$(( (swap_used * 100) / swap_total ))
    fi
    mem_psi_avg10="$(awk '/^some / {for (i=1; i<=NF; i++) if ($i ~ /^avg10=/) {sub("avg10=", "", $i); print $i}}' /proc/pressure/memory 2>/dev/null || echo 0)"

    if [ -n "${mem_available}" ] && [ "${mem_available}" -lt "${MEM_AVAILABLE_CRIT_MB}" ]; then
        alerts+=("CRITICAL low_memory_available available_mb=${mem_available} threshold_mb=${MEM_AVAILABLE_CRIT_MB}")
    elif [ -n "${mem_available}" ] && [ "${mem_available}" -lt "${MEM_AVAILABLE_WARN_MB}" ]; then
        alerts+=("WARNING low_memory_available available_mb=${mem_available} threshold_mb=${MEM_AVAILABLE_WARN_MB}")
    fi
    if [ "${swap_pct}" -ge "${SWAP_CRIT_PCT}" ]; then
        alerts+=("CRITICAL swap_pressure swap_pct=${swap_pct} used_mb=${swap_used} total_mb=${swap_total}")
    elif [ "${swap_pct}" -ge "${SWAP_WARN_PCT}" ]; then
        alerts+=("WARNING swap_pressure swap_pct=${swap_pct} used_mb=${swap_used} total_mb=${swap_total}")
    fi
    if awk -v value="${mem_psi_avg10:-0}" -v threshold="${MEM_PSI_CRIT_AVG10}" 'BEGIN { exit !(value >= threshold) }'; then
        alerts+=("CRITICAL memory_psi some_avg10=${mem_psi_avg10} threshold=${MEM_PSI_CRIT_AVG10}")
    fi

    record_cgroup_memory_events

    # ------------------------------------------------------------------
    # 3. SSH/Codex and SocratiCode lifecycle pressure
    # Reconnect fan-out can exhaust user/agent cgroups before host RAM looks
    # full. Keep Docker probing bounded so the monitor cannot amplify stalls.
    # ------------------------------------------------------------------
    local ssh_session_count ssh_preauth_count managed_mcp_count legacy_mcp_count
    local mcp_probe_state mcp_snapshot
    ssh_session_count="$(loginctl list-sessions --no-legend 2>/dev/null | awk '$3 == "dev" {count++} END {print count + 0}')"
    ssh_preauth_count="$(ps -eo args= 2>/dev/null | awk '/^sshd-session: dev \[priv\]/ {count++} END {print count + 0}')"
    managed_mcp_count="?"
    legacy_mcp_count="?"
    mcp_probe_state="unavailable"
    if mcp_snapshot="$(timeout 5s docker ps --filter name=socraticode-mcp --format '{{.Names}}|{{.Label "com.smartspec.socraticode.managed"}}' 2>/dev/null)"; then
        mcp_probe_state="ok"
        managed_mcp_count="$(printf '%s\n' "${mcp_snapshot}" | awk -F '|' '$2 == "true" {count++} END {print count + 0}')"
        legacy_mcp_count="$(printf '%s\n' "${mcp_snapshot}" | awk -F '|' '$1 != "" && $2 != "true" {count++} END {print count + 0}')"
    fi

    if [ "${ssh_session_count}" -ge "${SSH_SESSION_CRIT}" ]; then
        alerts+=("CRITICAL ssh_session_fanout sessions=${ssh_session_count} preauth=${ssh_preauth_count} threshold=${SSH_SESSION_CRIT}")
    elif [ "${ssh_session_count}" -ge "${SSH_SESSION_WARN}" ]; then
        alerts+=("WARNING ssh_session_fanout sessions=${ssh_session_count} preauth=${ssh_preauth_count} threshold=${SSH_SESSION_WARN}")
    fi
    if [ "${mcp_probe_state}" = "ok" ]; then
        if [ "${managed_mcp_count}" -ge "${MCP_CONTAINER_CRIT}" ]; then
            alerts+=("CRITICAL mcp_container_fanout managed=${managed_mcp_count} legacy=${legacy_mcp_count} threshold=${MCP_CONTAINER_CRIT}")
        elif [ "${managed_mcp_count}" -ge "${MCP_CONTAINER_WARN}" ]; then
            alerts+=("WARNING mcp_container_fanout managed=${managed_mcp_count} legacy=${legacy_mcp_count} threshold=${MCP_CONTAINER_WARN}")
        fi
    fi

    # ------------------------------------------------------------------
    # 4. Write to daily log
    # ------------------------------------------------------------------
    {
        echo "===== ${timestamp} ====="
        echo "ram_pct=${mem_pct:-?} used_mb=${mem_used:-?} total_mb=${mem_total:-?}"
        echo "available_mb=${mem_available:-?} swap_pct=${swap_pct:-?} swap_used_mb=${swap_used:-?} memory_psi_some_avg10=${mem_psi_avg10:-?}"
        echo "ssh_sessions=${ssh_session_count:-?} ssh_preauth=${ssh_preauth_count:-?} mcp_managed=${managed_mcp_count:-?} mcp_legacy=${legacy_mcp_count:-?} mcp_probe=${mcp_probe_state:-?}"
        if [ "${#alerts[@]}" -eq 0 ]; then
            echo "alerts=none"
        else
            printf 'alert: %s\n' "${alerts[@]}"
        fi
        echo ""
    } >> "${DAILY_LOG}"

    # ------------------------------------------------------------------
    # 5. Fire webhooks for actionable alerts
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
            if should_emit_alert "${alert}"; then
                send_webhook "${alert}" "${level}"
                echo "[${level}] ${alert}" >> "${ALERT_LOG}"
            fi
        fi
    done

    # Print summary to stdout (captured by cron into cron.log)
    echo "${timestamp} alerts=${#alerts[@]}"
}

# Run main, capturing any unexpected errors so the script never exits dirty
if ! main 2>>"${ALERT_LOG}"; then
    echo "${timestamp} crash-monitor-error: main() failed, see ${ALERT_LOG}" >> "${DAILY_LOG}"
fi
