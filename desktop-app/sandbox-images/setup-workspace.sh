#!/bin/bash
# SmartSpec Sandbox - Workspace Setup Script
#
# This script initializes the workspace environment:
# - Creates shared cache volumes
# - Sets up directory structure
# - Initializes configuration files

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

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║       SmartSpec Sandbox - Workspace Setup                ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ============================================
# Check Docker
# ============================================
log_info "Checking Docker installation..."

if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info &> /dev/null; then
    log_error "Docker daemon is not running. Please start Docker."
    exit 1
fi

log_success "Docker is available"

# ============================================
# Create Base Directory Structure
# ============================================
SMARTSPEC_HOME="${HOME}/SmartSpec"

log_info "Creating directory structure at ${SMARTSPEC_HOME}..."

mkdir -p "${SMARTSPEC_HOME}/workspaces"
mkdir -p "${SMARTSPEC_HOME}/cache/npm"
mkdir -p "${SMARTSPEC_HOME}/cache/pnpm"
mkdir -p "${SMARTSPEC_HOME}/cache/pip"
mkdir -p "${SMARTSPEC_HOME}/cache/uv"
mkdir -p "${SMARTSPEC_HOME}/cache/go"
mkdir -p "${SMARTSPEC_HOME}/cache/cargo"
mkdir -p "${SMARTSPEC_HOME}/cache/sccache"
mkdir -p "${SMARTSPEC_HOME}/config"

log_success "Directory structure created"

# ============================================
# Create Docker Volumes
# ============================================
log_info "Creating shared Docker volumes..."

VOLUMES=(
    "smartspec-npm-cache"
    "smartspec-pnpm-cache"
    "smartspec-pip-cache"
    "smartspec-uv-cache"
    "smartspec-go-cache"
    "smartspec-cargo-cache"
    "smartspec-sccache"
)

for volume in "${VOLUMES[@]}"; do
    if docker volume inspect "$volume" &> /dev/null; then
        log_warning "Volume $volume already exists"
    else
        docker volume create "$volume"
        log_success "Created volume: $volume"
    fi
done

# ============================================
# Create Configuration Files
# ============================================
log_info "Creating configuration files..."

# Global settings
cat > "${SMARTSPEC_HOME}/config/settings.json" << 'EOF'
{
  "version": "1.0",
  "workspace": {
    "default_image": "smartspec/sandbox-nodejs:latest",
    "auto_start_container": true,
    "stop_on_branch_switch": false
  },
  "docker": {
    "memory_limit": "4g",
    "cpu_limit": 4,
    "network": "smartspec-network"
  },
  "git": {
    "auto_fetch": true,
    "fetch_interval_minutes": 5,
    "default_branch": "main"
  },
  "ports": {
    "web_range": [3000, 3099],
    "api_range": [8000, 8099],
    "debug_range": [9200, 9299]
  }
}
EOF

# Workspace registry
if [ ! -f "${SMARTSPEC_HOME}/config/workspaces.json" ]; then
    echo "{}" > "${SMARTSPEC_HOME}/config/workspaces.json"
fi

log_success "Configuration files created"

# ============================================
# Create Docker Network
# ============================================
log_info "Creating Docker network..."

if docker network inspect smartspec-network &> /dev/null; then
    log_warning "Network smartspec-network already exists"
else
    docker network create smartspec-network
    log_success "Created network: smartspec-network"
fi

# ============================================
# Summary
# ============================================
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                    Setup Complete!                       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

log_info "Directory structure:"
echo "  ${SMARTSPEC_HOME}/"
echo "  ├── workspaces/     # Your project workspaces"
echo "  ├── cache/          # Shared package caches"
echo "  │   ├── npm/"
echo "  │   ├── pnpm/"
echo "  │   ├── pip/"
echo "  │   ├── go/"
echo "  │   └── cargo/"
echo "  └── config/         # Configuration files"
echo ""

log_info "Docker volumes created:"
for volume in "${VOLUMES[@]}"; do
    echo "  - $volume"
done
echo ""

log_info "Next steps:"
echo "  1. Build sandbox images: ./build.sh"
echo "  2. Create a workspace through Desktop App"
echo "  3. Or manually: ./create-workspace.sh <name> [repo-url]"
echo ""
