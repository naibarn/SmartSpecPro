"""Tests for fail-closed progressive integration gate scope detection."""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("progressive_gate_scope.py")
WORKFLOW = Path(__file__).parents[2] / ".github/workflows/progressive-integration.yml"
SPEC = importlib.util.spec_from_file_location("progressive_gate_scope", SCRIPT)
SCOPE = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(SCOPE)


class ProgressiveGateScopeTests(unittest.TestCase):
    def test_lifecycle_policy_changes_require_the_gate(self) -> None:
        for path in (
            "AGENTS.md",
            "skills/integration-controller/scripts/promote_ready_pr.py",
            "scripts/development-lifecycle/canonical_source.py",
            ".github/workflows/progressive-integration.yml",
        ):
            with self.subTest(path=path):
                self.assertTrue(SCOPE.requires_progressive_gate([path]))

    def test_unrelated_changes_do_not_require_the_gate(self) -> None:
        self.assertFalse(SCOPE.requires_progressive_gate([
            "apps/web/client/src/pages/Home.tsx",
            "docs/release-notes.md",
        ]))

    def test_scope_cli_fails_closed_when_changed_paths_cannot_be_read(self) -> None:
        process = subprocess.run(
            [sys.executable, str(SCRIPT), "/path/that/does/not/exist"],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(2, process.returncode)
        self.assertIn("Unable to read changed-path list", process.stderr)
        self.assertNotEqual("skip", process.stdout.strip())

    def test_workflow_uses_scope_cli_and_fails_if_scope_check_errors(self) -> None:
        workflow = WORKFLOW.read_text(encoding="utf-8")
        self.assertIn("scripts/development-lifecycle/progressive_gate_scope.py", workflow)
        self.assertNotIn("rg -q", workflow)
        self.assertIn('case "$SCOPE_RESULT" in', workflow)
        self.assertIn("*)\n", workflow)
        self.assertIn("failing closed", workflow)

    def test_cli_reports_run_and_skip_for_valid_path_lists(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path_file = Path(temp_dir) / "changed-paths.txt"
            for paths, expected in (
                (["skills/orchestra/SKILL.md"], "run"),
                (["apps/web/client/src/pages/Home.tsx"], "skip"),
            ):
                with self.subTest(paths=paths):
                    path_file.write_text("\n".join(paths), encoding="utf-8")
                    process = subprocess.run(
                        [sys.executable, str(SCRIPT), str(path_file)],
                        capture_output=True,
                        text=True,
                        env={**os.environ, "PATH": "/nonexistent"},
                        check=False,
                    )
                    self.assertEqual(0, process.returncode, process.stderr)
                    self.assertEqual(expected, process.stdout.strip())


if __name__ == "__main__":
    unittest.main()
