#!/usr/bin/env python3
"""Portable self-review compatibility entrypoint.

This script remains so older workflow references fail gracefully instead of
trying to call external Gemini/OpenAI APIs. The actual review loop is performed
by the active host model from the deep-plan skill instructions.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Report external review status")
    parser.add_argument("--planning-dir", required=True, type=Path)
    args = parser.parse_args()

    plan_file = args.planning_dir / "claude-plan.md"
    if not plan_file.exists():
        print(json.dumps({"success": False, "error": f"Required file not found: {plan_file}"}))
        return 1

    print(json.dumps({
        "success": True,
        "external_llm": "disabled",
        "review_mode": "self_review",
        "message": "External LLM review is disabled; use the host model self-review loop.",
    }))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
