#!/bin/bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${PROJECT_ROOT}/logs/system-watch"
HEARTBEAT_FILE="${LOG_DIR}/heartbeat.txt"
DAILY_LOG="${LOG_DIR}/system-watch-$(date +%F).log"
TEMP_LOG="${DAILY_LOG}.tmp"
ALERT_LOG="${LOG_DIR}/alerts.log"
RSS_ALERT_MB="${SYSTEM_WATCH_RSS_ALERT_MB:-3072}"
MEMORY_ALERT_PCT="${SYSTEM_WATCH_MEMORY_ALERT_PCT:-85}"
LOAD_ALERT_PER_CPU="${SYSTEM_WATCH_LOAD_ALERT_PER_CPU:-1.5}"

mkdir -p "${LOG_DIR}"

timestamp="$(date '+%F %T %z')"
host="$(hostname)"
uptime_line="$(uptime 2>/dev/null || true)"
last_boot="$(who -b 2>/dev/null || true)"
disk_root="$(df -h / 2>/dev/null | tail -n 1 || true)"
memory_line="$(free -h 2>/dev/null | awk '/Mem:/ {printf "used=%s free=%s available=%s", $3, $4, $7}' || true)"
swap_line="$(free -h 2>/dev/null | awk '/Swap:/ {printf "%s", $3}' || true)"
loadavg_line="$(cat /proc/loadavg 2>/dev/null || true)"
psi_memory="$(tr '\n' ' ' < /proc/pressure/memory 2>/dev/null || true)"
psi_cpu="$(tr '\n' ' ' < /proc/pressure/cpu 2>/dev/null || true)"
psi_io="$(tr '\n' ' ' < /proc/pressure/io 2>/dev/null || true)"
cpu_count="$(nproc 2>/dev/null || echo 1)"
load_1m="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 0)"
mem_pct="$(free 2>/dev/null | awk '/Mem:/ {printf "%.0f", ($3/$2)*100}' || echo 0)"

alerts=()
while IFS='|' read -r pid rss_mb cmd; do
  [ -n "${pid}" ] || continue
  if [ "${rss_mb}" -ge "${RSS_ALERT_MB}" ]; then
    alerts+=("high_rss pid=${pid} rss_mb=${rss_mb} cmd=${cmd}")
  fi
done < <(ps -eo pid,rss,args --no-headers | awk '{pid=$1; rss_mb=int($2/1024); $1=$2=""; sub(/^  */, ""); printf "%s|%s|%s\n", pid, rss_mb, $0}')

if [ "${mem_pct}" -ge "${MEMORY_ALERT_PCT}" ]; then
  alerts+=("high_memory mem_pct=${mem_pct}")
fi

if awk "BEGIN {exit !(${load_1m} > (${cpu_count} * ${LOAD_ALERT_PER_CPU}))}"; then
  alerts+=("high_load load1=${load_1m} cpu_count=${cpu_count}")
fi

{
  echo "===== ${timestamp} ====="
  echo "host=${host}"
  echo "last_boot=${last_boot}"
  echo "uptime=${uptime_line}"
  echo "loadavg=${loadavg_line}"
  echo "memory=${memory_line} swap_used=${swap_line}"
  echo "disk_root=${disk_root}"
  echo "psi_memory=${psi_memory}"
  echo "psi_cpu=${psi_cpu}"
  echo "psi_io=${psi_io}"
  echo "-- thermal --"
  for zone in /sys/class/thermal/thermal_zone*; do
    [ -d "${zone}" ] || continue
    zone_name="$(basename "${zone}")"
    zone_type="$(cat "${zone}/type" 2>/dev/null || echo unknown)"
    zone_temp="$(cat "${zone}/temp" 2>/dev/null || echo unknown)"
    echo "${zone_name} type=${zone_type} temp=${zone_temp}"
  done
  echo "-- top_mem --"
  ps -eo pid,ppid,user,%mem,%cpu,rss,vsz,etimes,cmd --sort=-%mem | head -n 12
  echo "-- top_cpu --"
  ps -eo pid,ppid,user,%mem,%cpu,rss,vsz,etimes,cmd --sort=-%cpu | head -n 12
  echo "-- recent_kernel_warnings --"
  if sudo -n journalctl -k --since '-2 min' -p warning..alert --no-pager 2>/dev/null; then
    :
  else
    echo "unavailable"
  fi
  echo "-- recent_system_warnings --"
  if sudo -n journalctl --since '-2 min' -p warning..alert --no-pager 2>/dev/null; then
    :
  else
    echo "unavailable"
  fi
  echo "-- alerts --"
  if [ "${#alerts[@]}" -eq 0 ]; then
    echo "none"
  else
    printf '%s\n' "${alerts[@]}"
  fi
  echo
} > "${TEMP_LOG}"

cat "${TEMP_LOG}" >> "${DAILY_LOG}"
rm -f "${TEMP_LOG}"

printf '%s host=%s uptime=%s\n' "${timestamp}" "${host}" "${uptime_line}" > "${HEARTBEAT_FILE}"

if [ "${#alerts[@]}" -gt 0 ]; then
  {
    printf '%s ' "${timestamp}"
    printf '%s; ' "${alerts[@]}"
    printf '\n'
  } >> "${ALERT_LOG}"
fi
