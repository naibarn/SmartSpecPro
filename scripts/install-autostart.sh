#!/bin/bash
#
# SmartSpecPro Auto-Start Installation Script
# Installs systemd service for automatic startup after reboot
#
# Usage:
#   sudo ./scripts/install-autostart.sh install   # Install and enable
#   sudo ./scripts/install-autostart.sh remove    # Remove and disable
#   sudo ./scripts/install-autostart.sh status    # Check status
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SERVICE_FILE="$SCRIPT_DIR/smartspec.service"
SYSTEMD_DIR="/etc/systemd/system"
SERVICE_NAME="smartspec.service"

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
    echo "║       SmartSpecPro Auto-Start Installation                    ║"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    echo -e "${NC}"

    # Check if service file exists
    if [ ! -f "$SERVICE_FILE" ]; then
        log_error "Service file not found: $SERVICE_FILE"
        exit 1
    fi

    # Stop existing service if running
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_step "Stopping existing service..."
        systemctl stop $SERVICE_NAME
    fi

    # Copy service file
    log_step "Installing systemd service..."
    cp "$SERVICE_FILE" "$SYSTEMD_DIR/$SERVICE_NAME"
    chmod 644 "$SYSTEMD_DIR/$SERVICE_NAME"

    # Reload systemd
    log_step "Reloading systemd daemon..."
    systemctl daemon-reload

    # Enable service
    log_step "Enabling auto-start on boot..."
    systemctl enable $SERVICE_NAME

    # Start service
    log_step "Starting service..."
    if systemctl start $SERVICE_NAME; then
        log_info "Service started successfully"
    else
        log_warn "Service failed to start. Check: sudo journalctl -u $SERVICE_NAME -n 50"
    fi

    echo ""
    echo -e "${GREEN}✓ Auto-start installation completed!${NC}"
    echo ""
    echo -e "${CYAN}Service Status:${NC}"
    systemctl status $SERVICE_NAME --no-pager || true

    echo ""
    echo -e "${CYAN}Useful Commands:${NC}"
    echo "  sudo systemctl status $SERVICE_NAME      - Check service status"
    echo "  sudo systemctl restart $SERVICE_NAME     - Restart service"
    echo "  sudo systemctl stop $SERVICE_NAME        - Stop service"
    echo "  sudo journalctl -u $SERVICE_NAME -f      - View live logs"
    echo "  sudo journalctl -u $SERVICE_NAME -n 100  - View last 100 log lines"
    echo ""
    echo -e "${YELLOW}Note:${NC} After reboot, all services will start automatically"
    echo ""
}

cmd_remove() {
    check_root

    log_step "Removing SmartSpecPro auto-start..."

    # Stop service
    if systemctl is-active --quiet $SERVICE_NAME; then
        log_step "Stopping service..."
        systemctl stop $SERVICE_NAME
    fi

    # Disable service
    if systemctl is-enabled --quiet $SERVICE_NAME; then
        log_step "Disabling auto-start..."
        systemctl disable $SERVICE_NAME
    fi

    # Remove service file
    if [ -f "$SYSTEMD_DIR/$SERVICE_NAME" ]; then
        log_step "Removing service file..."
        rm "$SYSTEMD_DIR/$SERVICE_NAME"
    fi

    # Reload systemd
    log_step "Reloading systemd daemon..."
    systemctl daemon-reload

    log_info "Auto-start removed successfully"
}

cmd_status() {
    echo -e "${CYAN}Service Status:${NC}"
    if [ -f "$SYSTEMD_DIR/$SERVICE_NAME" ]; then
        systemctl status $SERVICE_NAME --no-pager
        echo ""
        echo -e "${CYAN}Boot Status:${NC}"
        if systemctl is-enabled --quiet $SERVICE_NAME; then
            echo -e "  ${GREEN}✓${NC} Auto-start is ENABLED (will start on reboot)"
        else
            echo -e "  ${RED}✗${NC} Auto-start is DISABLED (will NOT start on reboot)"
        fi
    else
        echo -e "${YELLOW}Service not installed${NC}"
        echo "Run: sudo ./scripts/install-autostart.sh install"
    fi
}

cmd_test_reboot() {
    check_root

    log_warn "This will simulate a reboot by stopping and starting all services"
    echo -e "${YELLOW}This does NOT actually reboot the server${NC}"
    echo ""
    read -p "Continue? (y/N) " -n 1 -r
    echo

    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Cancelled"
        exit 0
    fi

    log_step "Stopping service..."
    systemctl stop $SERVICE_NAME || true
    sleep 3

    log_step "Starting service (simulating boot)..."
    systemctl start $SERVICE_NAME

    sleep 5

    log_step "Checking status..."
    systemctl status $SERVICE_NAME --no-pager
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
    test|test-reboot)
        cmd_test_reboot
        ;;
    help|--help|-h)
        echo "SmartSpecPro Auto-Start Manager"
        echo ""
        echo "Usage: sudo $0 <command>"
        echo ""
        echo "Commands:"
        echo "  install      - Install and enable auto-start on boot"
        echo "  remove       - Remove auto-start service"
        echo "  status       - Check service and auto-start status"
        echo "  test-reboot  - Test startup sequence (without actual reboot)"
        echo "  help         - Show this help message"
        echo ""
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run '$0 help' for usage information"
        exit 1
        ;;
esac
