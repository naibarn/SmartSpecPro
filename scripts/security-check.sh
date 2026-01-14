#!/bin/bash
# Security Check Script for SmartSpec Pro
# RISK-014 FIX: Automated security scanning
#
# Usage: ./scripts/security-check.sh [--fix] [--ci]

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Flags
FIX_MODE=false
CI_MODE=false

for arg in "$@"; do
    case $arg in
        --fix)
            FIX_MODE=true
            shift
            ;;
        --ci)
            CI_MODE=true
            shift
            ;;
    esac
done

echo "========================================"
echo "SmartSpec Pro Security Check"
echo "========================================"
echo ""

# Track failures
FAILURES=0

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    if [ "$1" -eq 0 ]; then
        echo -e "${GREEN}✓ $2${NC}"
    else
        echo -e "${RED}✗ $2${NC}"
        FAILURES=$((FAILURES + 1))
    fi
}

# 1. Rust Security Audit
echo "1. Checking Rust dependencies..."
echo "--------------------------------"

if command_exists cargo-audit; then
    cd desktop-app/src-tauri
    if cargo audit 2>/dev/null; then
        print_status 0 "Rust dependencies: No vulnerabilities found"
    else
        print_status 1 "Rust dependencies: Vulnerabilities detected"
        if [ "$FIX_MODE" = true ]; then
            echo "   Attempting to update vulnerable packages..."
            cargo update
        fi
    fi
    cd ../..
else
    echo -e "${YELLOW}⚠ cargo-audit not installed. Install with: cargo install cargo-audit${NC}"
    if [ "$CI_MODE" = true ]; then
        FAILURES=$((FAILURES + 1))
    fi
fi

echo ""

# 2. NPM Security Audit
echo "2. Checking NPM dependencies..."
echo "-------------------------------"

cd desktop-app
if npm audit --audit-level=moderate 2>/dev/null; then
    print_status 0 "NPM dependencies: No vulnerabilities found"
else
    print_status 1 "NPM dependencies: Vulnerabilities detected"
    if [ "$FIX_MODE" = true ]; then
        echo "   Attempting to fix vulnerabilities..."
        npm audit fix || true
    fi
fi
cd ..

echo ""

# 3. Check for hardcoded secrets
echo "3. Checking for hardcoded secrets..."
echo "------------------------------------"

SECRETS_FOUND=0

# Check for common secret patterns
SECRET_PATTERNS=(
    "api[_-]?key\s*[:=]\s*['\"][a-zA-Z0-9]"
    "password\s*[:=]\s*['\"][^'\"]*['\"]"
    "secret\s*[:=]\s*['\"][a-zA-Z0-9]"
    "token\s*[:=]\s*['\"][a-zA-Z0-9]"
    "sk-[a-zA-Z0-9]{20,}"
    "AKIA[0-9A-Z]{16}"
)

for pattern in "${SECRET_PATTERNS[@]}"; do
    if grep -rniE "$pattern" --include="*.ts" --include="*.tsx" --include="*.rs" --include="*.json" \
        --exclude-dir=node_modules --exclude-dir=target --exclude="*.lock" \
        desktop-app/ 2>/dev/null | grep -v "test" | grep -v "example" | grep -v "placeholder"; then
        SECRETS_FOUND=1
    fi
done

if [ "$SECRETS_FOUND" -eq 0 ]; then
    print_status 0 "No hardcoded secrets found"
else
    print_status 1 "Potential hardcoded secrets detected"
fi

echo ""

# 4. Check CSP configuration
echo "4. Checking CSP configuration..."
echo "--------------------------------"

if grep -q '"csp":' desktop-app/src-tauri/tauri.conf.json; then
    CSP_VALUE=$(grep '"csp":' desktop-app/src-tauri/tauri.conf.json)
    if echo "$CSP_VALUE" | grep -q "null"; then
        print_status 1 "CSP is disabled (null)"
    elif echo "$CSP_VALUE" | grep -q "unsafe-eval"; then
        print_status 1 "CSP contains unsafe-eval"
    else
        print_status 0 "CSP is configured"
    fi
else
    print_status 1 "CSP not found in configuration"
fi

echo ""

# 5. Check for unsafe Rust patterns
echo "5. Checking for unsafe Rust patterns..."
echo "---------------------------------------"

UNSAFE_COUNT=$(grep -r "unsafe" --include="*.rs" desktop-app/src-tauri/src/ 2>/dev/null | wc -l)
UNWRAP_COUNT=$(grep -r "\.unwrap()" --include="*.rs" desktop-app/src-tauri/src/ 2>/dev/null | wc -l)

echo "   Unsafe blocks: $UNSAFE_COUNT"
echo "   .unwrap() calls: $UNWRAP_COUNT"

if [ "$UNSAFE_COUNT" -gt 10 ]; then
    print_status 1 "Too many unsafe blocks ($UNSAFE_COUNT)"
else
    print_status 0 "Unsafe blocks within acceptable range"
fi

if [ "$UNWRAP_COUNT" -gt 50 ]; then
    echo -e "${YELLOW}⚠ High number of .unwrap() calls. Consider using proper error handling.${NC}"
fi

echo ""

# 6. Check file permissions
echo "6. Checking file permissions..."
echo "-------------------------------"

EXECUTABLE_SCRIPTS=$(find . -type f \( -name "*.sh" -o -name "*.py" \) -perm /111 2>/dev/null | wc -l)
WORLD_WRITABLE=$(find . -type f -perm -002 2>/dev/null | head -5)

if [ -z "$WORLD_WRITABLE" ]; then
    print_status 0 "No world-writable files found"
else
    print_status 1 "World-writable files detected"
    echo "$WORLD_WRITABLE"
fi

echo ""

# 7. Check for outdated dependencies
echo "7. Checking for outdated dependencies..."
echo "----------------------------------------"

if command_exists cargo-outdated; then
    cd desktop-app/src-tauri
    OUTDATED=$(cargo outdated -R 2>/dev/null | grep -c "^[a-z]" || echo "0")
    if [ "$OUTDATED" -gt 10 ]; then
        echo -e "${YELLOW}⚠ $OUTDATED outdated Rust dependencies${NC}"
    else
        print_status 0 "Rust dependencies are reasonably up to date"
    fi
    cd ../..
else
    echo -e "${YELLOW}⚠ cargo-outdated not installed${NC}"
fi

cd desktop-app
OUTDATED_NPM=$(npm outdated 2>/dev/null | wc -l)
if [ "$OUTDATED_NPM" -gt 20 ]; then
    echo -e "${YELLOW}⚠ $OUTDATED_NPM outdated NPM dependencies${NC}"
else
    print_status 0 "NPM dependencies are reasonably up to date"
fi
cd ..

echo ""

# Summary
echo "========================================"
echo "Security Check Summary"
echo "========================================"

if [ "$FAILURES" -eq 0 ]; then
    echo -e "${GREEN}All security checks passed!${NC}"
    exit 0
else
    echo -e "${RED}$FAILURES security check(s) failed${NC}"
    if [ "$CI_MODE" = true ]; then
        exit 1
    else
        exit 0
    fi
fi
