#!/usr/bin/env python3
"""Capture session_id and plugin root, expose them via Claude's context.

This hook reads session_id from the JSON payload on stdin and:
1. Outputs it to stdout as additionalContext (Claude sees this directly)
2. Also captures CLAUDE_PLUGIN_ROOT as DEEP_PLUGIN_ROOT for downstream scripts
3. Optionally writes to CLAUDE_ENV_FILE if available (fallback for bash)

The additionalContext approach is primary because:
- CLAUDE_ENV_FILE is unreliable (empty string bug, not sourced on resume)
- After /clear, env var has OLD session_id while hook gets NEW one
- additionalContext bypasses these issues by flowing through Claude's context

Usage:
    This script is called automatically by Claude Code when configured
    as a SessionStart hook in hooks/hooks.json (for plugins):

    {
      "hooks": {
        "SessionStart": [
          {
            "hooks": [
              {
                "type": "command",
                "command": "uv run ${CLAUDE_PLUGIN_ROOT}/scripts/hooks/capture-session-id.py"
              }
            ]
          }
        ]
      }
    }
"""

import json
import os
import re
import shlex
import sys
import tempfile
from pathlib import Path


def _validate_env_file_path(env_file: str) -> Path:
    """Return a normalized host env-file path.

    Claude-compatible hosts may expose CLAUDE_ENV_FILE. Codex normally does
    not need this fallback, but keeping it allows one shared skill pack. The
    path must stay inside a known host-owned area or the OS temp directory.
    """
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
    """Capture session_id, output to Claude's context and optionally CLAUDE_ENV_FILE.

    Returns:
        0 always (hooks should not fail the session start)
    """
    try:
        payload = json.load(sys.stdin)
    except json.JSONDecodeError:
        # No valid JSON on stdin - silently succeed
        return 0
    except Exception:
        # Any other error reading stdin - silently succeed
        return 0

    session_id = payload.get("session_id")
    transcript_path = payload.get("transcript_path")
    plugin_root = (
        os.environ.get("DEEP_PLUGIN_ROOT")
        or os.environ.get("CODEX_PLUGIN_ROOT")
        or os.environ.get("CLAUDE_PLUGIN_ROOT", "")
    )

    # Need at least session_id to proceed
    if not session_id:
        return 0

    # Validate session_id format (prevent path traversal via env file writes)
    if not re.fullmatch(r'[a-zA-Z0-9_\-]{1,128}', session_id):
        return 0

    # Build additionalContext lines for both session and plugin root.
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
            # Check if already set (avoid duplicates from multiple plugins)
            existing_content = ""
            try:
                validated_path = _validate_env_file_path(env_file)
                with open(validated_path) as f:
                    existing_content = f.read()
            except FileNotFoundError:
                pass

            # Only write if not already present
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
            # Failed to read/write - silently succeed (we already output to context)
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
