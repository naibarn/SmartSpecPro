#!/bin/bash
#
# Finalize Auto-Start Configuration
# Updates systemd service files and prepares for reboot testing
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_step() { echo -e "${BLUE}[STEP]${NC} $1"; }

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi
}

check_root

echo -e "${CYAN}"
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║          Finalize SmartSpecPro Auto-Start                     ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Step 1: Copy updated service files
log_step "Copying updated service files..."
cp "$SCRIPT_DIR/smartspec-infra.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/smartspec-backend.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/smartspec-web.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/smartspec-docker-status.service" "$SYSTEMD_DIR/"
cp "$SCRIPT_DIR/smartspec.target" "$SYSTEMD_DIR/"
log_info "✓ Service files copied"

# Step 2: Set correct permissions
log_step "Setting permissions..."
chmod 644 "$SYSTEMD_DIR/smartspec-infra.service"
chmod 644 "$SYSTEMD_DIR/smartspec-backend.service"
chmod 644 "$SYSTEMD_DIR/smartspec-web.service"
chmod 644 "$SYSTEMD_DIR/smartspec-docker-status.service"
chmod 644 "$SYSTEMD_DIR/smartspec.target"
log_info "✓ Permissions set"

# Step 3: Reload systemd
log_step "Reloading systemd daemon..."
systemctl daemon-reload
log_info "✓ Systemd reloaded"

# Step 4: Check if services are enabled
log_step "Verifying services are enabled..."
if ! systemctl is-enabled --quiet smartspec-infra.service; then
    log_warn "Enabling smartspec-infra.service..."
    systemctl enable smartspec-infra.service
fi

if ! systemctl is-enabled --quiet smartspec-backend.service; then
    log_warn "Enabling smartspec-backend.service..."
    systemctl enable smartspec-backend.service
fi

if ! systemctl is-enabled --quiet smartspec-web.service; then
    log_warn "Enabling smartspec-web.service..."
    systemctl enable smartspec-web.service
fi

if ! systemctl is-enabled --quiet smartspec-docker-status.service; then
    log_warn "Enabling smartspec-docker-status.service..."
    systemctl enable smartspec-docker-status.service
fi

log_info "✓ All services enabled"

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║             AUTO-START CONFIGURATION COMPLETE!                ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Step 5: Show current status
log_step "Current service status:"
echo ""
systemctl status smartspec-infra.service --no-pager | head -3
systemctl status smartspec-backend.service --no-pager | head -3
systemctl status smartspec-web.service --no-pager | head -3
systemctl status smartspec-docker-status.service --no-pager | head -3

echo ""
echo -e "${CYAN}═══ Ready for Reboot Testing ═══${NC}"
echo ""
echo -e "${YELLOW}To test auto-start after reboot:${NC}"
echo ""
echo "1. Reboot the server:"
echo "   ${CYAN}sudo reboot${NC}"
echo ""
echo "2. After reboot (wait 60-90 seconds), SSH back in and check:"
echo "   ${CYAN}./run-services.sh status${NC}"
echo ""
echo "3. Verify web access:"
echo "   ${CYAN}https://smartaihub.app${NC}"
echo ""
echo -e "${GREEN}Expected result:${NC} All services should auto-start and web should be accessible"
echo ""
