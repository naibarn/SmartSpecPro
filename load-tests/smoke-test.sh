#!/bin/bash
set -e

BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"

echo "Running smoke test (1 VU, 1 iteration) against $BASE_URL..."

k6 run --vus 1 --iterations 1 \
  --env BASE_URL="$BASE_URL" \
  scenario-1-api-load.js

echo ""
echo "Smoke test passed. Full load tests are ready to run."
