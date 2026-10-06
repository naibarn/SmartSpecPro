import tempfile
import unittest
import os
import subprocess
import sys
from pathlib import Path

from skills.runtime_hygiene import RUNTIME_PARTS, runtime_artifacts, tracked_runtime_paths
from skills.portable_install import should_ignore as portable_should_ignore
from skills.runtime_sync import should_ignore as runtime_should_ignore


class RuntimeHygieneTests(unittest.TestCase):
    def test_runtime_artifacts_are_discovered_only_under_skill_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "skills" / "one" / ".venv" / "bin").mkdir(parents=True)
            (root / "skills" / "two" / "__pycache__").mkdir(parents=True)
            (root / "skills" / "three" / ".pytest_cache").mkdir(parents=True)
            (root / "outside" / ".venv").mkdir(parents=True)
            found = runtime_artifacts(root / "skills")
            self.assertTrue(found)
            self.assertTrue(all(any(part in RUNTIME_PARTS for part in path.parts) for path in found))
            self.assertFalse(any("outside" in path.parts for path in found))

    def test_tracked_runtime_content_is_distinguished_from_local_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp)
            import subprocess
            subprocess.run(["git", "init", "-q"], cwd=repo, check=True)
            tracked_file = repo / "skills" / "packaged" / "__pycache__" / "bad.pyc"
            tracked_file.parent.mkdir(parents=True)
            tracked_file.write_bytes(b"tracked")
            subprocess.run(["git", "add", "skills"], cwd=repo, check=True)
            local_file = repo / "skills" / "local" / ".pytest_cache" / "state"
            local_file.parent.mkdir(parents=True)
            local_file.write_bytes(b"local")
            artifacts = runtime_artifacts(repo / "skills")
            tracked = tracked_runtime_paths(repo, artifacts)
            self.assertIn(Path("skills/packaged/__pycache__"), tracked)
            self.assertNotIn(Path("skills/local/.pytest_cache"), tracked)

    def test_test_commands_can_disable_bytecode_and_pytest_cache(self):
        audit = Path(__file__).resolve().parents[2] / "audit-skills.sh"
        cleanup = Path(__file__).resolve().parents[2] / "clean-runtime-artifacts.sh"
        self.assertIn("python3 -B -m unittest", audit.read_text())
        self.assertIn("python3 -B - <<'PY'", audit.read_text())
        self.assertIn("runtime_hygiene.py check-cleanup", cleanup.read_text())
        for should_ignore in (portable_should_ignore, runtime_should_ignore):
            self.assertTrue(should_ignore(Path("orchestra/tests/test_runtime_hygiene.py")))
            self.assertTrue(should_ignore(Path("orchestra/__pycache__/module.pyc")))

    def test_isolated_python_and_pytest_commands_leave_no_runtime_artifacts(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "sample.py").write_text("VALUE = 1\n")
            subprocess.run([sys.executable, "-B", "-c", "import sample",], cwd=root, check=True)
            self.assertEqual([], runtime_artifacts(root))
            tests = root / "tests"
            tests.mkdir()
            (tests / "test_sample.py").write_text("import unittest\nclass TestSample(unittest.TestCase):\n    def test_ok(self): self.assertTrue(True)\n")
            env = dict(os.environ, PYTHONDONTWRITEBYTECODE="1")
            probe = subprocess.run([sys.executable, "-B", "-m", "unittest", "discover", "-s", str(tests)], cwd=root, env=env, capture_output=True, text=True)
            self.assertEqual(0, probe.returncode, probe.stdout + probe.stderr)
            self.assertEqual([], runtime_artifacts(root))


if __name__ == "__main__":
    unittest.main()
