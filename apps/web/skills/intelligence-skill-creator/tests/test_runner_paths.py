from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from isc.runner import canonical_isc_root, make_workspace, resolve_canonical_skill_dir, resolve_repo_root


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

    def test_make_workspace_uses_canonical_skill_dir_when_entrypoint_is_copied(self) -> None:
        with tempfile.TemporaryDirectory() as tmpdir:
            root = Path(tmpdir) / "SmartSpecPro"
            canonical_skill = root / "apps" / "web" / "skills" / "intelligence-skill-creator"
            copied_skill = root / "apps" / "web" / "skills" / "intelligence-skill-creator" / "runs" / "workspaces" / "demo" / "123" / "skills" / "intelligence-skill-creator"
            canonical_skill.mkdir(parents=True, exist_ok=True)
            copied_skill.mkdir(parents=True, exist_ok=True)
            (canonical_skill / "python").mkdir(parents=True, exist_ok=True)
            (canonical_skill / "python" / "skill.py").write_text("CANONICAL = True\n", encoding="utf-8")
            (copied_skill / "python").mkdir(parents=True, exist_ok=True)
            (copied_skill / "python" / "skill.py").write_text("COPIED = True\n", encoding="utf-8")

            resolved = resolve_canonical_skill_dir(root, "intelligence-skill-creator")

            self.assertEqual(resolved, canonical_skill)
            self.assertEqual(canonical_isc_root(root), canonical_skill)

            workspace = make_workspace(root, "intelligence-skill-creator")
            copied_workspace_skill = workspace / "skills" / "intelligence-skill-creator" / "python" / "skill.py"
            self.assertIn("CANONICAL", copied_workspace_skill.read_text(encoding="utf-8"))
            self.assertNotIn("apps/web/skills/intelligence-skill-creator/runs/workspaces", workspace.as_posix())
