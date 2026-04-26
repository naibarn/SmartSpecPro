#!/usr/bin/env bash
set -euo pipefail
MODE="${1:---repo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
case "$MODE" in
  --repo)
    mkdir -p .agents/skills
    rm -rf .agents/skills/visual-ui-enhancement
    cp -R "$SKILL_DIR" .agents/skills/visual-ui-enhancement
    echo "Installed visual-ui-enhancement for Codex at .agents/skills/visual-ui-enhancement"
    ;;
  --global)
    mkdir -p "$HOME/.agents/skills"
    rm -rf "$HOME/.agents/skills/visual-ui-enhancement"
    cp -R "$SKILL_DIR" "$HOME/.agents/skills/visual-ui-enhancement"
    echo "Installed visual-ui-enhancement for Codex at ~/.agents/skills/visual-ui-enhancement"
    ;;
  *)
    echo "Usage: $0 [--repo|--global]" >&2
    exit 2
    ;;
esac
