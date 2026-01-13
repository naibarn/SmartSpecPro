#!/bin/bash
# SmartSpec Sandbox Images - Build Script
#
# Usage:
#   ./build.sh           - Build all images
#   ./build.sh base      - Build only base image
#   ./build.sh nodejs    - Build only nodejs image
#   ./build.sh python    - Build only python image
#   ./build.sh golang    - Build only golang image
#   ./build.sh rust      - Build only rust image
#   ./build.sh fullstack - Build only fullstack image

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

build_image() {
    local name=$1
    local context=$2
    local tag="smartspec/sandbox-${name}:latest"
    
    log_info "Building ${tag}..."
    
    if docker build -t "$tag" "$context"; then
        log_success "Built ${tag}"
        return 0
    else
        log_error "Failed to build ${tag}"
        return 1
    fi
}

# Main build logic
main() {
    local target=${1:-all}
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║          SmartSpec Sandbox Images Builder                ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    
    case "$target" in
        all)
            log_info "Building all sandbox images..."
            echo ""
            
            # Build in order (base first, then others)
            build_image "base" "./base"
            echo ""
            build_image "nodejs" "./nodejs"
            echo ""
            build_image "python" "./python"
            echo ""
            build_image "golang" "./golang"
            echo ""
            build_image "rust" "./rust"
            echo ""
            build_image "fullstack" "./fullstack"
            ;;
        base)
            build_image "base" "./base"
            ;;
        nodejs)
            log_warning "nodejs depends on base image"
            build_image "base" "./base"
            echo ""
            build_image "nodejs" "./nodejs"
            ;;
        python)
            log_warning "python depends on base image"
            build_image "base" "./base"
            echo ""
            build_image "python" "./python"
            ;;
        golang)
            log_warning "golang depends on base image"
            build_image "base" "./base"
            echo ""
            build_image "golang" "./golang"
            ;;
        rust)
            log_warning "rust depends on base image"
            build_image "base" "./base"
            echo ""
            build_image "rust" "./rust"
            ;;
        fullstack)
            log_warning "fullstack depends on base image"
            build_image "base" "./base"
            echo ""
            build_image "fullstack" "./fullstack"
            ;;
        *)
            log_error "Unknown target: $target"
            echo "Usage: $0 [all|base|nodejs|python|golang|rust|fullstack]"
            exit 1
            ;;
    esac
    
    echo ""
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║                    Build Complete!                       ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    
    # Show built images
    log_info "Built images:"
    docker images | grep "smartspec/sandbox" || true
}

main "$@"
