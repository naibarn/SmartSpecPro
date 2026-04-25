from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from isc.runner import make_workspace, resolve_repo_root


class RunnerPathTests(unittest.TestCase):
    def test_resolve_repo_root_finds_outer_repo_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "SmartSpecPro"
            nested = root / "apps" / "web" / "skills" / "intelligence-skill-creator" / "runs" / "workspaces" / "demo" / "123" / "skills" / "intelligence-skill-creator" / "isc"
            nested.mkdir(parents=True, exist_ok=True)
            (root / "apps" / "web").mkdir(parents=True, exist_ok=True)
            (root / "apps" / "web" / "package.json").write_text("{}", encoding="utf-8")
            (root / ".git").mkdir(parents=True, exist_ok=True)

            resolved = resolve_repo_root(nested / "runner.py")

            self.assertEqual(resolved, root)

    def test_make_workspace_skips_nested_runs_tree(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "SmartSpecPro"
            skill_src = root / "apps" / "web" / "skills" / "demo-skill"
            nested_runs = skill_src / "runs" / "workspaces" / "old" / "skills" / "demo-skill"
            nested_runs.mkdir(parents=True, exist_ok=True)
            (skill_src / "python").mkdir(parents=True, exist_ok=True)
            (skill_src / "python" / "skill.py").write_text("def respond(input, context=None):\n    return '{}'\n", encoding="utf-8")
            (nested_runs / "artifact.txt").write_text("should not be copied", encoding="utf-8")

            with patch("isc.runner.resolve_skill_dir", return_value=skill_src):
                workspace = make_workspace(root, "demo-skill")

            copied_skill = workspace / "skills" / "demo-skill"
            self.assertTrue((copied_skill / "python" / "skill.py").exists())
            self.assertFalse((copied_skill / "runs").exists())
