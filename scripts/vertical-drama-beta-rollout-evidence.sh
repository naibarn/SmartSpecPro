#!/usr/bin/env bash

# Capture and, only when explicitly requested, execute the beta rollout checks
# for a Debian home server.  This is intentionally local-server only: a single
# home-server instance has no meaningful traffic-splitting primitive, so its
# canary is a repeated health/readiness + application smoke check after restart.

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EVIDENCE_ROOT="${VD_BETA_EVIDENCE_DIR:-${PROJECT_ROOT}/.artifacts/vertical-drama-beta}"
PUBLIC_URL="${VD_BETA_PUBLIC_URL:-http://127.0.0.1:3000}"
SERVICES=(smartspec-backend.service smartspec-web.service)

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "missing command: $1"
}

run_privileged() {
  if [ "$(id -u)" -eq 0 ]; then
    "$@"
  else
    sudo -n "$@"
  fi
}

new_evidence_dir() {
  local stamp
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  EVIDENCE_DIR="${EVIDENCE_ROOT}/${stamp}"
  mkdir -p "${EVIDENCE_DIR}"
  printf '%s\n' "${EVIDENCE_DIR}" > "${EVIDENCE_ROOT}/latest"
}

capture_snapshot() {
  local label="$1"
  local prefix="${EVIDENCE_DIR}/${label}"

  git -C "${PROJECT_ROOT}" rev-parse HEAD > "${prefix}.git-rev" 2>/dev/null || true
  git -C "${PROJECT_ROOT}" status --short > "${prefix}.git-status" 2>/dev/null || true
  date -u +%Y-%m-%dT%H:%M:%SZ > "${prefix}.captured-at"

  run_privileged systemctl is-active "${SERVICES[@]}" > "${prefix}.active" 2>&1 || true
  run_privileged systemctl show "${SERVICES[@]}" \
    -p Id -p ActiveState -p SubState -p MainPID -p NRestarts \
    > "${prefix}.systemd" 2>&1 || true
  run_privileged systemctl --no-pager --full status "${SERVICES[@]}" \
    > "${prefix}.status" 2>&1 || true
  run_privileged journalctl --no-pager -u smartspec-backend.service \
    -u smartspec-web.service -n 200 \
    > "${prefix}.journal" 2>&1 || true

  curl --max-time 10 --silent --show-error --output "${prefix}.healthz" \
    --write-out 'http_code=%{http_code}\ntime_total=%{time_total}\n' \
    "${PUBLIC_URL}/healthz" 2>&1 || true
  curl --max-time 10 --silent --show-error --output "${prefix}.readyz" \
    --write-out 'http_code=%{http_code}\ntime_total=%{time_total}\n' \
    "${PUBLIC_URL}/readyz" 2>&1 || true
}

run_smoke() {
  if [ -x "${PROJECT_ROOT}/scripts/smoke-test.sh" ]; then
    "${PROJECT_ROOT}/scripts/smoke-test.sh" "${PUBLIC_URL}" \
      > "${EVIDENCE_DIR}/smoke-test.log" 2>&1
  else
    curl --fail --max-time 10 "${PUBLIC_URL}/healthz" >/dev/null
    curl --fail --max-time 10 "${PUBLIC_URL}/readyz" >/dev/null
  fi
}

preflight() {
  require_command git
  require_command systemctl
  require_command journalctl
  require_command curl
  if [ "$(id -u)" -ne 0 ]; then
    require_command sudo
  fi

  for service in "${SERVICES[@]}"; do
    run_privileged systemctl cat "${service}" >/dev/null \
      || die "systemd unit is unavailable: ${service}"
  done

  mkdir -p "${EVIDENCE_ROOT}"
  new_evidence_dir
  capture_snapshot preflight
  log "preflight evidence: ${EVIDENCE_DIR}"
}

assert_execute_confirmation() {
  local expected="$1"
  [ "${VD_BETA_ROLLOUT_CONFIRM:-}" = "${expected}" ] || die \
    "refusing mutation; set VD_BETA_ROLLOUT_CONFIRM=${expected} explicitly"
}

restart_and_canary() {
  assert_execute_confirmation restart
  preflight
  log "restarting beta services: ${SERVICES[*]}"
  run_privileged systemctl restart "${SERVICES[@]}"
  run_privileged systemctl is-active --quiet "${SERVICES[@]}" \
    || die "one or more services did not become active"

  for attempt in 1 2 3 4 5; do
    run_smoke || {
      capture_snapshot "canary-failed-${attempt}"
      die "local canary failed on attempt ${attempt}"
    }
    sleep 2
  done
  capture_snapshot canary-passed
  log "local canary passed; no traffic split was performed"
}

rollback() {
  assert_execute_confirmation rollback
  [ -n "${VD_BETA_ROLLBACK_COMMAND:-}" ] || die \
    'set VD_BETA_ROLLBACK_COMMAND to the reviewed command that restores the previous immutable release'
  preflight
  log "executing operator-supplied rollback command"
  bash -c "${VD_BETA_ROLLBACK_COMMAND}"
  run_privileged systemctl is-active --quiet "${SERVICES[@]}" \
    || die "services are not active after rollback"
  run_smoke || {
    capture_snapshot rollback-failed
    die "rollback completed but smoke test failed"
  }
  capture_snapshot rollback-passed
  log "rollback smoke test passed"
}

usage() {
  cat <<'EOF'
Usage:
  vertical-drama-beta-rollout-evidence.sh preflight
  VD_BETA_ROLLOUT_CONFIRM=restart vertical-drama-beta-rollout-evidence.sh restart-canary
  VD_BETA_ROLLOUT_CONFIRM=rollback \
    VD_BETA_ROLLBACK_COMMAND='...' \
    vertical-drama-beta-rollout-evidence.sh rollback

Environment:
  VD_BETA_PUBLIC_URL       default: http://127.0.0.1:3000
  VD_BETA_EVIDENCE_DIR     default: .artifacts/vertical-drama-beta
EOF
}

case "${1:-}" in
  preflight) preflight ;;
  restart-canary) restart_and_canary ;;
  rollback) rollback ;;
  *) usage; exit 2 ;;
esac
