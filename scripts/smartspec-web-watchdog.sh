#!/usr/bin/env bash

# Independent liveness/memory watchdog for smartspec-web.service.
# It intentionally runs outside the Node.js cgroup so it can recover a
# process that is alive but stuck in cgroup memory throttling.

set -uo pipefail

SERVICE="${SMARTSPEC_WEB_WATCHDOG_SERVICE:-smartspec-web.service}"
HEALTH_URL="${SMARTSPEC_WEB_HEALTH_URL:-http://127.0.0.1:3000/healthz}"
INTERVAL_SECONDS="${SMARTSPEC_WEB_WATCHDOG_INTERVAL_SECONDS:-10}"
HEALTH_TIMEOUT_SECONDS="${SMARTSPEC_WEB_HEALTH_TIMEOUT_SECONDS:-5}"
FAILURE_THRESHOLD="${SMARTSPEC_WEB_HEALTH_FAILURE_THRESHOLD:-3}"
MEMORY_HIGH_THRESHOLD="${SMARTSPEC_WEB_MEMORY_HIGH_THRESHOLD:-3}"
COOLDOWN_SECONDS="${SMARTSPEC_WEB_RESTART_COOLDOWN_SECONDS:-300}"
RESTART_WINDOW_SECONDS="${SMARTSPEC_WEB_RESTART_WINDOW_SECONDS:-1800}"
MAX_RESTARTS="${SMARTSPEC_WEB_MAX_RESTARTS:-3}"
CGROUP_ROOT="${SMARTSPEC_WEB_CGROUP_PATH:-/sys/fs/cgroup/system.slice/smartspec-web.service}"
DIAGNOSTIC_DIR="${SMARTSPEC_WEB_DIAGNOSTIC_DIR:-/var/lib/smartspec/web-diagnostics}"
STATE_DIR="${SMARTSPEC_WEB_WATCHDOG_STATE_DIR:-/run/smartspec-web-watchdog}"
RESTART_STATE_FILE="$STATE_DIR/restarts.log"

health_failures=0
memory_high_samples=0
budget_blocked=0

log() {
  printf '[WebWatchdog] %s\n' "$*"
}

read_number_file() {
  local file="$1"
  local value
  if [[ -r "$file" ]]; then
    value="$(tr -d '[:space:]' < "$file" 2>/dev/null || true)"
    if [[ "$value" =~ ^[0-9]+$ ]]; then
      printf '%s\n' "$value"
      return 0
    fi
  fi
  return 1
}

health_ok() {
  curl --fail --silent --show-error --max-time "$HEALTH_TIMEOUT_SECONDS" "$HEALTH_URL" >/dev/null 2>&1
}

memory_above_high() {
  local current high
  current="$(read_number_file "$CGROUP_ROOT/memory.current")" || return 1
  high="$(read_number_file "$CGROUP_ROOT/memory.high")" || return 1
  [[ "$current" -gt "$high" ]]
}

main_pid() {
  local pid
  pid="$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || true)"
  if [[ "$pid" =~ ^[0-9]+$ ]] && [[ "$pid" -gt 1 ]]; then
    printf '%s\n' "$pid"
  fi
}

prune_restart_state() {
  local now cutoff timestamp
  now="$(date +%s)"
  cutoff=$((now - RESTART_WINDOW_SECONDS))
  mkdir -p "$STATE_DIR"
  touch "$RESTART_STATE_FILE"
  while IFS= read -r timestamp; do
    if [[ "$timestamp" =~ ^[0-9]+$ ]] && [[ "$timestamp" -ge "$cutoff" ]]; then
      printf '%s\n' "$timestamp"
    fi
  done < "$RESTART_STATE_FILE" > "$RESTART_STATE_FILE.tmp"
  mv "$RESTART_STATE_FILE.tmp" "$RESTART_STATE_FILE"
}

restart_count() {
  prune_restart_state
  wc -l < "$RESTART_STATE_FILE" | tr -d '[:space:]'
}

last_restart_at() {
  tail -n 1 "$RESTART_STATE_FILE" 2>/dev/null || true
}

capture_diagnostics() {
  local reason="$1"
  local pid="${2:-}"
  local timestamp safe_reason bundle
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  safe_reason="${reason//[^a-zA-Z0-9_.-]/_}"
  bundle="$DIAGNOSTIC_DIR/${timestamp}-${safe_reason}"
  mkdir -p "$bundle"

  systemctl status "$SERVICE" --no-pager > "$bundle/systemctl-status.txt" 2>&1 || true
  systemctl show "$SERVICE" > "$bundle/systemctl-show.txt" 2>&1 || true
  journalctl -u "$SERVICE" -n 250 --no-pager > "$bundle/journal.txt" 2>&1 || true
  for name in memory.current memory.high memory.max memory.events memory.stat; do
    if [[ -r "$CGROUP_ROOT/$name" ]]; then
      cp "$CGROUP_ROOT/$name" "$bundle/$name" 2>/dev/null || true
    fi
  done
  ps -eo pid,ppid,stat,wchan:32,rss,vsz,etime,cmd --sort=-rss > "$bundle/processes.txt" 2>&1 || true
  ss -H -ltnp > "$bundle/listening-sockets.txt" 2>&1 || true

  if [[ "$pid" =~ ^[0-9]+$ ]] && [[ -d "/proc/$pid" ]]; then
    cp "/proc/$pid/status" "$bundle/proc-status.txt" 2>/dev/null || true
    cp "/proc/$pid/smaps_rollup" "$bundle/proc-smaps-rollup.txt" 2>/dev/null || true
    cp "/proc/$pid/limits" "$bundle/proc-limits.txt" 2>/dev/null || true
    # Node writes a heap snapshot to --diagnostic-dir on SIGUSR2.
    if kill -USR2 "$pid" 2>/dev/null; then
      date -u +%FT%TZ > "$bundle/heap-snapshot-signal.txt"
      sleep 3
    else
      log "Could not send SIGUSR2 to PID $pid; continuing with host diagnostics"
    fi
  fi

  log "Diagnostics captured: $bundle"
}

restart_web() {
  local reason="$1"
  local now last count pid
  now="$(date +%s)"
  last="$(last_restart_at)"
  count="$(restart_count)"

  if [[ "$count" -ge "$MAX_RESTARTS" ]]; then
    if [[ "$budget_blocked" -eq 0 ]]; then
      log "Restart budget exhausted: $count restarts in ${RESTART_WINDOW_SECONDS}s"
      budget_blocked=1
    fi
    return 1
  fi
  if [[ "$last" =~ ^[0-9]+$ ]] && [[ $((now - last)) -lt "$COOLDOWN_SECONDS" ]]; then
    return 1
  fi

  pid="$(main_pid)"
  capture_diagnostics "$reason" "$pid"
  log "Restarting $SERVICE: $reason"
  if systemctl restart "$SERVICE"; then
    printf '%s\n' "$now" >> "$RESTART_STATE_FILE"
    budget_blocked=0
    return 0
  fi
  log "Restart command failed for $SERVICE"
  return 1
}

sample_once() {
  if health_ok; then
    health_failures=0
  else
    health_failures=$((health_failures + 1))
  fi

  if memory_above_high; then
    memory_high_samples=$((memory_high_samples + 1))
  else
    memory_high_samples=0
  fi

  log "health_failures=$health_failures/$FAILURE_THRESHOLD memory_high_samples=$memory_high_samples/$MEMORY_HIGH_THRESHOLD"

  if [[ "$health_failures" -ge "$FAILURE_THRESHOLD" ]] || [[ "$memory_high_samples" -ge "$MEMORY_HIGH_THRESHOLD" ]]; then
    local reason=""
    if [[ "$health_failures" -ge "$FAILURE_THRESHOLD" ]]; then
      reason="healthz-failed-${health_failures}-times"
    fi
    if [[ "$memory_high_samples" -ge "$MEMORY_HIGH_THRESHOLD" ]]; then
      reason="${reason:+$reason-}memory-above-high-${memory_high_samples}-samples"
    fi
    restart_web "$reason"
    health_failures=0
    memory_high_samples=0
  fi
}

main() {
  mkdir -p "$STATE_DIR" "$DIAGNOSTIC_DIR"
  if [[ "${1:-}" == "--once" ]]; then
    sample_once
    return 0
  fi
  while true; do
    sample_once
    sleep "$INTERVAL_SECONDS"
  done
}

main "$@"
