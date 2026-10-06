import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.inventory import inventory
from tools.spec_handoff.source_evidence import collect_source_evidence_for_inventory


class SourceEvidenceTests(unittest.TestCase):
    def test_code_and_test_mentions_are_evidence_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-a"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# A\n", encoding="utf-8")
            (repo / "apps/web/server/a.ts").parent.mkdir(parents=True)
            (repo / "apps/web/server/a.ts").write_text("// Spec 001 is documented here\n", encoding="utf-8")
            (repo / "apps/web/server/__tests__").mkdir()
            (repo / "apps/web/server/__tests__/a.test.ts").write_text("// Spec 001 test reference\n", encoding="utf-8")
            evidence = collect_source_evidence_for_inventory(repo, inventory(repo))["001"]
            self.assertEqual({item["kind"] for item in evidence}, {"SOURCE", "TEST"})
            self.assertFalse(any(item.get("confirms_current_relevance") for item in evidence))


if __name__ == "__main__":
    unittest.main()
