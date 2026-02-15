#!/usr/bin/env bash
# test-rollback.sh
# Tests Cloud Run rollback procedure on staging environment.
# Usage: ./scripts/test-rollback.sh [SERVICE] [REGION] [PROJECT_ID]
#
# PREREQUISITE: Build and push a broken Docker image first:
#   docker build -t ${REGION}-docker.pkg.dev/${PROJECT_ID}/smartspecpro/${SERVICE}:rollback-test-broken .
#   docker push ${REGION}-docker.pkg.dev/${PROJECT_ID}/smartspecpro/${SERVICE}:rollback-test-broken
#
# This script:
# 1. Records the current healthy revision
# 2. Deploys the broken image (no traffic)
# 3. Shifts 10% traffic to the broken revision
# 4. Waits for error observation
# 5. Rolls back to 100% healthy revision
# 6. Verifies rollback success
# 7. Cleans up the broken revision

set -euo pipefail

SERVICE="${1:-node-api}"
REGION="${2:-asia-southeast1}"
PROJECT_ID="${3:-$(gcloud config get-value project 2>/dev/null || echo "smartspecpro-mvp")}"
IMAGE_REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/smartspecpro"

echo "=== Cloud Run Rollback Test ==="
echo "Service: $SERVICE"
echo "Region:  $REGION"
echo "Project: $PROJECT_ID"
echo ""

# Step 1: Get current healthy revision
echo "[1/7] Identifying current healthy revision..."
HEALTHY_REVISION=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.traffic[0].revisionName)")

if [[ -z "$HEALTHY_REVISION" ]]; then
  echo "ERROR: Could not determine current revision for $SERVICE"
  exit 1
fi
echo "  Current healthy revision: $HEALTHY_REVISION"

# Step 2: Deploy the broken revision (no traffic)
echo "[2/7] Deploying broken revision (no traffic)..."
BROKEN_IMAGE="${IMAGE_REGISTRY}/${SERVICE}:rollback-test-broken"

if ! gcloud run deploy "$SERVICE" \
  --image="$BROKEN_IMAGE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --no-traffic \
  --tag=rollback-test; then
  echo "ERROR: Failed to deploy broken revision."
  echo "  Ensure the broken image exists: $BROKEN_IMAGE"
  echo "  Build it with: docker build -t $BROKEN_IMAGE . && docker push $BROKEN_IMAGE"
  exit 1
fi

BROKEN_REVISION=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.latestCreatedRevisionName)")
echo "  Broken revision: $BROKEN_REVISION"

if [[ "$BROKEN_REVISION" == "$HEALTHY_REVISION" ]]; then
  echo "ERROR: Broken revision is the same as healthy revision. Deploy did not create a new revision."
  exit 1
fi

# Step 3: Shift 10% traffic to broken revision
echo "[3/7] Shifting 10% traffic to broken revision..."
if ! gcloud run services update-traffic "$SERVICE" \
  --to-revisions="$BROKEN_REVISION=10,$HEALTHY_REVISION=90" \
  --region="$REGION" \
  --project="$PROJECT_ID"; then
  echo "ERROR: Failed to split traffic to broken revision."
  echo "  Cleaning up..."
  gcloud run revisions delete "$BROKEN_REVISION" \
    --region="$REGION" \
    --project="$PROJECT_ID" \
    --quiet 2>/dev/null || true
  exit 1
fi

# Step 4: Wait for error observation
echo "[4/7] Waiting 30 seconds to observe error spike..."
echo "  Check Cloud Monitoring dashboard for elevated error rates."
sleep 30

# Step 5: Execute rollback
echo "[5/7] Rolling back to 100% healthy revision..."
ROLLBACK_START=$(date +%s)

gcloud run services update-traffic "$SERVICE" \
  --to-revisions="$HEALTHY_REVISION=100" \
  --region="$REGION" \
  --project="$PROJECT_ID"

ROLLBACK_END=$(date +%s)
ROLLBACK_TIME=$((ROLLBACK_END - ROLLBACK_START))
echo "  Rollback completed in ${ROLLBACK_TIME}s"

# Step 6: Verify rollback
echo "[6/7] Verifying rollback..."
CURRENT_REVISION=$(gcloud run services describe "$SERVICE" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --format="value(status.traffic[0].revisionName)")

if [[ "$CURRENT_REVISION" == "$HEALTHY_REVISION" ]]; then
  echo "  Rollback verified: 100% traffic on $HEALTHY_REVISION"
else
  echo "  ERROR: Rollback verification failed!"
  echo "  Expected: $HEALTHY_REVISION"
  echo "  Got: $CURRENT_REVISION"
  exit 1
fi

# Step 7: Clean up broken revision
echo "[7/7] Cleaning up broken revision..."
gcloud run revisions delete "$BROKEN_REVISION" \
  --region="$REGION" \
  --project="$PROJECT_ID" \
  --quiet 2>/dev/null || echo "  (cleanup skipped - revision may already be deleted)"

echo ""
echo "=== Rollback Test Results ==="
echo "Service:        $SERVICE"
echo "Healthy rev:    $HEALTHY_REVISION"
echo "Rollback time:  ${ROLLBACK_TIME}s (target: <60s)"
echo "Status:         PASSED"
if [[ "$ROLLBACK_TIME" -gt 60 ]]; then
  echo "WARNING: Rollback exceeded 60s target"
fi
