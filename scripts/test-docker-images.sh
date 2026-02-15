#!/usr/bin/env bash
# Validates Docker images build correctly and meet Cloud Run requirements.
# Run from repository root: ./scripts/test-docker-images.sh

set -euo pipefail

PASS=0
FAIL=0

assert_eq() {
  # $1 = actual value, $2 = expected value, $3 = description
  local actual="$1"
  local expected="$2"
  local desc="$3"

  if [[ "$actual" == "$expected" ]]; then
    echo "✓ $desc"
    ((PASS++))
  else
    echo "✗ $desc (expected: $expected, got: $actual)"
    ((FAIL++))
  fi
}

echo "=== Testing Docker Images ==="
echo ""

# --- node-api image ---
echo "=== Testing node-api image ==="

# Test: Dockerfile builds successfully with production target
if docker build -f docker/Dockerfile.node-api --target runner -t node-api:test . >/dev/null 2>&1; then
  assert_eq "0" "0" "node-api builds successfully"
else
  assert_eq "1" "0" "node-api builds successfully"
fi

# Test: Built image starts and responds to GET /healthz with 200
# (Skipped - requires running container with full environment)

# Test: Static assets are served from /assets/
# (Skipped - requires running container)

echo ""

# --- python-orchestrator image ---
echo "=== Testing python-orchestrator image ==="

# Test: Dockerfile builds successfully
if docker build -f docker/Dockerfile.python-orchestrator -t python-orchestrator:test . >/dev/null 2>&1; then
  assert_eq "0" "0" "python-orchestrator builds successfully"
else
  assert_eq "1" "0" "python-orchestrator builds successfully"
fi

# Test: Built image starts and responds to GET /health with 200
# (Skipped - requires running container with full environment)

echo ""

# --- video-job-runner image ---
echo "=== Testing video-job-runner image ==="

# Test: Dockerfile builds successfully
if docker build -f docker/Dockerfile.video-job-runner -t video-job-runner:test . >/dev/null 2>&1; then
  assert_eq "0" "0" "video-job-runner builds successfully"
else
  assert_eq "1" "0" "video-job-runner builds successfully"
fi

# Test: FFmpeg is available at expected version
if docker run --rm video-job-runner:test ffmpeg -version 2>/dev/null | grep -q "ffmpeg version 7"; then
  assert_eq "0" "0" "FFmpeg 7.x is installed"
else
  assert_eq "1" "0" "FFmpeg 7.x is installed"
fi

# Test: Fonts are installed and discoverable via fc-list
if docker run --rm video-job-runner:test fc-list 2>/dev/null | grep -qi "dejavu"; then
  assert_eq "0" "0" "DejaVu fonts are installed"
else
  assert_eq "1" "0" "DejaVu fonts are installed"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -eq 0 ]]; then
  echo "✅ All Docker image tests passed!"
  exit 0
else
  echo "❌ Some Docker image tests failed."
  exit 1
fi
