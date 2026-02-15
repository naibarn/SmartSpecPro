#!/bin/bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"

# Validate BASE_URL format
if [[ ! "$BASE_URL" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "Error: Invalid BASE_URL format: $BASE_URL"
  exit 1
fi

echo "Running smoke test (1 VU, 1 iteration) against $BASE_URL..."

k6 run --vus 1 --iterations 1 \
  --env BASE_URL="$BASE_URL" \
  scenario-1-api-load.js

echo ""
echo "Smoke test passed. Full load tests are ready to run."
