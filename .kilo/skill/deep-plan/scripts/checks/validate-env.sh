#!/usr/bin/env bash
# Runtime-neutral environment validator for deep-plan.
#
# This skill pack is designed to run in Codex and Claude-compatible hosts
# without external LLM API credentials. Validation checks only local runtime
# shape and plugin files. Legacy auth fields remain in the JSON output as
# null/false for compatibility with older callers.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
PLUGIN_CONFIG=""

if [[ -f "$PLUGIN_ROOT/config.json" ]]; then
    PLUGIN_CONFIG="$PLUGIN_ROOT/config.json"
elif [[ -f "$(dirname "$PLUGIN_ROOT")/config.json" ]]; then
    PLUGIN_CONFIG="$(dirname "$PLUGIN_ROOT")/config.json"
else
    echo "{\"valid\": false, \"errors\": [\"Could not locate config.json. Looked in: $PLUGIN_ROOT/config.json, $(dirname "$PLUGIN_ROOT")/config.json\"], \"warnings\": [], \"gemini_auth\": null, \"openai_auth\": false, \"external_llm\": \"disabled\", \"runtime_mode\": \"portable\", \"plugin_root\": \"$PLUGIN_ROOT\"}"
    exit 3
fi

errors=()
warnings=()

if ! command -v python3 >/dev/null 2>&1; then
    errors+=("python3 not installed")
fi

if [[ ! -f "$PLUGIN_ROOT/SKILL.md" && ! -f "$PLUGIN_ROOT/skills/deep-plan/SKILL.md" ]]; then
    errors+=("missing required skill file: $PLUGIN_ROOT/SKILL.md or $PLUGIN_ROOT/skills/deep-plan/SKILL.md")
fi

for required in \
    "$PLUGIN_CONFIG" \
    "$PLUGIN_ROOT/scripts/checks/setup-planning-session.py" \
    "$PLUGIN_ROOT/scripts/hooks/capture-session-id.py"; do
    if [[ ! -f "$required" ]]; then
        errors+=("missing required file: $required")
    fi
done

if command -v python3 >/dev/null 2>&1; then
    if ! python3 - "$PLUGIN_CONFIG" >/dev/null <<'PY'
import json
import sys
from pathlib import Path

json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
PY
    then
        errors+=("config.json is not valid JSON")
    fi
fi

errors_json="[]"
if [[ ${#errors[@]} -gt 0 ]]; then
    errors_json=$(printf '%s\n' "${errors[@]}" | python3 -c 'import json,sys; print(json.dumps([line.rstrip("\n") for line in sys.stdin if line.strip()]))')
fi

warnings_json="[]"
if [[ ${#warnings[@]} -gt 0 ]]; then
    warnings_json=$(printf '%s\n' "${warnings[@]}" | python3 -c 'import json,sys; print(json.dumps([line.rstrip("\n") for line in sys.stdin if line.strip()]))')
fi

valid="true"
exit_code=0
if [[ ${#errors[@]} -gt 0 ]]; then
    valid="false"
    exit_code=1
fi

echo "{\"valid\": $valid, \"errors\": $errors_json, \"warnings\": $warnings_json, \"gemini_auth\": null, \"openai_auth\": false, \"external_llm\": \"disabled\", \"runtime_mode\": \"portable\", \"plugin_root\": \"$PLUGIN_ROOT\"}"
exit "$exit_code"
