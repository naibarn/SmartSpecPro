#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/system-watch"
STAMP="$(date '+%F_%H%M%S')"
REPORT_FILE="${LOG_DIR}/reboot-analysis-${STAMP}.log"
LATEST_FILE="${LOG_DIR}/reboot-analysis-latest.log"
PREV_BOOT_LINES="${SYSTEM_WATCH_PREV_BOOT_LINES:-120}"

mkdir -p "${LOG_DIR}"

run_or_unavailable() {
  if "$@" 2>/dev/null; then
    :
  else
    echo "unavailable"
  fi
}

run_shell_or_unavailable() {
  if bash -lc "$1" 2>/dev/null; then
    :
  else
    echo "unavailable"
  fi
}

{
  echo "===== Reboot Analysis ${STAMP} ====="
  echo "host=$(hostname)"
  echo "current_time=$(date '+%F %T %z')"
  echo "current_boot=$(who -b 2>/dev/null || true)"
  echo
  echo "-- boot_history --"
  run_shell_or_unavailable "sudo -n journalctl --list-boots --no-pager | tail -n 8"
  echo
  echo "-- last_reboots --"
  run_shell_or_unavailable "last -x | head -n 12"
  echo
  echo "-- previous_boot_tail --"
  run_or_unavailable sudo -n journalctl -b -1 -n "${PREV_BOOT_LINES}" --no-pager
  echo
  echo "-- previous_boot_kernel_signatures --"
  run_shell_or_unavailable "sudo -n journalctl -k -b -1 --no-pager | rg -i 'panic|watchdog|hung task|rcu stall|call trace|BUG:|out of memory|oom-killer|killed process|thermal|overheat|critical temperature|hardware error|machine check|nvme.*(error|timeout|reset|abort)|I/O error|EXT4-fs error|FAT-fs|not properly unmounted|orphan cleanup|aer:'"
  echo
  echo "-- current_boot_recovery_signatures --"
  run_shell_or_unavailable "sudo -n journalctl -k -b 0 --no-pager | rg -i 'recover|recovery|orphan cleanup|not properly unmounted|journal corrupted|unclean|fsck|FAT-fs|EXT4-fs'"
  echo
  echo "-- current_resource_snapshot --"
  run_or_unavailable free -h
  run_or_unavailable df -h /
  run_or_unavailable uptime
  echo
} > "${REPORT_FILE}"

cp "${REPORT_FILE}" "${LATEST_FILE}"
printf '%s\n' "${REPORT_FILE}"
