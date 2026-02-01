#!/bin/bash
# SmartSpec Desktop App - Build Script
#
# This script builds the complete desktop application including:
# - Frontend (React + TypeScript)
# - Backend (Tauri/Rust)
# - Sandbox Docker images (optional)
#
# Usage:
#   ./build.sh              # Build desktop app only
#   ./build.sh --with-docker # Build desktop app + Docker images
#   ./build.sh --debug      # Build in debug mode
#   ./build.sh --release    # Build for release (production)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${CYAN}[STEP]${NC} $1"; }

# ============================================
# Parse Arguments
# ============================================
BUILD_DOCKER=false
BUILD_MODE="release"
VERBOSE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --with-docker)
            BUILD_DOCKER=true
            shift
            ;;
        --debug)
            BUILD_MODE="debug"
            shift
            ;;
        --release)
            BUILD_MODE="release"
            shift
            ;;
        --verbose|-v)
            VERBOSE=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --with-docker    Build Docker sandbox images"
            echo "  --debug          Build in debug mode"
            echo "  --release        Build for release (default)"
            echo "  --verbose, -v    Show verbose output"
            echo "  --help, -h       Show this help"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ============================================
# Setup
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║         SmartSpec Desktop App - Build System             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

log_info "Build mode: ${BUILD_MODE}"
log_info "Build Docker images: ${BUILD_DOCKER}"
echo ""

# ============================================
# Check Prerequisites
# ============================================
log_step "Checking prerequisites..."

# Check Node.js
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed"
    exit 1
fi
NODE_VERSION=$(node --version)
log_info "Node.js: ${NODE_VERSION}"

# Check pnpm or npm
if command -v pnpm &> /dev/null; then
    PKG_MANAGER="pnpm"
elif command -v npm &> /dev/null; then
    PKG_MANAGER="npm"
else
    log_error "Neither pnpm nor npm is installed"
    exit 1
fi
log_info "Package manager: ${PKG_MANAGER}"

# Check Rust
if ! command -v rustc &> /dev/null; then
    log_error "Rust is not installed. Install from https://rustup.rs"
    exit 1
fi
RUST_VERSION=$(rustc --version)
log_info "Rust: ${RUST_VERSION}"

# Check Tauri CLI
if ! command -v cargo-tauri &> /dev/null && ! $PKG_MANAGER list @tauri-apps/cli &> /dev/null; then
    log_warning "Tauri CLI not found, installing..."
    cargo install tauri-cli
fi

# Check Docker (optional)
if [ "$BUILD_DOCKER" = true ]; then
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed but --with-docker was specified"
        exit 1
    fi
    log_info "Docker: $(docker --version)"
fi

log_success "Prerequisites check passed"
echo ""

# ============================================
# Install Dependencies
# ============================================
log_step "Installing dependencies..."

if [ ! -d "node_modules" ] || [ "$PKG_MANAGER" = "pnpm" ]; then
    $PKG_MANAGER install
fi

log_success "Dependencies installed"
echo ""

# ============================================
# Build Docker Images (Optional)
# ============================================
if [ "$BUILD_DOCKER" = true ]; then
    log_step "Building Docker sandbox images..."
    
    if [ -f "sandbox-images/build.sh" ]; then
        cd sandbox-images
        ./build.sh all
        cd ..
        log_success "Docker images built"
    else
        log_warning "sandbox-images/build.sh not found, skipping"
    fi
    echo ""
fi

# ============================================
# Build Frontend
# ============================================
log_step "Building frontend..."

$PKG_MANAGER run build

log_success "Frontend built"
echo ""

# ============================================
# Build Tauri App
# ============================================
log_step "Building Tauri application..."

if [ "$BUILD_MODE" = "debug" ]; then
    $PKG_MANAGER tauri build --debug
else
    $PKG_MANAGER tauri build
fi

log_success "Tauri application built"
echo ""

# ============================================
# Summary
# ============================================
echo "╔══════════════════════════════════════════════════════════╗"
echo "║                   Build Complete!                        ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# Find built artifacts
log_info "Build artifacts:"

if [ -d "src-tauri/target/release/bundle" ]; then
    echo ""
    log_info "Release bundles:"
    find src-tauri/target/release/bundle -type f \( -name "*.dmg" -o -name "*.app" -o -name "*.deb" -o -name "*.AppImage" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null | while read -r file; do
        SIZE=$(du -h "$file" | cut -f1)
        echo "  - $file ($SIZE)"
    done
fi

if [ -d "src-tauri/target/debug/bundle" ]; then
    echo ""
    log_info "Debug bundles:"
    find src-tauri/target/debug/bundle -type f \( -name "*.dmg" -o -name "*.app" -o -name "*.deb" -o -name "*.AppImage" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null | while read -r file; do
        SIZE=$(du -h "$file" | cut -f1)
        echo "  - $file ($SIZE)"
    done
fi

echo ""
log_info "To run the app:"
if [ "$BUILD_MODE" = "debug" ]; then
    echo "  ./src-tauri/target/debug/smartspec-pro"
else
    echo "  ./src-tauri/target/release/smartspec-pro"
fi
echo ""
