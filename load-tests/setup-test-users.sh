#!/bin/bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://app-staging.smartaihub.app}"
USER_COUNT="${USER_COUNT:-100}"
OUTPUT_FILE="test-users.json"
PASSWORD="${LOAD_TEST_PASSWORD:-$(openssl rand -base64 16)}"

# Validate BASE_URL format
if [[ ! "$BASE_URL" =~ ^https?://[a-zA-Z0-9.-]+(:[0-9]+)?$ ]]; then
  echo "Error: Invalid BASE_URL format: $BASE_URL"
  exit 1
fi

echo "Creating $USER_COUNT test users against $BASE_URL..."
echo "Using password from LOAD_TEST_PASSWORD env var (set it for reproducible runs)"

# Create temp file for JSONL
TEMP_JSONL=$(mktemp)
chmod 600 "$TEMP_JSONL"
trap 'rm -f "$TEMP_JSONL"' EXIT

CREATED=0
FAILED=0

for i in $(seq 1 "$USER_COUNT"); do
  EMAIL="loadtest-user-$i@example.com"

  # Create user via tRPC register mutation
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$BASE_URL/trpc/register" \
    -H "Content-Type: application/json" \
    -H "Origin: $BASE_URL" \
    -d "{\"json\":{\"name\":\"Load Test User $i\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"plan\":\"free\"}}")

  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "409" ]; then
    # 409 = user already exists, still usable for login
    echo "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >> "$TEMP_JSONL"
    CREATED=$((CREATED + 1))
  else
    echo "Warning: Failed to create user $EMAIL (HTTP $HTTP_CODE)"
    # Still add to test file - user may already exist from previous run
    echo "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}" >> "$TEMP_JSONL"
    FAILED=$((FAILED + 1))
  fi

  # Progress indicator every 10 users
  if [ $((i % 10)) -eq 0 ]; then
    echo "  Progress: $i/$USER_COUNT users processed"
  fi

  # Rate limit: max 3 signups/min per IP, add delay every 3rd user
  if [ $((i % 3)) -eq 0 ]; then
    sleep 1
  fi
done

# Convert JSONL to JSON array
if command -v jq &> /dev/null; then
  jq -s '.' "$TEMP_JSONL" > "$OUTPUT_FILE"
else
  # Fallback without jq
  echo "[" > "$OUTPUT_FILE"
  head -n -1 "$TEMP_JSONL" | while IFS= read -r line; do
    echo "  $line," >> "$OUTPUT_FILE"
  done
  tail -n 1 "$TEMP_JSONL" | while IFS= read -r line; do
    echo "  $line" >> "$OUTPUT_FILE"
  done
  echo "]" >> "$OUTPUT_FILE"
fi

echo ""
echo "Test user setup complete:"
echo "  Created/found: $CREATED"
echo "  Failed: $FAILED"
echo "  Output: $OUTPUT_FILE"
