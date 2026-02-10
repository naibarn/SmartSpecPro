#!/bin/bash
#
# SmartSpecPro Auto-Start Installation Script (v2 - Systemd Native)
# Installs multiple systemd services for proper auto-start after reboot
#
# Usage:
#   sudo ./scripts/install-autostart-v2.sh install   # Install and enable
#   sudo ./scripts/install-autostart-v2.sh remove    # Remove and disable
#   sudo ./scripts/install-autostart-v2.sh status    # Check status
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SYSTEMD_DIR="/etc/systemd/system"

SERVICES=(
    "smartspec.target"
    "smartspec-infra.service"
    "smartspec-backend.service"
    "smartspec-web.service"
    "smartspec-docker-status.service"
)

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

cmd_install() {
    check_root

    echo -e "${CYAN}"
    echo "╔═══════════════════════════════════════════════════════════════╗"
    echo "║       SmartSpecPro Auto-Start Installation (v2)               ║"
    echo "║       Using Native Systemd Services                           ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Stop existing services if running
    log_step "Stopping existing services..."
    for service in "${SERVICES[@]}"; do
        if systemctl is-active --quiet "$service" 2>/dev/null; then
            systemctl stop "$service" || true
        fi
    done

    # Install service files
    log_step "Installing systemd service files..."
    for service in "${SERVICES[@]}"; do
        local service_file="$SCRIPT_DIR/$service"
        if [ ! -f "$service_file" ]; then
            log_error "Service file not found: $service_file"
            exit 1
        fi
        cp "$service_file" "$SYSTEMD_DIR/$service"
        chmod 644 "$SYSTEMD_DIR/$service"
        log_info "Installed: $service"
    done

    # Reload systemd
    log_step "Reloading systemd daemon..."
    systemctl daemon-reload

    # Enable target
    log_step "Enabling auto-start on boot..."
    systemctl enable smartspec.target

    # Start services
    log_step "Starting services..."
    if systemctl start smartspec.target; then
        log_info "Services started successfully"
    else
        log_warn "Service failed to start. Check: sudo journalctl -u smartspec.target -n 50"
    fi

    # Wait a bit for services to initialize
    sleep 5

    echo ""
    echo -e "${GREEN}✓ Auto-start installation completed!${NC}"
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    systemctl status smartspec-infra.service --no-pager | head -10 || true
    echo ""
    systemctl status smartspec-backend.service --no-pager | head -10 || true
    echo ""
    systemctl status smartspec-web.service --no-pager | head -10 || true
    echo ""
    systemctl status smartspec-docker-status.service --no-pager | head -10 || true

    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo "  sudo systemctl status smartspec.target       - Check all services"
    echo "  sudo systemctl status smartspec-backend.service  - Check backend"
    echo "  sudo systemctl status smartspec-web.service      - Check web"
    echo "  sudo systemctl status smartspec-docker-status.service - Check docker status UI"
    echo "  sudo systemctl restart smartspec.target      - Restart all services"
    echo "  sudo journalctl -u smartspec-backend.service -f  - View backend logs"
    echo "  sudo journalctl -u smartspec-web.service -f      - View web logs"
    echo "  sudo journalctl -u smartspec-docker-status.service -f - View docker status logs"
    echo ""
    echo -e "${YELLOW}Note:${NC} After reboot, all services will start automatically"
    echo ""
}

cmd_remove() {
    check_root

    log_step "Removing SmartSpecPro auto-start..."

    # Stop and disable target
    if systemctl is-active --quiet smartspec.target; then
        log_step "Stopping services..."
        systemctl stop smartspec.target
    fi

    if systemctl is-enabled --quiet smartspec.target 2>/dev/null; then
        log_step "Disabling auto-start..."
        systemctl disable smartspec.target
    fi

    # Remove service files
    for service in "${SERVICES[@]}"; do
        if [ -f "$SYSTEMD_DIR/$service" ]; then
            log_step "Removing $service..."
            rm "$SYSTEMD_DIR/$service"
        fi
    done

    # Reload systemd
    log_step "Reloading systemd daemon..."
    systemctl daemon-reload

    log_info "Auto-start removed successfully"
}

cmd_status() {
    echo -e "${CYAN}╔═══════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║                SmartSpecPro Service Status                    ║${NC}"
    echo -e "${CYAN}╚═══════════════════════════════════════════════════════════════╝${NC}"
    echo ""

    if [ -f "$SYSTEMD_DIR/smartspec.target" ]; then
        echo -e "${BLUE}Target Status:${NC}"
        systemctl status smartspec.target --no-pager | head -15
        echo ""

        echo -e "${BLUE}Infrastructure:${NC}"
        systemctl status smartspec-infra.service --no-pager | head -10
        echo ""

        echo -e "${BLUE}Backend:${NC}"
        systemctl status smartspec-backend.service --no-pager | head -10
        echo ""

        echo -e "${BLUE}Web:${NC}"
        systemctl status smartspec-web.service --no-pager | head -10
        echo ""

        echo -e "${BLUE}Docker Status:${NC}"
        systemctl status smartspec-docker-status.service --no-pager | head -10
        echo ""

        echo -e "${BLUE}Boot Status:${NC}"
        if systemctl is-enabled --quiet smartspec.target; then
            echo -e "  ${GREEN}✓${NC} Auto-start is ENABLED (will start on reboot)"
        else
            echo -e "  ${RED}✗${NC} Auto-start is DISABLED (will NOT start on reboot)"
        fi
    else
        echo -e "${YELLOW}Services not installed${NC}"
        echo "Run: sudo ./scripts/install-autostart-v2.sh install"
    fi
}

# Main
case "${1:-help}" in
    install)
        cmd_install
        ;;
    remove|uninstall)
        cmd_remove
        ;;
    status)
        cmd_status
        ;;
    help|--help|-h)
        echo "SmartSpecPro Auto-Start Manager (v2 - Systemd Native)"
        echo ""
        echo "Usage: sudo $0 <command>"
        echo ""
        echo "Commands:"
        echo "  install      - Install and enable auto-start on boot"
        echo "  remove       - Remove auto-start services"
        echo "  status       - Check service and auto-start status"
        echo "  help         - Show this help message"
        echo ""
        echo "This version uses native systemd services instead of screen sessions"
        echo "for better reliability and integration with systemd."
        echo ""
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac
