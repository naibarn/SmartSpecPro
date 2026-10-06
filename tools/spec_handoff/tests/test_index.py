import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.index import build_views, status_drift, write_views
from tools.spec_handoff.inventory import inventory
from tools.spec_handoff.reconcile import reconcile_one


class IndexTests(unittest.TestCase):
    def test_every_discovered_record_appears_once_in_global_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=["archive/specs"]\n', encoding="utf-8")
            (repo / "specs/feature/001-a").mkdir(parents=True)
            (repo / "specs/feature/001-a/spec.md").write_text("# A\n", encoding="utf-8")
            (repo / "specs/feature/002-b").mkdir()
            discovered = inventory(repo)
            view = build_views(repo)
            keys = [row["record_key"] for row in view["spec-index.json"]["records"]]
            self.assertEqual(len(keys), len(set(keys)))
            self.assertEqual(len(keys), discovered["invariants"]["record_count"])
            self.assertTrue(view["reconciliation-report.json"]["invariant_discovered_equals_indexed"])

    def test_missing_handoff_is_visible_and_does_not_claim_complete(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            (repo / "specs/feature/001-a").mkdir(parents=True)
            (repo / "specs/feature/001-a/spec.md").write_text("# A\n", encoding="utf-8")
            row = build_views(repo)["spec-index.json"]["records"][0]
            self.assertEqual(row["primary_blocker"], "HANDOFF_REQUIRED")
            self.assertEqual(row["lifecycle"], "DISCOVERING")
            self.assertNotEqual(row["continuation"], "CONTINUE_REQUIRED")

    def test_generated_status_manual_drift_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-a"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# A\nThe system must preserve state.\n", encoding="utf-8")
            reconcile_one(spec, repo, write=True)
            write_views(repo, build_views(repo))
            self.assertEqual(status_drift(repo), [])
            (spec / "handoff/STATUS.md").write_text("manual edit\n", encoding="utf-8")
            self.assertEqual(status_drift(repo), ["specs/feature/001-a/handoff/STATUS.md"])


if __name__ == "__main__":
    unittest.main()
