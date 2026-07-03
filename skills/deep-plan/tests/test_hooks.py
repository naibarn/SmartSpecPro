"""Tests for hook configuration and scripts.

The section-writer hook tests are now in test_write_section_on_stop.py.
This file contains tests for hooks.json configuration validity.
"""

import json
import re
from pathlib import Path

import pytest


class TestHooksJsonConfig:
    """Tests for hooks.json configuration validity."""

    @pytest.fixture
    def hooks_json_path(self):
        """Return path to hooks.json."""
        return Path(__file__).parent.parent / "hooks" / "hooks.json"

    def test_hooks_json_is_valid_json(self, hooks_json_path):
        """hooks.json should be valid JSON."""
        content = hooks_json_path.read_text()
        data = json.loads(content)  # Will raise if invalid
        assert "hooks" in data

    def test_plugin_root_not_quoted_in_commands(self, hooks_json_path):
        """${CLAUDE_PLUGIN_ROOT} must not be quoted in commands.

        Claude Code doesn't expand env vars inside quotes, so commands like:
            "command": "uv run \"${CLAUDE_PLUGIN_ROOT}/script.py\""
        will fail because the variable isn't expanded.

        Correct format:
            "command": "python3 ${CLAUDE_PLUGIN_ROOT}/script.py"
        """
        content = hooks_json_path.read_text()

        # Find all command values
        data = json.loads(content)
        # Match any *_PLUGIN_ROOT variable, not just CLAUDE_PLUGIN_ROOT — the real
        # hooks.json resolves via ${DEEP_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-...}}.
        # sh -c '...' commands expand env vars inside double quotes themselves, so
        # they are safe; the quoting anti-pattern only bites direct-exec commands.
        quoted_var = re.compile(r"""\\['"]\$\{[A-Z_]*PLUGIN_ROOT""")
        for hook_type, hook_list in data.get("hooks", {}).items():
            for hook_group in hook_list:
                for hook in hook_group.get("hooks", []):
                    command = hook.get("command", "")
                    if command.strip().startswith("sh -c"):
                        continue
                    if quoted_var.search(command):
                        pytest.fail(
                            f"{hook_type} hook has a quoted ${{...PLUGIN_ROOT}} which prevents expansion:\n"
                            f"  {command}\n"
                            f"Remove quotes around the plugin-root variable"
                        )

    def test_all_hook_scripts_exist(self, hooks_json_path):
        """All scripts referenced in hooks.json should exist."""
        plugin_root = hooks_json_path.parent.parent
        data = json.loads(hooks_json_path.read_text())

        checked = 0
        for hook_type, hook_list in data.get("hooks", {}).items():
            for hook_group in hook_list:
                for hook in hook_group.get("hooks", []):
                    command = hook.get("command", "")
                    # Extract the actual script path(s) by their .py suffix,
                    # independent of which ${...PLUGIN_ROOT} prefix wraps them.
                    # The char class excludes braces so the ${VAR:-default}
                    # fallback interiors are not mistaken for the script path.
                    for rel in re.findall(r"""/[^\s"'{}]+\.py""", command):
                        full_path = plugin_root / rel.lstrip("/")
                        assert full_path.exists(), (
                            f"{hook_type} hook references non-existent script: {rel}"
                        )
                        checked += 1
        assert checked > 0, "no hook script paths were verified — regex matched nothing"

    def test_expected_hook_types_present(self, hooks_json_path):
        """Verify expected hook types are configured.

        - SessionStart: captures session ID and transcript path
        - SubagentStop: writes section files when section-writer completes (with matcher)
        - SubagentStart: should NOT exist (tracking files no longer needed)
        """
        data = json.loads(hooks_json_path.read_text())
        hooks = data.get("hooks", {})

        assert "SessionStart" in hooks, "SessionStart hook should exist"
        assert "SubagentStop" in hooks, "SubagentStop hook should exist"
        assert "SubagentStart" not in hooks, "SubagentStart hook should be removed"

    def test_subagent_stop_has_matcher(self, hooks_json_path):
        """SubagentStop hook should have matcher for section-writer."""
        data = json.loads(hooks_json_path.read_text())
        hooks = data.get("hooks", {})

        subagent_stop = hooks.get("SubagentStop", [])
        assert len(subagent_stop) > 0, "Should have SubagentStop hooks"

        # Check that it has a matcher for section-writer
        matchers = [hg.get("matcher", "") for hg in subagent_stop]
        assert any("section-writer" in m for m in matchers), (
            "SubagentStop should have matcher for section-writer"
        )

    def test_session_start_captures_transcript_path(self, hooks_json_path):
        """SessionStart hook should reference capture-session-id.py."""
        data = json.loads(hooks_json_path.read_text())
        hooks = data.get("hooks", {})

        session_start = hooks.get("SessionStart", [])
        assert len(session_start) > 0, "Should have SessionStart hooks"

        # Check command references capture-session-id.py
        commands = []
        for hook_group in session_start:
            for hook in hook_group.get("hooks", []):
                commands.append(hook.get("command", ""))

        assert any("capture-session-id.py" in cmd for cmd in commands), (
            "SessionStart should reference capture-session-id.py"
        )

    def test_hooks_do_not_use_uv_at_runtime(self, hooks_json_path):
        """Runtime hooks should not create per-skill .venv directories."""
        data = json.loads(hooks_json_path.read_text())
        for hook_list in data.get("hooks", {}).values():
            for hook_group in hook_list:
                for hook in hook_group.get("hooks", []):
                    assert not hook.get("command", "").startswith("uv run ")
