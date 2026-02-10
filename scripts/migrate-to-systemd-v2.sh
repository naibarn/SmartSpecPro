#!/bin/bash
#
# SmartSpecPro - Migrate to Systemd v2 Auto-Install Script
# Removes old screen-based service and installs new native systemd services
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

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

print_banner() {
    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       SmartSpecPro - Migrate to Systemd v2                    ║"
    echo "║       Automatic Installation & Migration                      ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
}

check_root
print_banner

# Step 1: Stop and remove old service
log_step "Step 1: Removing old service (if exists)..."
if systemctl is-active --quiet smartspec.service 2>/dev/null; then
    log_info "Stopping old smartspec.service..."
    systemctl stop smartspec.service || true
fi

if systemctl is-enabled --quiet smartspec.service 2>/dev/null; then
    log_info "Disabling old smartspec.service..."
    systemctl disable smartspec.service || true
fi

if [ -f /etc/systemd/system/smartspec.service ]; then
    log_info "Removing old service file..."
    rm /etc/systemd/system/smartspec.service || true
fi

systemctl daemon-reload
log_info "✓ Old service removed"

echo ""

# Step 2: Stop any running screen sessions
log_step "Step 2: Stopping any running screen sessions..."
su - dev -c "screen -list | grep smartspec | cut -d. -f1 | xargs -r kill" || true
log_info "✓ Screen sessions stopped"

echo ""

# Step 3: Install new systemd services
log_step "Step 3: Installing new systemd services..."
"$SCRIPT_DIR/install-autostart-v2.sh" install

echo ""

# Step 4: Wait for services to initialize
log_step "Step 4: Waiting for services to initialize (20 seconds)..."
sleep 20

echo ""

# Step 5: Check status
log_step "Step 5: Checking service status..."
echo ""

echo -e "${CYAN}━━━ Infrastructure ━━━${NC}"
if systemctl is-active --quiet smartspec-infra.service; then
    echo -e "  ${GREEN}✓${NC} Infrastructure running"
else
    echo -e "  ${RED}✗${NC} Infrastructure not running"
fi

echo ""
echo -e "${CYAN}━━━ Backend ━━━${NC}"
if systemctl is-active --quiet smartspec-backend.service; then
    echo -e "  ${GREEN}✓${NC} Backend running"
    sleep 2
    if curl -s http://localhost:8000/health | grep -q "status" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Backend responding"
    else
        echo -e "  ${YELLOW}⚠${NC} Backend starting..."
    fi
else
    echo -e "  ${RED}✗${NC} Backend not running"
fi

echo ""
echo -e "${CYAN}━━━ Web ━━━${NC}"
if systemctl is-active --quiet smartspec-web.service; then
    echo -e "  ${GREEN}✓${NC} Web running"
    sleep 2
    http_code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
    if [ "$http_code" = "200" ] || [ "$http_code" = "304" ]; then
        echo -e "  ${GREEN}✓${NC} Web responding"
    else
        echo -e "  ${YELLOW}⚠${NC} Web starting... (HTTP $http_code)"
    fi
else
    echo -e "  ${RED}✗${NC} Web not running"
fi

echo ""
echo -e "${CYAN}━━━ Auto-Start Status ━━━${NC}"
if systemctl is-enabled --quiet smartspec.target; then
    echo -e "  ${GREEN}✓${NC} Auto-start ENABLED (will start on reboot)"
else
    echo -e "  ${RED}✗${NC} Auto-start DISABLED"
fi

echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                 MIGRATION COMPLETED!                          ║${NC}"
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

echo -e "${CYAN}Next Steps:${NC}"
echo ""
echo "1. Test web access:"
echo "   ${YELLOW}https://smartaihub.app${NC}"
echo ""
echo "2. Check detailed status:"
echo "   ${YELLOW}sudo systemctl status smartspec.target${NC}"
echo ""
echo "3. View logs (if needed):"
echo "   ${YELLOW}sudo journalctl -u smartspec-backend.service -f${NC}"
echo "   ${YELLOW}sudo journalctl -u smartspec-web.service -f${NC}"
echo ""
echo "4. Test reboot:"
echo "   ${YELLOW}sudo reboot${NC}"
echo "   After reboot, everything should auto-start!"
echo ""

echo -e "${YELLOW}Note:${NC} Give it 30-60 seconds after reboot for all services to start"
echo ""
