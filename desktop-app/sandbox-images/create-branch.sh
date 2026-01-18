#!/bin/bash
# SmartSpec Sandbox - Create Branch Script
#
# Creates a new Git branch with its own Docker container
# for parallel development
#
# Usage:
#   ./create-branch.sh <workspace-name> <branch-name> [from-branch] [image]
#
# Examples:
#   ./create-branch.sh my-project feature/auth
#   ./create-branch.sh my-project feature/api develop
#   ./create-branch.sh my-project feature/ml develop python

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================
# Parse Arguments
# ============================================
WORKSPACE_NAME="$1"
BRANCH_NAME="$2"
FROM_BRANCH="${3:-main}"
IMAGE_TYPE="$4"

if [ -z "$WORKSPACE_NAME" ] || [ -z "$BRANCH_NAME" ]; then
    log_error "Usage: $0 <workspace-name> <branch-name> [from-branch] [image-type]"
    echo ""
    echo "Image types: nodejs, python, golang, rust, fullstack"
    exit 1
fi

# ============================================
# Setup Paths
# ============================================
SMARTSPEC_HOME="${HOME}/SmartSpec"
WORKSPACE_PATH="${SMARTSPEC_HOME}/workspaces/${WORKSPACE_NAME}"
PROJECT_PATH="${WORKSPACE_PATH}/project"

if [ ! -d "$WORKSPACE_PATH" ]; then
    log_error "Workspace '${WORKSPACE_NAME}' not found at ${WORKSPACE_PATH}"
    exit 1
fi

# Sanitize branch name for container naming
SAFE_BRANCH_NAME=$(echo "$BRANCH_NAME" | sed 's/[\/]/-/g' | sed 's/[^a-zA-Z0-9-]//g')

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       SmartSpec Sandbox - Create Branch                  ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

log_info "Workspace: ${WORKSPACE_NAME}"
log_info "New Branch: ${BRANCH_NAME}"
log_info "From Branch: ${FROM_BRANCH}"

# ============================================
# Get Image Type from Workspace Config
# ============================================
if [ -z "$IMAGE_TYPE" ]; then
    if [ -f "${WORKSPACE_PATH}/.workspace/config.json" ]; then
        IMAGE_TYPE=$(grep -o '"image": "[^"]*"' "${WORKSPACE_PATH}/.workspace/config.json" | head -1 | sed 's/.*sandbox-\([^:]*\).*/\1/')
    fi
    IMAGE_TYPE="${IMAGE_TYPE:-nodejs}"
fi

log_info "Image: smartspec/sandbox-${IMAGE_TYPE}:latest"

# ============================================
# Create Git Branch
# ============================================
log_info "Creating Git branch..."

cd "$PROJECT_PATH"

# Check if branch already exists
if git show-ref --verify --quiet "refs/heads/${BRANCH_NAME}"; then
    log_error "Branch '${BRANCH_NAME}' already exists"
    exit 1
fi

# Checkout source branch and create new branch
git checkout "$FROM_BRANCH"
git checkout -b "$BRANCH_NAME"

log_success "Created branch: ${BRANCH_NAME}"

# ============================================
# Allocate Ports
# ============================================
log_info "Allocating ports..."

# Simple port allocation based on hash of branch name
HASH=$(echo -n "$WORKSPACE_NAME-$BRANCH_NAME" | md5sum | cut -c1-4)
PORT_OFFSET=$((16#$HASH % 100))

WEB_PORT=$((3000 + PORT_OFFSET))
API_PORT=$((8000 + PORT_OFFSET))
DEBUG_PORT=$((9200 + PORT_OFFSET))

# Check if ports are available
check_port() {
    if lsof -i:$1 &> /dev/null || docker ps --format '{{.Ports}}' | grep -q ":$1->"; then
        return 1
    fi
    return 0
}

# Find available ports
while ! check_port $WEB_PORT; do WEB_PORT=$((WEB_PORT + 1)); done
while ! check_port $API_PORT; do API_PORT=$((API_PORT + 1)); done
while ! check_port $DEBUG_PORT; do DEBUG_PORT=$((DEBUG_PORT + 1)); done

log_success "Allocated ports: Web=${WEB_PORT}, API=${API_PORT}, Debug=${DEBUG_PORT}"

# ============================================
# Create Container
# ============================================
log_info "Creating Docker container..."

CONTAINER_NAME="smartspec-${WORKSPACE_NAME}-${SAFE_BRANCH_NAME}"
SHORT_HASH=$(head /dev/urandom | tr -dc 'a-f0-9' | head -c 6)
CONTAINER_NAME="${CONTAINER_NAME}-${SHORT_HASH}"

docker create \
    --name "$CONTAINER_NAME" \
    -it \
    -p "${WEB_PORT}:3000" \
    -p "${API_PORT}:8000" \
    -p "${DEBUG_PORT}:9229" \
    -v "${PROJECT_PATH}:/workspace/project:rw" \
    -v "smartspec-npm-cache:/home/sandbox/.npm" \
    -v "smartspec-pnpm-cache:/home/sandbox/.local/share/pnpm" \
    -v "smartspec-pip-cache:/home/sandbox/.cache/pip" \
    -v "smartspec-go-cache:/home/sandbox/go" \
    -v "smartspec-cargo-cache:/home/sandbox/.cargo" \
    -w "/workspace/project" \
    -e "NODE_ENV=development" \
    -e "PYTHONUNBUFFERED=1" \
    -e "WORKSPACE_NAME=${WORKSPACE_NAME}" \
    -e "BRANCH_NAME=${BRANCH_NAME}" \
    --network smartspec-network \
    "smartspec/sandbox-${IMAGE_TYPE}:latest"

CONTAINER_ID=$(docker inspect --format='{{.Id}}' "$CONTAINER_NAME")

log_success "Created container: ${CONTAINER_NAME}"

# ============================================
# Start Container
# ============================================
log_info "Starting container..."

docker start "$CONTAINER_NAME"

log_success "Container started"

# ============================================
# Update Branch Configuration
# ============================================
log_info "Updating branch configuration..."

CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
BRANCHES_FILE="${WORKSPACE_PATH}/.workspace/branches.json"

if command -v jq &> /dev/null; then
    # Use jq for proper JSON manipulation
    jq --arg branch "$BRANCH_NAME" \
       --arg container_id "$CONTAINER_ID" \
       --arg container_name "$CONTAINER_NAME" \
       --arg image "smartspec/sandbox-${IMAGE_TYPE}:latest" \
       --arg parent "$FROM_BRANCH" \
       --arg created "$CREATED_AT" \
       --argjson web_port "$WEB_PORT" \
       --argjson api_port "$API_PORT" \
       --argjson debug_port "$DEBUG_PORT" \
       '.branches[$branch] = {
         "container_id": $container_id,
         "container_name": $container_name,
         "image": $image,
         "ports": [
           {"host": $web_port, "container": 3000, "protocol": "tcp"},
           {"host": $api_port, "container": 8000, "protocol": "tcp"},
           {"host": $debug_port, "container": 9229, "protocol": "tcp"}
         ],
         "status": "running",
         "parent_branch": $parent,
         "created_at": $created,
         "last_active": $created
       }' "$BRANCHES_FILE" > "${BRANCHES_FILE}.tmp" && \
       mv "${BRANCHES_FILE}.tmp" "$BRANCHES_FILE"
else
    log_warning "jq not installed, skipping branches.json update"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║               Branch Created Successfully!               ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

log_success "Branch: ${BRANCH_NAME}"
log_success "Container: ${CONTAINER_NAME}"
log_success "Status: Running"
echo ""

log_info "Port mappings:"
echo "  Web:   localhost:${WEB_PORT} -> container:3000"
echo "  API:   localhost:${API_PORT} -> container:8000"
echo "  Debug: localhost:${DEBUG_PORT} -> container:9229"
echo ""

log_info "To enter the container:"
echo "  docker exec -it ${CONTAINER_NAME} bash"
echo ""

log_info "To stop the container:"
echo "  docker stop ${CONTAINER_NAME}"
echo ""

log_info "To switch back to main branch:"
echo "  cd ${PROJECT_PATH} && git checkout main"
echo ""
