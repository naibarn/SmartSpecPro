#!/bin/bash

# SmartSpec Pro - Automatic Environment Setup Script
# For macOS and Linux
# Version: 1.0.0

set -e  # Exit on error

echo "========================================"
echo "SmartSpec Pro - Environment Setup"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Detect OS
OS="unknown"
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    echo "Detected: macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    echo "Detected: Linux"
else
    echo -e "${RED}Error: Unsupported OS${NC}"
    exit 1
fi
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $1"
    else
        echo -e "${RED}✗${NC} $1"
        exit 1
    fi
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Function to print info
print_info() {
    echo -e "${GREEN}→${NC} $1"
}

echo "Step 1: Installing Homebrew (macOS) or updating package manager (Linux)"
echo "------------------------------------------------------------------------"
if [ "$OS" = "macos" ]; then
    if ! command_exists brew; then
        print_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        print_status "Homebrew installed"
    else
        print_info "Homebrew already installed"
        brew update
        print_status "Homebrew updated"
    fi
elif [ "$OS" = "linux" ]; then
    print_info "Updating package manager..."
    if command_exists apt-get; then
        sudo apt-get update
        print_status "apt-get updated"
    elif command_exists yum; then
        sudo yum update -y
        print_status "yum updated"
    elif command_exists dnf; then
        sudo dnf update -y
        print_status "dnf updated"
    fi
fi
echo ""

echo "Step 2: Installing Node.js 22+"
echo "--------------------------------"
if ! command_exists node; then
    print_info "Installing Node.js..."
    if [ "$OS" = "macos" ]; then
        brew install node@22
        print_status "Node.js installed"
    elif [ "$OS" = "linux" ]; then
        # Install Node.js via NodeSource
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs
        print_status "Node.js installed"
    fi
else
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        print_warning "Node.js version is less than 22. Upgrading..."
        if [ "$OS" = "macos" ]; then
            brew upgrade node
        elif [ "$OS" = "linux" ]; then
            curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
        print_status "Node.js upgraded"
    else
        print_info "Node.js $(node --version) already installed"
    fi
fi
echo ""

echo "Step 3: Installing pnpm"
echo "------------------------"
if ! command_exists pnpm; then
    print_info "Installing pnpm..."
    npm install -g pnpm
    print_status "pnpm installed"
else
    print_info "pnpm $(pnpm --version) already installed"
fi
echo ""

echo "Step 4: Installing Rust"
echo "------------------------"
if ! command_exists rustc; then
    print_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    print_status "Rust installed"
else
    RUST_VERSION=$(rustc --version | cut -d' ' -f2)
    print_info "Rust $RUST_VERSION already installed"
fi
echo ""

echo "Step 5: Installing Python 3.11+"
echo "---------------------------------"
if ! command_exists python3; then
    print_info "Installing Python 3..."
    if [ "$OS" = "macos" ]; then
        brew install python@3.11
        print_status "Python 3.11 installed"
    elif [ "$OS" = "linux" ]; then
        sudo apt-get install -y python3.11 python3-pip
        print_status "Python 3.11 installed"
    fi
else
    PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
    print_info "Python $PYTHON_VERSION already installed"
fi
echo ""

echo "Step 6: Installing system dependencies"
echo "----------------------------------------"
if [ "$OS" = "macos" ]; then
    print_info "Installing macOS dependencies..."
    brew install webkit2gtk
    print_status "macOS dependencies installed"
elif [ "$OS" = "linux" ]; then
    print_info "Installing Linux dependencies..."
    sudo apt-get install -y \
        libwebkit2gtk-4.0-dev \
        build-essential \
        curl \
        wget \
        file \
        libssl-dev \
        libgtk-3-dev \
        libayatana-appindicator3-dev \
        librsvg2-dev
    print_status "Linux dependencies installed"
fi
echo ""

echo "Step 7: Installing project dependencies"
echo "-----------------------------------------"
if [ -f "package.json" ]; then
    print_info "Installing Node.js dependencies..."
    pnpm install
    print_status "Node.js dependencies installed"
else
    print_warning "package.json not found. Skipping..."
fi
echo ""

echo "Step 8: Configuring file descriptor limit"
echo "-------------------------------------------"
CURRENT_LIMIT=$(ulimit -n)
if [ "$CURRENT_LIMIT" -lt 4096 ]; then
    print_info "Current limit: $CURRENT_LIMIT"
    print_info "Setting limit to 4096..."
    ulimit -n 4096
    print_status "File descriptor limit set to 4096"
    
    # Add to shell profile
    SHELL_PROFILE=""
    if [ -f "$HOME/.zshrc" ]; then
        SHELL_PROFILE="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        SHELL_PROFILE="$HOME/.bashrc"
    elif [ -f "$HOME/.bash_profile" ]; then
        SHELL_PROFILE="$HOME/.bash_profile"
    fi
    
    if [ -n "$SHELL_PROFILE" ]; then
        if ! grep -q "ulimit -n 4096" "$SHELL_PROFILE"; then
            echo "" >> "$SHELL_PROFILE"
            echo "# SmartSpec Pro - File descriptor limit" >> "$SHELL_PROFILE"
            echo "ulimit -n 4096" >> "$SHELL_PROFILE"
            print_info "Added to $SHELL_PROFILE"
        fi
    fi
else
    print_info "File descriptor limit already set: $CURRENT_LIMIT"
fi
echo ""

echo "Step 9: Verifying installation"
echo "--------------------------------"
print_info "Node.js: $(node --version)"
print_info "pnpm: $(pnpm --version)"
print_info "Rust: $(rustc --version | cut -d' ' -f1,2)"
print_info "Python: $(python3 --version)"
print_info "File descriptor limit: $(ulimit -n)"
echo ""

echo "========================================"
echo -e "${GREEN}✓ Setup Complete!${NC}"
echo "========================================"
echo ""
echo "Next steps:"
echo "1. Run: source ~/.zshrc  (or ~/.bashrc)"
echo "2. Run: pnpm tauri dev"
echo ""
echo "For production build:"
echo "  pnpm tauri build"
echo ""
