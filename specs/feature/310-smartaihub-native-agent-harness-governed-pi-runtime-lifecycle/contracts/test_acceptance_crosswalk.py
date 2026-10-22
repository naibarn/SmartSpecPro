import unittest

from build_acceptance_crosswalk import build_crosswalk


class AcceptanceCrosswalkTests(unittest.TestCase):
    def test_all_acceptance_ids_are_present_without_reconstructing_r1_0(self):
        crosswalk = build_crosswalk()

        self.assertEqual(len(crosswalk["criteria"]), 68)
        self.assertEqual(crosswalk["source_excerpt"]["text"], None)
        self.assertTrue(
            all(row["source_status"] == "SOURCE_TEXT_UNAVAILABLE" for row in crosswalk["criteria"][:20])
        )
        self.assertTrue(all(row["acceptance_state"] == "NOT_ASSESSED" for row in crosswalk["criteria"]))
        self.assertEqual(crosswalk["acceptance_pass_count"], 0)

    def test_all_canonical_ledger_entries_are_included_exactly(self):
        crosswalk = build_crosswalk()
        entries = crosswalk["canonical_requirement_ledger"]["entries"]

        self.assertEqual(crosswalk["canonical_requirement_ledger"]["entry_count"], 101)
        self.assertEqual(len(entries), 101)
        self.assertTrue(all(item["exact_requirement_text"] for item in entries))
        self.assertTrue(all(item["requirement_digest"] for item in entries))
        self.assertTrue(all(item["final_state"] == "OPEN" for item in entries))

    def test_present_criteria_map_to_exact_spec_source_lines_and_ledger_rows(self):
        crosswalk = build_crosswalk()

        for row in crosswalk["criteria"][20:]:
            with self.subTest(criterion=row["acceptance_id"]):
                self.assertIsNotNone(row["exact_source_text"])
                self.assertEqual(len(row["canonical_ledger_requirement_ids"]), 1)


if __name__ == "__main__":
    unittest.main()
