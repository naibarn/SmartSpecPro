#!/bin/bash
# Smoke tests for canary validation during CI/CD deployments.
# Usage: ./scripts/smoke-test.sh <target-url>

set -e

TARGET_URL="$1"
if [ -z "$TARGET_URL" ]; then
  echo "Usage: $0 <target-url>"
  exit 1
fi

echo "Running smoke tests against: $TARGET_URL"

# Test 1: Health check
echo "Test 1: Health check"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/healthz")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL Health check failed (HTTP $HTTP_CODE)"
  exit 1
fi
echo "PASS Health check passed"

# Test 2: Ready check (DB + Redis)
echo "Test 2: Ready check"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/readyz")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL Ready check failed (HTTP $HTTP_CODE)"
  exit 1
fi
echo "PASS Ready check passed"

# Test 3: Login endpoint responds (expects 401 or 400 for invalid creds)
echo "Test 3: Login endpoint availability"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST "${TARGET_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"invalid"}')
if [ "$HTTP_CODE" != "401" ] && [ "$HTTP_CODE" != "400" ]; then
  echo "FAIL Login endpoint unexpected response (HTTP $HTTP_CODE)"
  exit 1
fi
echo "PASS Login endpoint available"

# Test 4: Static assets served
echo "Test 4: Static assets"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${TARGET_URL}/")
if [ "$HTTP_CODE" != "200" ]; then
  echo "FAIL Static assets not served (HTTP $HTTP_CODE)"
  exit 1
fi
echo "PASS Static assets served"

echo ""
echo "All smoke tests passed!"
