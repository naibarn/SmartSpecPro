import json
import unittest
from pathlib import Path

from tools.spec_handoff.reconciliation_classifications import build_classifications, validate_classifications


ROOT = Path(__file__).resolve().parents[3]


class ReconciliationClassificationTests(unittest.TestCase):
    def test_dynamic_inventory_has_exact_evidence_bound_classification_coverage(self):
        document = build_classifications(ROOT, baseline_sha="2287490fddfa4008bca30e8920be2426b62f6ba8")
        self.assertEqual([], validate_classifications(ROOT, document))
        self.assertEqual(463, document["inventory_record_count"])
        self.assertEqual(327, document["reconciliation_review_count"])
        self.assertEqual(0, document["duplicate_canonical_authority_count"])
        self.assertEqual(6, document["renumber_alias_count"])
        self.assertEqual(302, document["relationship_edge_count"])
        self.assertEqual(306, document["canonical_spec_count"])
        self.assertEqual(0, document["classification_counts"]["UNRESOLVED_AUTHORITY"])
        self.assertEqual(1, document["classification_counts"]["DUPLICATE_REVISION"])
        spec161 = next(row for row in document["records"] if row["spec_id"] == "161")
        self.assertEqual("CANONICAL_SPEC", spec161["record_kind"])
        self.assertEqual("CANONICAL_ACTIVE", spec161["classification"])

    def test_spec_161_reconstruction_has_explicit_approved_source_provenance(self):
        spec_dir = ROOT / "specs/feature/161-vertical-drama-async-skill-jobs"
        spec = (spec_dir / "spec.md").read_text(encoding="utf-8")
        source = (ROOT / "docs/portable-skill-pack/specs/2026-08-25-vertical-drama-async-skill-jobs-design.md").read_bytes()
        evidence = (spec_dir / "handoff/evidence/authority-resolution-2026-10-06.md").read_text(encoding="utf-8")
        handoff = json.loads((spec_dir / "handoff/manifest.json").read_text(encoding="utf-8"))
        self.assertIn("RECONSTRUCT_CANONICAL_FROM_EVIDENCE", spec)
        self.assertIn("docs/portable-skill-pack/specs/2026-08-25-vertical-drama-async-skill-jobs-design.md", spec)
        canonical_payload = spec.split("\n\n", 1)[1].encode("utf-8")
        normalize_markdown = lambda value: b"\n".join(line.rstrip(b" \t") for line in value.splitlines()) + b"\n"
        self.assertEqual(normalize_markdown(source), normalize_markdown(canonical_payload))
        self.assertIn("3ab5930dc85d84d02b8de32f3e17d69ce09993241c99d5474fb25754a07532ce", evidence)
        self.assertIn("no `specs/feature/161-vertical-drama-async-skill-jobs/spec.md`", evidence)
        for spec_id in ("166", "168", "173", "175", "176", "185"):
            self.assertIn(f"| {spec_id} |", evidence)
        self.assertEqual("ACTIVE_CANONICAL", handoff["authority"]["status"])
        self.assertEqual("VALIDATION_ONLY", handoff["continuation_assessment"]["decision"])
        self.assertEqual({"166", "168", "173", "175", "176", "185"}, {str(ref["spec_id"]) for ref in handoff["relevance_assessment"]["active_references"]})
        global_handoff = json.loads((ROOT / "specs/project/canonical-spec-handoff-reconciliation/06-exhaustive-reconciliation-proof/handoff/manifest.json").read_text(encoding="utf-8"))
        self.assertEqual("P0_WORKSPACE_AUTHORITY_AND_CONVERGENCE_HARDENING", global_handoff["continuation"]["next_ready_workunit"])
        self.assertIn("CANONICAL_SPEC_HANDOFF_MIGRATION_COMPLETE = TRUE", global_handoff["continuation"]["next_action"])

    def test_missing_or_duplicate_inventory_rows_fail_validation(self):
        document = build_classifications(ROOT, baseline_sha="9ab681181a6ac850a366bb92ebf5dc024029655b")
        document["records"].pop()
        self.assertTrue(any("coverage differs" in error for error in validate_classifications(ROOT, document)))

    def test_forty_case_matrix_has_all_framework_cases_and_fresh_repository_facts(self):
        matrix = (ROOT / "tools/spec_handoff/SCENARIO-COVERAGE-40.md").read_text(encoding="utf-8")
        rows = [line for line in matrix.splitlines() if line.startswith("|") and line.split("|")[1].strip().isdigit()]
        self.assertEqual(40, len(rows))
        self.assertTrue(all(row.rstrip().split("|")[-2].strip().startswith("FRAMEWORK_PASS") for row in rows))
        self.assertIn("306 canonical Specs and 463 total discovered/indexed records", matrix)
        self.assertIn("302 candidate edges", matrix)
        self.assertIn("327 records", matrix)


if __name__ == "__main__":
    unittest.main()
