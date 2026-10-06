import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.inventory import inventory
from tools.spec_handoff.reconcile import reconcile_one
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
            (repo / "apps/web/server/a.ts").write_text("// Spec 001 is documented here\nconst spec1 = makeSpec();\n", encoding="utf-8")
            (repo / "apps/web/server/package.json").write_text('{"resolved":"https://registry.npmjs.org/@standard-schema/spec/-/spec-1.1.0.tgz"}\n', encoding="utf-8")
            (repo / "apps/web/server/__tests__").mkdir()
            (repo / "apps/web/server/__tests__/a.test.ts").write_text("// Spec 001 test reference\n", encoding="utf-8")
            evidence = collect_source_evidence_for_inventory(repo, inventory(repo))["001"]
            self.assertEqual({item["kind"] for item in evidence}, {"SOURCE", "TEST"})
            self.assertFalse(any(item.get("confirms_current_relevance") for item in evidence))

    def test_runtime_reference_does_not_claim_equivalent_requirement_satisfaction(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-legacy"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# Legacy\n\n## Requirements\n- The service must retain audit evidence.\n", encoding="utf-8")
            result = reconcile_one(spec, repo, source_references=[{"kind": "SOURCE", "path": "apps/current/equivalent-service.ts", "line": 5}])
            requirement = result["ledger"]["requirements"][0]
            self.assertEqual(result["manifest"]["relevance_assessment"]["current_runtime_dependency"], "SOURCE_REFERENCES_FOUND")
            self.assertEqual(requirement["implementation_status"], "UNVERIFIED")
            self.assertEqual(requirement["final_state"], "OPEN")
            self.assertEqual(result["manifest"]["continuation_assessment"]["decision"], "RECONCILIATION_REQUIRED")

    def test_duplicate_ids_mark_ambiguity_without_duplicating_source_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            for slug in ("001-first", "001-second"):
                spec = repo / "specs/feature" / slug
                spec.mkdir(parents=True)
                (spec / "spec.md").write_text(f"# {slug}\n", encoding="utf-8")
            source = repo / "apps/web/server/references.ts"
            source.parent.mkdir(parents=True)
            source.write_text("// Spec 1 and Spec 001 are mentioned on this same line\n", encoding="utf-8")
            evidence = collect_source_evidence_for_inventory(repo, inventory(repo))["001"]
            self.assertEqual(len(evidence), 1)
            self.assertTrue(evidence[0]["identity_ambiguous"])


if __name__ == "__main__":
    unittest.main()
