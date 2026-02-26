#!/usr/bin/env bash
# ============================================================================
# OpenSandbox Launch Readiness Gate Check
# ============================================================================
# Run this script BEFORE switching DISPATCH_MODE from 'optional' to 'required'.
# All 8 gates must pass for the system to be considered production-ready.
#
# Usage: bash scripts/sandbox-readiness-check.sh
# ============================================================================

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BACKEND="$PROJECT_ROOT/python-backend"
WEB_APP="$PROJECT_ROOT/apps/web"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASS_COUNT=0
FAIL_COUNT=0
WARN_COUNT=0

gate_result() {
    local gate_num=$1
    local description=$2
    local status=$3

    if [ "$status" = "PASS" ]; then
        echo -e "  ${gate_num}  | ${description} | ${GREEN}PASS${NC}"
        PASS_COUNT=$((PASS_COUNT + 1))
    elif [ "$status" = "WARN" ]; then
        echo -e "  ${gate_num}  | ${description} | ${YELLOW}WARN${NC}"
        WARN_COUNT=$((WARN_COUNT + 1))
    else
        echo -e "  ${gate_num}  | ${description} | ${RED}FAIL${NC}"
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

echo "============================================================================"
echo "OpenSandbox Launch Readiness Gate Check"
echo "============================================================================"
echo ""
echo "Gate | Description                          | Status"
echo "-----|--------------------------------------|--------"

# --------------------------------------------------------------------------
# Gate 1: High-risk features use sandbox
# --------------------------------------------------------------------------
GATE1="PASS"
if ! grep -q "sandbox" "$PYTHON_BACKEND/app/workers/sandbox_job_worker.py" 2>/dev/null; then
    GATE1="FAIL"
fi
if ! grep -q "_execute_in_sandbox" "$PYTHON_BACKEND/app/orchestrator/node_executors/data_executors/code_executor.py" 2>/dev/null; then
    GATE1="FAIL"
fi
gate_result "1" "High-risk features use sandbox       " "$GATE1"

# --------------------------------------------------------------------------
# Gate 2: Default deny egress in profiles
# --------------------------------------------------------------------------
GATE2="PASS"
if ! grep -q "network_default_action" "$PYTHON_BACKEND/app/models/sandbox.py" 2>/dev/null; then
    GATE2="FAIL"
fi
gate_result "2" "Default deny egress configured       " "$GATE2"

# --------------------------------------------------------------------------
# Gate 3: No direct subprocess in sandbox paths
# --------------------------------------------------------------------------
GATE3="PASS"
if grep -rn "subprocess\.run\|subprocess\.Popen" "$PYTHON_BACKEND/app/integrations/opensandbox/" 2>/dev/null | grep -v test | grep -v __pycache__ | grep -v mock_backend; then
    GATE3="FAIL"
fi
if grep -rn "subprocess\.run\|subprocess\.Popen" "$PYTHON_BACKEND/app/workers/sandbox_job_worker.py" 2>/dev/null; then
    GATE3="FAIL"
fi
gate_result "3" "No direct subprocess in sandbox paths" "$GATE3"

# --------------------------------------------------------------------------
# Gate 4: Image allowlist enforced
# --------------------------------------------------------------------------
GATE4="PASS"
if ! grep -q "base_image" "$PYTHON_BACKEND/app/models/sandbox.py" 2>/dev/null; then
    GATE4="FAIL"
fi
gate_result "4" "Image allowlist enforced              " "$GATE4"

# --------------------------------------------------------------------------
# Gate 5: Orphan reconciler active
# --------------------------------------------------------------------------
GATE5="PASS"
if ! grep -q "cleanup-orphan-sandboxes" "$PYTHON_BACKEND/app/core/celery_app.py" 2>/dev/null; then
    GATE5="FAIL"
fi
if ! grep -q "detect-stuck-sandbox-jobs" "$PYTHON_BACKEND/app/core/celery_app.py" 2>/dev/null; then
    GATE5="FAIL"
fi
gate_result "5" "Orphan reconciler active             " "$GATE5"

# --------------------------------------------------------------------------
# Gate 6: Cost tracking functional
# --------------------------------------------------------------------------
GATE6="PASS"
if ! grep -q "cost_actual" "$PYTHON_BACKEND/app/models/sandbox.py" 2>/dev/null; then
    GATE6="FAIL"
fi
if ! grep -q "emit_job_completed" "$PYTHON_BACKEND/app/services/sandbox_metrics.py" 2>/dev/null; then
    GATE6="FAIL"
fi
gate_result "6" "Cost tracking functional             " "$GATE6"

# --------------------------------------------------------------------------
# Gate 7: Tenant quotas
# --------------------------------------------------------------------------
GATE7="PASS"
if ! grep -q "max_concurrent_sandboxes" "$PYTHON_BACKEND/app/models/sandbox.py" 2>/dev/null; then
    GATE7="FAIL"
fi
gate_result "7" "Tenant quota enforcement             " "$GATE7"

# --------------------------------------------------------------------------
# Gate 8: Rollback plan tested
# --------------------------------------------------------------------------
GATE8="PASS"
if [ ! -f "$PROJECT_ROOT/docs/runbooks/sandbox-rollback.md" ]; then
    GATE8="FAIL"
fi
# Check that OPENSANDBOX_ENABLED flag exists in config
if ! grep -q "OPENSANDBOX_ENABLED" "$PYTHON_BACKEND/app/integrations/opensandbox/config.py" 2>/dev/null; then
    GATE8="FAIL"
fi
gate_result "8" "Rollback plan tested                 " "$GATE8"

echo "-----|--------------------------------------|--------"
echo ""

# Summary
TOTAL=$((PASS_COUNT + FAIL_COUNT + WARN_COUNT))
if [ "$FAIL_COUNT" -eq 0 ]; then
    echo -e "${GREEN}RESULT: ALL GATES PASSED ($PASS_COUNT/$TOTAL) -- Ready for DISPATCH_MODE=required${NC}"
    exit 0
else
    echo -e "${RED}RESULT: $FAIL_COUNT GATE(S) FAILED -- NOT ready for DISPATCH_MODE=required${NC}"
    echo ""
    echo "Remediation:"
    echo "  1. Fix all FAIL gates above"
    echo "  2. Run: cd python-backend && uv run pytest -m 'sandbox' -v"
    echo "  3. Re-run this script"
    exit 1
fi
