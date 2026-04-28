#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
required = [
    "SKILL.md",
    "README.md",
    "agents/openai.yaml",
    "codex/README.md",
    "claude-code/README.md",
    "references/visual-polish-checklist.md",
    "references/accessibility-qa.md",
    "templates/AGENTS.md-snippet.md",
    "templates/CLAUDE.md-snippet.md",
]
missing = [p for p in required if not (ROOT / p).exists()]
if missing:
    print("Missing required files:")
    for p in missing:
        print(f"- {p}")
    sys.exit(1)

skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
for token in ["name: visual-ui-enhancement", "description:", "Tailwind CSS", "shadcn/ui", "$visual-ui-enhancement", "/visual-ui-enhancement"]:
    if token not in skill:
        print(f"SKILL.md missing expected token: {token}")
        sys.exit(1)

print("visual-ui-enhancement package validation OK")
