import unittest
from pathlib import Path

from tools.spec_handoff.reconciliation_classifications import build_classifications, validate_classifications


ROOT = Path(__file__).resolve().parents[3]


class ReconciliationClassificationTests(unittest.TestCase):
    def test_dynamic_inventory_has_exact_evidence_bound_classification_coverage(self):
        document = build_classifications(ROOT, baseline_sha="9ab681181a6ac850a366bb92ebf5dc024029655b")
        self.assertEqual([], validate_classifications(ROOT, document))
        self.assertEqual(463, document["inventory_record_count"])
        self.assertEqual(331, document["reconciliation_review_count"])
        self.assertEqual(0, document["duplicate_canonical_authority_count"])
        self.assertEqual(6, document["renumber_alias_count"])
        self.assertEqual(302, document["relationship_edge_count"])
        self.assertEqual(1, document["classification_counts"]["UNRESOLVED_AUTHORITY"])
        self.assertEqual(1, document["classification_counts"]["DUPLICATE_REVISION"])
        missing_source = next(row for row in document["records"] if row["classification"] == "UNRESOLVED_AUTHORITY")
        self.assertTrue(missing_source["related_evidence"])

    def test_missing_or_duplicate_inventory_rows_fail_validation(self):
        document = build_classifications(ROOT, baseline_sha="9ab681181a6ac850a366bb92ebf5dc024029655b")
        document["records"].pop()
        self.assertTrue(any("coverage differs" in error for error in validate_classifications(ROOT, document)))

    def test_forty_case_matrix_has_all_framework_cases_and_fresh_repository_facts(self):
        matrix = (ROOT / "tools/spec_handoff/SCENARIO-COVERAGE-40.md").read_text(encoding="utf-8")
        rows = [line for line in matrix.splitlines() if line.startswith("|") and line.split("|")[1].strip().isdigit()]
        self.assertEqual(40, len(rows))
        self.assertTrue(all(row.rstrip().split("|")[-2].strip().startswith("FRAMEWORK_PASS") for row in rows))
        self.assertIn("305 canonical Specs and 463 total discovered/indexed records", matrix)
        self.assertIn("302 candidate edges", matrix)
        self.assertIn("331 records", matrix)


if __name__ == "__main__":
    unittest.main()
