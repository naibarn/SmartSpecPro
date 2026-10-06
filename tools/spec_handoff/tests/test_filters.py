import unittest

from tools.spec_handoff.cli import filter_records


class FilterTests(unittest.TestCase):
    def test_global_filters_select_semantic_state(self):
        rows = [
            {"completion_eligible": True, "disposition": "ACTIVE_CANONICAL", "continuation": "VALIDATION_ONLY", "confidence": "HIGH", "authority": "ACTIVE_CANONICAL"},
            {"completion_eligible": False, "disposition": "SUPERSEDED_FULL", "continuation": "DO_NOT_CONTINUE_SUPERSEDED", "confidence": "HIGH", "authority": "ACTIVE_CANONICAL"},
            {"completion_eligible": False, "disposition": "DORMANT_UNRESOLVED", "continuation": "RECONCILIATION_REQUIRED", "confidence": "UNRESOLVED", "authority": "AUTHORITY_CONFLICT"},
        ]
        self.assertEqual(len(filter_records(rows, "COMPLETE")), 1)
        self.assertEqual(len(filter_records(rows, "CURRENT_ACTIVE")), 1)
        self.assertEqual(len(filter_records(rows, "SUPERSEDED_FULL")), 1)
        self.assertEqual(len(filter_records(rows, "AUTHORITY_CONFLICT")), 1)
        self.assertEqual(len(filter_records(rows, "LOW_CONFIDENCE")), 1)


if __name__ == "__main__":
    unittest.main()
