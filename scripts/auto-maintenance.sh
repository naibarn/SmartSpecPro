#!/bin/bash

# SmartAIHub Auto-Maintenance Script
# Runs periodically to prevent resource leaks and disk bloat.
# Designed to be safe and idempotent — can run every hour via cron.

set -uo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/maintenance"
LOG_FILE="${LOG_DIR}/maintenance-$(date +%F).log"

mkdir -p "${LOG_DIR}"

log() {
  echo "[$(date '+%F %T')] $1" | tee -a "${LOG_FILE}"
}

CLEANED_SOMETHING=false

# -------------------------------------------------------------------
# 1. Kill orphaned pytest processes (running > 2 hours)
# -------------------------------------------------------------------
kill_orphaned_pytest() {
  local threshold_seconds=7200  # 2 hours
  local now_epoch
  now_epoch=$(date +%s)
  local killed=0

  while IFS= read -r line; do
    local pid elapsed_sec cmd
    pid=$(echo "$line" | awk '{print $1}')
    elapsed_sec=$(echo "$line" | awk '{print $2}')
    cmd=$(echo "$line" | awk '{$1=$2=""; sub(/^  */, ""); print}')

    if [ "$elapsed_sec" -ge "$threshold_seconds" ]; then
      log "KILL orphaned pytest PID=$pid elapsed=${elapsed_sec}s cmd=$(echo "$cmd" | head -c 120)"
      kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
    fi
  done < <(ps -eo pid,etimes,args --no-headers | grep '[p]ytest' | grep -v 'auto-maintenance')

  if [ "$killed" -gt 0 ]; then
    log "Killed $killed orphaned pytest processes"
    CLEANED_SOMETHING=true
  fi
}

# -------------------------------------------------------------------
# 2. Reap zombie processes by signaling their parents
# -------------------------------------------------------------------
reap_zombies() {
  local zombie_count
  zombie_count=$(ps aux | awk '$8 ~ /Z/' | wc -l)

  if [ "$zombie_count" -gt 10 ]; then
    log "Found $zombie_count zombie processes, signaling parents"

    # Get unique parent PIDs of zombies
    local parents
    parents=$(ps -eo ppid,stat | awk '$2 ~ /Z/ {print $1}' | sort -u)

    for ppid in $parents; do
      local child_count
      child_count=$(ps -eo ppid,stat | awk -v p="$ppid" '$1==p && $2 ~ /Z/' | wc -l)
      if [ "$child_count" -gt 5 ]; then
        local parent_cmd
        parent_cmd=$(ps -o args= -p "$ppid" 2>/dev/null | head -c 80)
        log "Parent PID=$ppid has $child_count zombies (${parent_cmd}), sending SIGCHLD"
        kill -SIGCHLD "$ppid" 2>/dev/null

        # If SIGCHLD doesn't help within 2 seconds, kill the parent
        sleep 2
        local remaining
        remaining=$(ps -eo ppid,stat | awk -v p="$ppid" '$1==p && $2 ~ /Z/' | wc -l)
        if [ "$remaining" -gt 5 ]; then
          log "SIGCHLD ineffective, killing parent PID=$ppid to clear $remaining zombies"
          kill -9 "$ppid" 2>/dev/null
          CLEANED_SOMETHING=true
        fi
      fi
    done
  fi
}

# -------------------------------------------------------------------
# 3. Clean up stale Claude worktrees (older than 24 hours)
# -------------------------------------------------------------------
cleanup_worktrees() {
  local worktree_dir="${PROJECT_ROOT}/.claude/worktrees"
  [ -d "$worktree_dir" ] || return 0

  local cutoff_minutes=1440  # 24 hours
  local removed=0
  local freed_mb=0

  while IFS= read -r wt_dir; do
    [ -d "$wt_dir" ] || continue
    local size_kb
    size_kb=$(du -sk "$wt_dir" 2>/dev/null | awk '{print $1}')
    local name
    name=$(basename "$wt_dir")
    log "REMOVE stale worktree $name ($(( size_kb / 1024 ))MB, older than ${cutoff_minutes}min)"
    rm -rf "$wt_dir" && removed=$((removed + 1)) && freed_mb=$(( freed_mb + size_kb / 1024 ))
  done < <(find "$worktree_dir" -maxdepth 1 -name 'agent-*' -type d -mmin +${cutoff_minutes} 2>/dev/null)

  if [ "$removed" -gt 0 ]; then
    log "Removed $removed worktrees, freed ${freed_mb}MB"
    # Prune git worktree references
    cd "$PROJECT_ROOT" && git worktree prune 2>/dev/null
    CLEANED_SOMETHING=true
  fi
}

# -------------------------------------------------------------------
# 4. Clean turbo cache when it exceeds 2GB
# -------------------------------------------------------------------
cleanup_turbo_cache() {
  local cache_dir="${PROJECT_ROOT}/.turbo/cache"
  [ -d "$cache_dir" ] || return 0

  local size_kb
  size_kb=$(du -sk "$cache_dir" 2>/dev/null | awk '{print $1}')
  local size_mb=$(( size_kb / 1024 ))

  if [ "$size_mb" -gt 2048 ]; then
    log "Turbo cache is ${size_mb}MB (>2GB), cleaning"
    find "$cache_dir" -name '*.tar.zst' -mmin +1440 -delete 2>/dev/null
    find "$cache_dir" -name '*-meta.json' -mmin +1440 -delete 2>/dev/null

    local after_kb
    after_kb=$(du -sk "$cache_dir" 2>/dev/null | awk '{print $1}')
    log "Turbo cache after cleanup: $(( after_kb / 1024 ))MB (freed $(( (size_kb - after_kb) / 1024 ))MB)"
    CLEANED_SOMETHING=true
  fi
}

# -------------------------------------------------------------------
# 5. Clean old maintenance / health-check logs (>14 days)
# -------------------------------------------------------------------
cleanup_old_logs() {
  local cleaned=0

  for dir in "${PROJECT_ROOT}/logs/maintenance" "${PROJECT_ROOT}/logs/system-watch"; do
    [ -d "$dir" ] || continue
    while IFS= read -r f; do
      rm -f "$f" && cleaned=$((cleaned + 1))
    done < <(find "$dir" -name '*.log' -mtime +14 2>/dev/null)
  done

  # Clean old turbo daemon logs
  [ -d "${PROJECT_ROOT}/.turbo/daemon" ] && \
    find "${PROJECT_ROOT}/.turbo/daemon" -name '*.log.*' -mtime +7 -delete 2>/dev/null

  if [ "$cleaned" -gt 0 ]; then
    log "Removed $cleaned old log files (>14 days)"
  fi
}

# -------------------------------------------------------------------
# 6. Swap pressure relief — drop caches if swap > 50%
# -------------------------------------------------------------------
swap_pressure_relief() {
  local swap_total swap_used swap_pct
  swap_total=$(free | awk '/Swap:/ {print $2}')
  swap_used=$(free | awk '/Swap:/ {print $3}')

  [ "$swap_total" -eq 0 ] && return 0

  swap_pct=$(( swap_used * 100 / swap_total ))

  if [ "$swap_pct" -gt 50 ]; then
    log "Swap usage at ${swap_pct}% — dropping page cache to relieve memory pressure"
    sync
    echo 1 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1 || \
      log "WARN: cannot drop caches (no sudo), skipping"
  fi
}

# -------------------------------------------------------------------
# 7. Disk space alert
# -------------------------------------------------------------------
check_disk_space() {
  local disk_pct
  disk_pct=$(df / | awk 'NR==2 {gsub(/%/,""); print $5}')

  if [ "$disk_pct" -gt 85 ]; then
    log "ALERT: Disk usage at ${disk_pct}% — intervention needed"

    # Auto-clean media_storage exports older than 30 days
    local media_dir="${PROJECT_ROOT}/python-backend/media_storage/presentation_exports"
    if [ -d "$media_dir" ]; then
      local before_kb
      before_kb=$(du -sk "$media_dir" 2>/dev/null | awk '{print $1}')
      find "$media_dir" -type f -mtime +30 -delete 2>/dev/null
      find "$media_dir" -type d -empty -delete 2>/dev/null
      local after_kb
      after_kb=$(du -sk "$media_dir" 2>/dev/null | awk '{print $1}')
      [ "$before_kb" -gt "$after_kb" ] && \
        log "Cleaned old presentation exports: freed $(( (before_kb - after_kb) / 1024 ))MB"
    fi
  fi
}

# -------------------------------------------------------------------
# 8. Check and report stale Chrome/headless processes
# -------------------------------------------------------------------
cleanup_stale_chrome() {
  local threshold_seconds=3600  # 1 hour
  local killed=0

  while IFS= read -r line; do
    local pid elapsed_sec
    pid=$(echo "$line" | awk '{print $1}')
    elapsed_sec=$(echo "$line" | awk '{print $2}')

    if [ "$elapsed_sec" -ge "$threshold_seconds" ]; then
      log "KILL stale chrome-headless PID=$pid elapsed=${elapsed_sec}s"
      kill -9 "$pid" 2>/dev/null && killed=$((killed + 1))
    fi
  done < <(ps -eo pid,etimes,args --no-headers | grep '[c]hrome.*headless' | grep -v 'auto-maintenance')

  [ "$killed" -gt 0 ] && log "Killed $killed stale chrome-headless processes" && CLEANED_SOMETHING=true
}

# -------------------------------------------------------------------
# Main
# -------------------------------------------------------------------
log "=== Auto-maintenance started ==="
log "System: $(free -h | awk '/Mem:/ {printf "RAM %s/%s", $3, $2}'), Swap: $(free -h | awk '/Swap:/ {printf "%s/%s", $3, $2}'), Disk: $(df -h / | awk 'NR==2 {printf "%s/%s (%s)", $3, $2, $5}')"

kill_orphaned_pytest
reap_zombies
cleanup_stale_chrome
cleanup_worktrees
cleanup_turbo_cache
cleanup_old_logs
swap_pressure_relief
check_disk_space

if [ "$CLEANED_SOMETHING" = true ]; then
  log "System after cleanup: $(free -h | awk '/Mem:/ {printf "RAM %s/%s", $3, $2}'), Swap: $(free -h | awk '/Swap:/ {printf "%s/%s", $3, $2}'), Disk: $(df -h / | awk 'NR==2 {printf "%s/%s (%s)", $3, $2, $5}')"
fi

log "=== Auto-maintenance completed ==="
