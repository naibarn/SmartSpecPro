#!/usr/bin/env bash
set -euo pipefail
INSTALL_ROOT="${SMARTAIHUB_EXECUTOR_ROOT:-$HOME/Library/Application Support/SmartAIHub/RemotionExecutor}"
launchctl bootout "gui/$(id -u)/com.smartaihub.remotion-executor" 2>/dev/null || true
rm -rf "$INSTALL_ROOT/runtime-pack"
rm -f "$HOME/.local/bin/smartaihub-remotion-executor"
echo "Runtime pack and launcher removed. Protected credentials were not deleted; run logout or Connected Devices to revoke access."
