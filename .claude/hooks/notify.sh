#!/usr/bin/env bash
# Notification / SubagentStop logging hook.
#
# This host has no display/notification service (`notify-send` fails with
# "org.freedesktop.DBus.Error.ServiceUnknown" — headless remote server per
# CLAUDE.md). Desktop push isn't viable here, so instead of alerting in real
# time, every Notification (waiting on permission/input) and SubagentStop
# (a Task/sub-agent finished — heavily used by /orchestra wave dispatch)
# event gets appended to a local log, so you can check afterward whether
# background work actually completed instead of guessing.
#
# Usage: notify.sh <label>   (label = which hook event fired, e.g. "notification" / "subagent-stop")

set -uo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
log_file="$repo_root/.claude/hooks/notify.log"

label="${1:-event}"
payload="$(cat)"

mkdir -p "$(dirname "$log_file")"
printf '[%s] %s: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$label" "$payload" >> "$log_file"

exit 0
