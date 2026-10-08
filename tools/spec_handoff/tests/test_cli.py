import contextlib
import io
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.cli import main


class CliTests(unittest.TestCase):
    def test_inventory_writes_requested_output_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            spec = repo / "specs/feature/001-a"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# A\n", encoding="utf-8")
            output_path = repo / "artifacts/inventory.json"
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = main(["--repo", str(repo), "inventory", "--output", str(output_path)])
            self.assertEqual(status, 0)
            self.assertIn("(1 records)", output.getvalue())
            self.assertIn('"path": "specs/feature/001-a"', output_path.read_text(encoding="utf-8"))

    def test_reconcile_accepts_spec_dir_relative_to_repo(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            spec = repo / "specs/feature/001-a"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# A\n**Revision:** R2\n## Requirements\n- The system must retain evidence.\n", encoding="utf-8")
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                status = main(["--repo", str(repo), "reconcile", "--spec-dir", "specs/feature/001-a", "--write"])
            self.assertEqual(status, 0)
            self.assertIn('"spec_id": "001"', output.getvalue())
            self.assertIn('"revision": "2"', output.getvalue())


if __name__ == "__main__":
    unittest.main()
