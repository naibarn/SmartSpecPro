#!/usr/bin/env bash
# =============================================================================
# SmartSpecPro — OpenSandbox Connectivity Verification
# =============================================================================
#
# Runs the full connectivity test matrix after deploying the Hetzner server.
# Designed to be executed from the GCP environment or any machine that has
# the correct network path to the Hetzner sandbox server.
#
# Usage:
#   export OPENSANDBOX_API_KEY=<secret>
#   bash verify-connectivity.sh [--domain sandbox.smartaihub.app]
#
# Environment variables:
#   OPENSANDBOX_API_KEY  - Required: API key for OpenSandbox server
#   SANDBOX_DOMAIN       - Override domain (default: sandbox.smartaihub.app)
#   SKIP_SANDBOX_CREATE  - Set to "true" to skip the sandbox creation round-trip
# =============================================================================

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SANDBOX_DOMAIN="${SANDBOX_DOMAIN:-sandbox.smartaihub.app}"
OPENSANDBOX_API_KEY="${OPENSANDBOX_API_KEY:-}"
SKIP_SANDBOX_CREATE="${SKIP_SANDBOX_CREATE:-false}"
BASE_URL="https://${SANDBOX_DOMAIN}"

# ---------------------------------------------------------------------------
# Colour output
# ---------------------------------------------------------------------------

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

pass() { echo -e "  ${GREEN}[PASS]${NC} $*"; ((PASS_COUNT++)); }
fail() { echo -e "  ${RED}[FAIL]${NC} $*"; ((FAIL_COUNT++)); }
warn() { echo -e "  ${YELLOW}[WARN]${NC} $*"; ((WARN_COUNT++)); }
info() { echo -e "  ${BLUE}[INFO]${NC} $*"; }

# ---------------------------------------------------------------------------
# Pre-flight
# ---------------------------------------------------------------------------

preflight() {
  echo ""
  echo "================================================================"
  echo "  SmartSpecPro — OpenSandbox Connectivity Verification"
  echo "  Target: ${BASE_URL}"
  echo "  $(date)"
  echo "================================================================"
  echo ""

  for cmd in curl openssl; do
    if ! command -v "${cmd}" &>/dev/null; then
      echo "ERROR: Required command '${cmd}' not found."
      exit 1
    fi
  done

  if [[ -z "${OPENSANDBOX_API_KEY}" ]]; then
    echo "ERROR: OPENSANDBOX_API_KEY must be set."
    echo "  export OPENSANDBOX_API_KEY=<secret>"
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Test 1 — HTTPS health endpoint
# ---------------------------------------------------------------------------

test_https_health() {
  echo "Test 1: HTTPS health endpoint"

  local http_code
  http_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    "${BASE_URL}/health" 2>/dev/null || echo "000")"

  if [[ "${http_code}" == "200" ]]; then
    pass "GET ${BASE_URL}/health → HTTP ${http_code}"
  else
    fail "GET ${BASE_URL}/health → HTTP ${http_code} (expected 200)"
  fi
}

# ---------------------------------------------------------------------------
# Test 2 — TLS certificate validity
# ---------------------------------------------------------------------------

test_tls_certificate() {
  echo ""
  echo "Test 2: TLS certificate validity"

  local cert_info
  cert_info="$(openssl s_client \
    -connect "${SANDBOX_DOMAIN}:443" \
    -servername "${SANDBOX_DOMAIN}" \
    </dev/null 2>/dev/null \
    | openssl x509 -noout -dates -subject -issuer 2>/dev/null || echo "FAILED")"

  if [[ "${cert_info}" == "FAILED" ]]; then
    fail "Could not retrieve TLS certificate from ${SANDBOX_DOMAIN}:443"
    return
  fi

  # Check domain in subject
  if echo "${cert_info}" | grep -qi "${SANDBOX_DOMAIN}"; then
    pass "Certificate subject contains ${SANDBOX_DOMAIN}"
  else
    fail "Certificate subject does NOT contain ${SANDBOX_DOMAIN}"
    info "${cert_info}"
  fi

  # Check issuer
  if echo "${cert_info}" | grep -qi "Let's Encrypt\|R3\|R10\|R11\|E1\|E2"; then
    pass "Certificate issued by Let's Encrypt"
  else
    warn "Certificate issuer is not Let's Encrypt — check if self-signed or from a different CA"
    info "Issuer: $(echo "${cert_info}" | grep issuer)"
  fi

  # Check expiry (must be >60 days away)
  local not_after
  not_after="$(echo "${cert_info}" | grep "notAfter" | sed 's/notAfter=//')"
  if [[ -n "${not_after}" ]]; then
    local expiry_epoch
    expiry_epoch="$(date -d "${not_after}" +%s 2>/dev/null || date -j -f "%b %e %T %Y %Z" "${not_after}" +%s 2>/dev/null || echo "0")"
    local now_epoch
    now_epoch="$(date +%s)"
    local days_remaining=$(( (expiry_epoch - now_epoch) / 86400 ))

    if [[ ${days_remaining} -gt 60 ]]; then
      pass "Certificate valid for ${days_remaining} more days (expires: ${not_after})"
    elif [[ ${days_remaining} -gt 0 ]]; then
      warn "Certificate expires in ${days_remaining} days — renew soon (${not_after})"
    else
      fail "Certificate has EXPIRED (${not_after})"
    fi
  fi
}

# ---------------------------------------------------------------------------
# Test 3 — API key authentication
# ---------------------------------------------------------------------------

test_api_key_auth() {
  echo ""
  echo "Test 3: API key authentication"

  # No key — should get 401
  local no_key_code
  no_key_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    "${BASE_URL}/api/v1/sandboxes" 2>/dev/null || echo "000")"

  if [[ "${no_key_code}" == "401" ]]; then
    pass "Request without X-API-Key returns 401"
  else
    fail "Request without X-API-Key returned ${no_key_code} (expected 401)"
  fi

  # Wrong key — should get 401
  local wrong_key_code
  wrong_key_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "X-API-Key: wrong-key-12345" \
    "${BASE_URL}/api/v1/sandboxes" 2>/dev/null || echo "000")"

  if [[ "${wrong_key_code}" == "401" ]]; then
    pass "Request with wrong X-API-Key returns 401"
  else
    fail "Request with wrong X-API-Key returned ${wrong_key_code} (expected 401)"
  fi

  # Correct key — should get 200 or 405 (not 401 or 000)
  local auth_code
  auth_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "X-API-Key: ${OPENSANDBOX_API_KEY}" \
    "${BASE_URL}/api/v1/sandboxes" 2>/dev/null || echo "000")"

  if [[ "${auth_code}" =~ ^(200|404|405)$ ]]; then
    pass "Request with valid X-API-Key forwarded to OpenSandbox (HTTP ${auth_code})"
  elif [[ "${auth_code}" == "000" ]]; then
    fail "Request with valid X-API-Key got no response (connection error)"
  else
    fail "Request with valid X-API-Key returned unexpected HTTP ${auth_code}"
  fi
}

# ---------------------------------------------------------------------------
# Test 4 — Sandbox creation round-trip
# ---------------------------------------------------------------------------

test_sandbox_creation() {
  echo ""
  echo "Test 4: Sandbox creation round-trip"

  if [[ "${SKIP_SANDBOX_CREATE}" == "true" ]]; then
    warn "SKIP_SANDBOX_CREATE=true — skipping sandbox creation test"
    return
  fi

  # Create sandbox
  local create_response create_time sandbox_id
  create_response="$(curl -sf -w "\nHTTP_CODE:%{http_code}\nTIME_TOTAL:%{time_total}" \
    --max-time 30 \
    -X POST "${BASE_URL}/api/v1/sandboxes" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${OPENSANDBOX_API_KEY}" \
    -d '{"image":"python:3.11-slim","timeout":60}' 2>/dev/null || echo "FAILED")"

  if [[ "${create_response}" == "FAILED" ]]; then
    fail "Sandbox creation request failed (network error)"
    return
  fi

  local http_code
  http_code="$(echo "${create_response}" | grep 'HTTP_CODE:' | cut -d: -f2)"
  create_time="$(echo "${create_response}" | grep 'TIME_TOTAL:' | cut -d: -f2)"

  if [[ "${http_code}" =~ ^(200|201)$ ]]; then
    pass "Sandbox created (HTTP ${http_code}, ${create_time}s API response time)"
  else
    fail "Sandbox creation returned HTTP ${http_code} (expected 200 or 201)"
    info "Response: ${create_response}"
    return
  fi

  # Extract sandbox ID
  local body
  body="$(echo "${create_response}" | grep -v 'HTTP_CODE:\|TIME_TOTAL:')"
  sandbox_id="$(echo "${body}" | jq -r '.id // .sandbox_id // empty' 2>/dev/null || echo "")"

  if [[ -z "${sandbox_id}" ]]; then
    warn "Could not extract sandbox ID from response — skipping cleanup"
    return
  fi

  info "Sandbox ID: ${sandbox_id}"

  # Destroy sandbox (cleanup)
  local destroy_code
  destroy_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 15 \
    -X DELETE "${BASE_URL}/api/v1/sandboxes/${sandbox_id}" \
    -H "X-API-Key: ${OPENSANDBOX_API_KEY}" 2>/dev/null || echo "000")"

  if [[ "${destroy_code}" =~ ^(200|204)$ ]]; then
    pass "Sandbox destroyed (HTTP ${destroy_code})"
  else
    warn "Sandbox destroy returned HTTP ${destroy_code} (sandbox ${sandbox_id} may need manual cleanup)"
  fi
}

# ---------------------------------------------------------------------------
# Test 5 — Latency measurement (10 sequential health checks)
# ---------------------------------------------------------------------------

test_latency() {
  echo ""
  echo "Test 5: Latency measurement (10 sequential /health requests)"

  local times=()
  local i
  for i in $(seq 1 10); do
    local t
    t="$(curl -sf -o /dev/null -w "%{time_total}" --max-time 10 \
      "${BASE_URL}/health" 2>/dev/null || echo "9.999")"
    times+=("${t}")
  done

  # Calculate median from sorted array
  local sorted_times
  sorted_times="$(printf '%s\n' "${times[@]}" | sort -n)"
  local median
  median="$(echo "${sorted_times}" | awk 'NR==5{print}')"
  local max
  max="$(echo "${sorted_times}" | tail -1)"

  info "Latency results: ${times[*]}"
  info "Median: ${median}s | Max: ${max}s"

  # Convert to ms for comparison
  local median_ms
  median_ms="$(echo "${median} * 1000" | awk '{printf "%d", $1}')"

  if [[ ${median_ms} -lt 10 ]]; then
    pass "Median latency ${median}s (${median_ms}ms) — under 10ms target"
  elif [[ ${median_ms} -lt 50 ]]; then
    warn "Median latency ${median}s (${median_ms}ms) — above 10ms target but acceptable"
  else
    fail "Median latency ${median}s (${median_ms}ms) — significantly above 10ms target"
    info "Check DNS caching, TLS session resumption, and HTTP keepalive settings"
  fi
}

# ---------------------------------------------------------------------------
# Test 6 — HTTP redirect (port 80 → 443)
# ---------------------------------------------------------------------------

test_http_redirect() {
  echo ""
  echo "Test 6: HTTP to HTTPS redirect"

  local redirect_code
  redirect_code="$(curl -sf -o /dev/null -w "%{http_code}" --max-time 10 \
    -I "http://${SANDBOX_DOMAIN}/health" 2>/dev/null || echo "000")"

  if [[ "${redirect_code}" == "301" ]]; then
    pass "HTTP → HTTPS redirect returns 301"
  elif [[ "${redirect_code}" == "302" ]]; then
    pass "HTTP → HTTPS redirect returns 302"
  else
    fail "HTTP redirect returned ${redirect_code} (expected 301 or 302)"
  fi
}

# ---------------------------------------------------------------------------
# Summary report
# ---------------------------------------------------------------------------

print_summary() {
  echo ""
  echo "================================================================"
  echo "  Verification Summary"
  echo "================================================================"
  echo ""
  echo -e "  ${GREEN}PASS: ${PASS_COUNT}${NC}"
  echo -e "  ${YELLOW}WARN: ${WARN_COUNT}${NC}"
  echo -e "  ${RED}FAIL: ${FAIL_COUNT}${NC}"
  echo ""

  if [[ ${FAIL_COUNT} -eq 0 ]]; then
    echo -e "  ${GREEN}All critical checks PASSED.${NC}"
    echo -e "  OpenSandbox is reachable at ${BASE_URL}"
  else
    echo -e "  ${RED}${FAIL_COUNT} check(s) FAILED.${NC}"
    echo "  Review the failures above and check:"
    echo "    - systemctl status opensandbox nginx"
    echo "    - docker ps | grep opensandbox"
    echo "    - journalctl -u opensandbox -n 50"
    echo "    - ufw status verbose"
  fi
  echo "================================================================"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

main() {
  preflight
  test_https_health
  test_tls_certificate
  test_api_key_auth
  test_sandbox_creation
  test_latency
  test_http_redirect
  print_summary

  [[ ${FAIL_COUNT} -eq 0 ]] && exit 0 || exit 1
}

main "$@"
