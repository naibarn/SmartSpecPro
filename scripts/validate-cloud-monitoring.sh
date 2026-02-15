#!/bin/bash
# Validates Cloud Monitoring dashboards and alerts exist
# Usage: ./scripts/validate-cloud-monitoring.sh
# Exit code: 0 if all checks pass, 1 if any are missing

set -euo pipefail

ERRORS=0

echo "=== Cloud Monitoring Validation ==="
echo ""

# Check dashboards
echo "--- Dashboards ---"
SERVICES_DASH=$(gcloud monitoring dashboards list --filter="displayName:SmartSpec Services" --format="value(name)" 2>/dev/null || echo "")
JOBS_DASH=$(gcloud monitoring dashboards list --filter="displayName:SmartSpec Jobs" --format="value(name)" 2>/dev/null || echo "")

if [ -n "$SERVICES_DASH" ]; then
  echo "OK: SmartSpec Services dashboard found"
else
  echo "MISSING: SmartSpec Services dashboard"
  ERRORS=$((ERRORS + 1))
fi

if [ -n "$JOBS_DASH" ]; then
  echo "OK: SmartSpec Jobs dashboard found"
else
  echo "MISSING: SmartSpec Jobs dashboard"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Check alert policies
echo "--- Alert Policies ---"
POLICY_COUNT=$(gcloud alpha monitoring policies list --filter="displayName~'SmartSpec'" --format="value(name)" 2>/dev/null | wc -l || echo "0")
echo "Found $POLICY_COUNT SmartSpec alert policies"
if [ "$POLICY_COUNT" -lt 5 ]; then
  echo "WARNING: Expected at least 5 alert policies"
  ERRORS=$((ERRORS + 1))
fi

echo ""

# Check notification channels
echo "--- Notification Channels ---"
gcloud alpha monitoring channels list --filter="type:email" --format="table(displayName, labels.email_address)" 2>/dev/null || echo "No email channels found (or gcloud alpha not available)"

echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo "=== Validation FAILED ($ERRORS issues) ==="
  exit 1
else
  echo "=== Validation PASSED ==="
  exit 0
fi
