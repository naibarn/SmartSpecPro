#!/bin/bash

# SmartAIHub Monitoring Setup Script
# Sets up automated health checks and monitoring

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  SmartAIHub Monitoring Setup${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""

# 1. Create logs directory
echo -e "${GREEN}[1/4]${NC} Creating logs directory..."
mkdir -p "$PROJECT_ROOT/logs"
echo "      ✓ Created: $PROJECT_ROOT/logs"

# 2. Make health check executable
echo -e "${GREEN}[2/4]${NC} Making health check script executable..."
chmod +x "$PROJECT_ROOT/scripts/health-check.sh"
echo "      ✓ Health check script is executable"

# 3. Test health check
echo -e "${GREEN}[3/4]${NC} Testing health check script..."
if "$PROJECT_ROOT/scripts/health-check.sh" > /dev/null 2>&1; then
    echo "      ✓ Health check test passed"
else
    echo "      ⚠ Health check reported issues (check manually)"
fi

# 4. Setup cron job
echo -e "${GREEN}[4/4]${NC} Setting up cron job..."

if crontab -l 2>/dev/null | grep -q "health-check.sh"; then
    echo "      ⚠ Cron job already exists"
    echo ""
    echo -e "${YELLOW}Existing cron jobs:${NC}"
    crontab -l | grep "SmartSpec\|health-check"
else
    # Add cron job
    (crontab -l 2>/dev/null || true; echo "") | crontab -
    (crontab -l; echo "# SmartAIHub Health Check - Every 5 minutes") | crontab -
    (crontab -l; echo "*/5 * * * * cd $PROJECT_ROOT && ./scripts/health-check.sh >> logs/health-check.log 2>&1") | crontab -

    echo "      ✓ Cron job added (runs every 5 minutes)"
fi

echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}Monitoring Setup Complete!${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "${YELLOW}What was configured:${NC}"
echo "  • Health check runs every 5 minutes"
echo "  • Logs saved to: logs/health-check.log"
echo "  • Email alerts: Not configured (manual setup required)"
echo ""
echo -e "${YELLOW}Useful commands:${NC}"
echo "  ./scripts/health-check.sh           - Run health check manually"
echo "  tail -f logs/health-check.log       - Watch health check logs"
echo "  crontab -l                          - List cron jobs"
echo "  crontab -e                          - Edit cron jobs"
echo ""
echo -e "${YELLOW}Next steps (optional):${NC}"
echo "  1. Configure email alerts (install mailutils, setup SMTP)"
echo "  2. Add Slack/Discord webhook notifications"
echo "  3. Setup log rotation (logrotate.d)"
echo ""
