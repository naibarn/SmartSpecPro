#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<USAGE
usage:
  $0 check
  $0 run -- <command> [args...]

Environment:
  CODEX_ALLOW_SHARED_HEAVY_CHECKS=1       allow heavy checks on this shared host
  CODEX_HEAVY_MIN_AVAILABLE_MB=8192       minimum MemAvailable before starting
  CODEX_HEAVY_MAX_LOAD_PER_CPU=1.50       maximum 1m load divided by CPU count
  CODEX_HEAVY_MAX_MEMORY_PSI_AVG10=2.00   maximum /proc/pressure/memory some avg10 when available
USAGE
  exit 2
}

mode="${1:-}"
[[ "$mode" == "check" || "$mode" == "run" ]] || usage

repo_common="$(git rev-parse --git-common-dir 2>/dev/null || true)"
[[ -n "$repo_common" ]] || { echo "HEAVY_GATE_ERROR not_in_git_repo" >&2; exit 2; }
case "$repo_common" in /*) ;; *) repo_common="$(pwd)/$repo_common";; esac
mkdir -p "$repo_common/codex-resource-locks"
lockfile="$repo_common/codex-resource-locks/heavy-verification.lock"
min_mb="${CODEX_HEAVY_MIN_AVAILABLE_MB:-8192}"
max_load_per_cpu="${CODEX_HEAVY_MAX_LOAD_PER_CPU:-1.50}"
max_psi="${CODEX_HEAVY_MAX_MEMORY_PSI_AVG10:-2.00}"
allow="${CODEX_ALLOW_SHARED_HEAVY_CHECKS:-0}"

[[ "$allow" == "1" ]] || { echo "HEAVY_GATE_DEFERRED reason=shared_host_heavy_checks_disabled lock=$lockfile"; exit 75; }

exec 9>"$lockfile"
if ! flock -n 9; then
  echo "HEAVY_GATE_DEFERRED reason=another_heavy_verifier_active lock=$lockfile"
  exit 77
fi

# Re-check resource state only after the serialized heavy lease is held.
available_mb="$(awk '/MemAvailable:/ {printf "%d", $2/1024}' /proc/meminfo 2>/dev/null || echo 0)"
cpu_count="$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
load1="$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo 999)"
load_per_cpu="$(awk -v l="$load1" -v c="$cpu_count" 'BEGIN { if (c < 1) c=1; printf "%.2f", l/c }')"
psi_avg10="0.00"
if [[ -r /proc/pressure/memory ]]; then
  psi_avg10="$(awk '/^some / {for (i=1;i<=NF;i++) if ($i ~ /^avg10=/) {split($i,a,"="); print a[2]; exit}}' /proc/pressure/memory 2>/dev/null || echo 0.00)"
fi

if [[ "$available_mb" -lt "$min_mb" ]]; then
  echo "HEAVY_GATE_DEFERRED reason=insufficient_memory mem_available_mb=$available_mb min_mb=$min_mb load_per_cpu=$load_per_cpu memory_psi_avg10=$psi_avg10 lock=$lockfile"
  exit 76
fi
if ! awk -v v="$load_per_cpu" -v m="$max_load_per_cpu" 'BEGIN { exit !(v <= m) }'; then
  echo "HEAVY_GATE_DEFERRED reason=host_load_high mem_available_mb=$available_mb load_per_cpu=$load_per_cpu max_load_per_cpu=$max_load_per_cpu memory_psi_avg10=$psi_avg10 lock=$lockfile"
  exit 78
fi
if ! awk -v v="$psi_avg10" -v m="$max_psi" 'BEGIN { exit !(v <= m) }'; then
  echo "HEAVY_GATE_DEFERRED reason=memory_pressure_high mem_available_mb=$available_mb load_per_cpu=$load_per_cpu memory_psi_avg10=$psi_avg10 max_memory_psi_avg10=$max_psi lock=$lockfile"
  exit 79
fi

if [[ "$mode" == "check" ]]; then
  echo "HEAVY_GATE_READY mem_available_mb=$available_mb min_mb=$min_mb load_per_cpu=$load_per_cpu max_load_per_cpu=$max_load_per_cpu memory_psi_avg10=$psi_avg10 max_memory_psi_avg10=$max_psi lock=$lockfile"
  exit 0
fi

shift
[[ "${1:-}" == "--" ]] || usage
shift
[[ $# -gt 0 ]] || usage

echo "HEAVY_GATE_ACQUIRED mem_available_mb=$available_mb load_per_cpu=$load_per_cpu memory_psi_avg10=$psi_avg10 lock=$lockfile command=$1"
exec "$@"
