#!/usr/bin/env python3
"""Capture session_id and plugin_root, expose via Claude's context.

This hook reads session_id from the JSON payload on stdin and:
1. Outputs it to stdout as additionalContext (Claude sees this directly)
2. Also captures CLAUDE_PLUGIN_ROOT as DEEP_PLUGIN_ROOT (for SKILL.md path resolution)
3. Optionally writes to CLAUDE_ENV_FILE if available (fallback for bash)
"""

from __future__ import annotations

import json
import os
import re
import shlex
import sys
import tempfile
from pathlib import Path


def _validate_env_file_path(env_file: str) -> Path:
    """Return a normalized host env-file path."""
    p = Path(env_file).expanduser().resolve(strict=False)
    if p.exists() and p.is_dir():
        raise ValueError(f"CLAUDE_ENV_FILE path {p} is a directory")
    allowed_roots = [
        (Path.home() / ".claude").resolve(strict=False),
        (Path.home() / ".codex").resolve(strict=False),
        Path(tempfile.gettempdir()).resolve(strict=False),
    ]
    if not any(p == root or root in p.parents for root in allowed_roots):
        raise ValueError(f"CLAUDE_ENV_FILE path {p} is outside allowed host dirs")
    return p


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        return 0  # Hooks should never fail
    except Exception:
        return 0

    session_id = payload.get("session_id")
    transcript_path = payload.get("transcript_path")

    # Capture CLAUDE_PLUGIN_ROOT (available because hooks.json expands it)
    plugin_root = (
        os.environ.get("DEEP_PLUGIN_ROOT")
        or os.environ.get("CODEX_PLUGIN_ROOT")
        or os.environ.get("CLAUDE_PLUGIN_ROOT", "")
    )

    if not session_id:
        return 0

    if not re.fullmatch(r'[a-zA-Z0-9_\-]{1,128}', session_id):
        return 0

    # Build additionalContext lines
    context_parts = []

    existing_session_id = os.environ.get("DEEP_SESSION_ID")
    if existing_session_id != session_id:
        context_parts.append(f"DEEP_SESSION_ID={session_id}")

    if plugin_root:
        context_parts.append(f"DEEP_PLUGIN_ROOT={plugin_root}")

    if context_parts:
        output = {
            "hookSpecificOutput": {
                "hookEventName": "SessionStart",
                "additionalContext": "\n".join(context_parts),
            }
        }
        print(json.dumps(output))

    # SECONDARY: Also try CLAUDE_ENV_FILE for bash commands (may not work)
    env_file = os.environ.get("CLAUDE_ENV_FILE")
    if env_file:
        try:
            existing_content = ""
            try:
                validated_path = _validate_env_file_path(env_file)
                with open(validated_path) as f:
                    existing_content = f.read()
            except FileNotFoundError:
                pass

            lines_to_write = []
            if f"DEEP_SESSION_ID={session_id}" not in existing_content:
                lines_to_write.append(f"export DEEP_SESSION_ID={shlex.quote(session_id)}\n")
            if (
                transcript_path
                and f"CLAUDE_TRANSCRIPT_PATH={transcript_path}" not in existing_content
            ):
                lines_to_write.append(
                    f"export CLAUDE_TRANSCRIPT_PATH={shlex.quote(str(transcript_path))}\n"
                )

            if lines_to_write:
                with open(validated_path, "a") as f:
                    f.writelines(lines_to_write)
        except (OSError, ValueError):
            pass  # CLAUDE_ENV_FILE failed, but we already output to context

    return 0


if __name__ == "__main__":
    sys.exit(main())
