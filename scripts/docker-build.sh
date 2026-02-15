#!/usr/bin/env bash
# Build all Docker images for Cloud Run deployment.
# Usage: ./scripts/docker-build.sh [--push] [--tag TAG]
#
# Options:
#   --push    Push to Artifact Registry after building
#   --tag     Image tag (default: latest)

set -euo pipefail

# Default values
TAG="${TAG:-latest}"
REGISTRY="${GCP_ARTIFACT_REGISTRY:-}"
PUSH=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --push)
      PUSH=true
      shift
      ;;
    --tag)
      TAG="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--push] [--tag TAG]"
      exit 1
      ;;
  esac
done

echo "=== Building Docker images for Cloud Run ==="
echo "Tag: $TAG"
echo "Push: $PUSH"
if [ -n "$REGISTRY" ]; then
  echo "Registry: $REGISTRY"
fi
echo ""

# Build node-api
echo "Building node-api..."
docker build \
  -f docker/Dockerfile.node-api \
  --target runner \
  -t "node-api:${TAG}" \
  .
echo "✓ node-api built successfully"
echo ""

# Build python-orchestrator
echo "Building python-orchestrator..."
docker build \
  -f docker/Dockerfile.python-orchestrator \
  -t "python-orchestrator:${TAG}" \
  .
echo "✓ python-orchestrator built successfully"
echo ""

# Build video-job-runner (depends on python-orchestrator)
echo "Building video-job-runner..."
docker build \
  -f docker/Dockerfile.video-job-runner \
  -t "video-job-runner:${TAG}" \
  .
echo "✓ video-job-runner built successfully"
echo ""

# Display image sizes
echo "=== Image Sizes ==="
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "REPOSITORY|node-api|python-orchestrator|video-job-runner"
echo ""

# Optionally push to Artifact Registry
if [ "$PUSH" = true ]; then
  if [ -z "$REGISTRY" ]; then
    echo "ERROR: GCP_ARTIFACT_REGISTRY environment variable not set"
    echo "Set it to your Artifact Registry path (e.g., asia-southeast1-docker.pkg.dev/PROJECT_ID/smartspec)"
    exit 1
  fi

  echo "=== Pushing images to $REGISTRY ==="
  for img in node-api python-orchestrator video-job-runner; do
    echo "Tagging and pushing ${img}:${TAG}..."
    docker tag "${img}:${TAG}" "${REGISTRY}/${img}:${TAG}"
    docker push "${REGISTRY}/${img}:${TAG}"
    echo "✓ ${img}:${TAG} pushed"
  done
  echo ""
  echo "✅ All images built and pushed successfully!"
else
  echo "✅ All images built successfully!"
  echo ""
  echo "To push to Artifact Registry, run:"
  echo "  GCP_ARTIFACT_REGISTRY=<your-registry> $0 --push --tag ${TAG}"
fi
