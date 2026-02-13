#!/bin/bash
# Pre-Deployment Checklist for SSP-SHAREFILE-009
# Custom Groups & Permission-based File Sharing
#
# Usage: ./apps/web/scripts/pre-deployment-checklist.sh
# Requires: DATABASE_URL, JWT_SECRET environment variables

set -e

echo "========================================="
echo "SSP-SHAREFILE-009 Pre-Deployment Checklist"
echo "========================================="

PASS=0
FAIL=0

check_pass() {
  echo "  ✓ $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo "  ✗ $1"
  FAIL=$((FAIL + 1))
}

# 1. TypeScript Type Check
echo ""
echo "[1/6] TypeScript Type Check..."
cd "$(dirname "$0")/../../.."
if cd apps/web && npx tsc --noEmit 2>/dev/null; then
  check_pass "TypeScript compiles without errors"
else
  check_fail "TypeScript has type errors"
fi
cd "$(dirname "$0")/../../.."

# 2. Unit Tests — Security Tests
echo ""
echo "[2/6] Running Security Tests..."
if cd apps/web && JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/securityShareFile.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  check_pass "Security tests pass"
else
  check_fail "Security tests failed"
fi
cd "$(dirname "$0")/../../.."

# 3. Unit Tests — Groups Service
echo ""
echo "[3/6] Running Groups Service Tests..."
if cd apps/web && JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/groupsService.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  check_pass "Groups service tests pass"
else
  check_fail "Groups service tests failed"
fi
cd "$(dirname "$0")/../../.."

# 4. Unit Tests — Library Service
echo ""
echo "[4/6] Running Library Service Tests..."
if cd apps/web && JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run server/services/libraryService.test.ts server/services/libraryDocumentManagementService.test.ts server/services/librarySearchService.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  check_pass "Library service tests pass"
else
  check_fail "Library service tests failed"
fi
cd "$(dirname "$0")/../../.."

# 5. Unit Tests — Trash Panel
echo ""
echo "[5/6] Running Trash Panel Tests..."
if cd apps/web && JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 npx vitest run client/src/components/library/TrashPanel.test.ts --reporter=dot 2>&1 | grep -q "passed"; then
  check_pass "Trash panel tests pass"
else
  check_fail "Trash panel tests failed"
fi
cd "$(dirname "$0")/../../.."

# 6. Redis Connectivity (if available)
echo ""
echo "[6/6] Redis Connectivity..."
if command -v redis-cli &>/dev/null && redis-cli PING 2>/dev/null | grep -q "PONG"; then
  check_pass "Redis connected"
else
  echo "  ⚠ Redis not available (optional for dev)"
fi

# Summary
echo ""
echo "========================================="
echo "Results: $PASS passed, $FAIL failed"
echo "========================================="

if [ "$FAIL" -gt 0 ]; then
  echo "✗ Pre-deployment checks FAILED"
  exit 1
else
  echo "✓ All pre-deployment checks passed!"
  exit 0
fi
