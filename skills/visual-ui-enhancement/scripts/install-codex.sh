#!/usr/bin/env bash
set -euo pipefail
MODE="${1:---repo}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
remove_existing_skill() {
  local target="$1"
  case "$target" in
    .agents/skills/visual-ui-enhancement|"$HOME"/.agents/skills/visual-ui-enhancement)
      rm -r -- "$target"
      ;;
    *)
      echo "Refusing to remove unexpected path: $target" >&2
      exit 1
      ;;
  esac
}
case "$MODE" in
  --repo)
    mkdir -p .agents/skills
    [[ ! -e .agents/skills/visual-ui-enhancement ]] || remove_existing_skill .agents/skills/visual-ui-enhancement
    cp -R "$SKILL_DIR" .agents/skills/visual-ui-enhancement
    echo "Installed visual-ui-enhancement for Codex at .agents/skills/visual-ui-enhancement"
    ;;
  --global)
    mkdir -p "$HOME/.agents/skills"
    [[ ! -e "$HOME/.agents/skills/visual-ui-enhancement" ]] || remove_existing_skill "$HOME/.agents/skills/visual-ui-enhancement"
    cp -R "$SKILL_DIR" "$HOME/.agents/skills/visual-ui-enhancement"
    echo "Installed visual-ui-enhancement for Codex at ~/.agents/skills/visual-ui-enhancement"
    ;;
  *)
    echo "Usage: $0 [--repo|--global]" >&2
    exit 2
    ;;
esac
