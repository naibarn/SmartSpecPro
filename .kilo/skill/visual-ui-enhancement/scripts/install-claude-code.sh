#!/usr/bin/env bash
set -euo pipefail
MODE="${1:---repo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
case "$MODE" in
  --repo)
    mkdir -p .claude/skills
    rm -rf .claude/skills/visual-ui-enhancement
    cp -R "$SKILL_DIR" .claude/skills/visual-ui-enhancement
    echo "Installed visual-ui-enhancement for Claude Code at .claude/skills/visual-ui-enhancement"
    ;;
  --global)
    mkdir -p "$HOME/.claude/skills"
    rm -rf "$HOME/.claude/skills/visual-ui-enhancement"
    cp -R "$SKILL_DIR" "$HOME/.claude/skills/visual-ui-enhancement"
    echo "Installed visual-ui-enhancement for Claude Code at ~/.claude/skills/visual-ui-enhancement"
    ;;
  *)
    echo "Usage: $0 [--repo|--global]" >&2
    exit 2
    ;;
esac
