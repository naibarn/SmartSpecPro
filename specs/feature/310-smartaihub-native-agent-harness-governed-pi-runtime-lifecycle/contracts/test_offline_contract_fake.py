import json
import unittest
from pathlib import Path

from offline_contract_fake import evaluate_fixture


class OfflineContractFakeTests(unittest.TestCase):
    def test_all_proposed_negative_and_boundary_fixtures(self):
        fixtures_path = Path(__file__).with_name("g1-negative-fixtures.proposal.json")
        fixtures = json.loads(fixtures_path.read_text(encoding="utf-8"))["fixtures"]

        self.assertEqual(len(fixtures), 18)
        for fixture in fixtures:
            with self.subTest(fixture=fixture["id"]):
                actual = evaluate_fixture(fixture["intent"])
                for key, expected in fixture["expected"].items():
                    self.assertEqual(actual.get(key), expected)
                if fixture["expected"].get("decision") == "DENY":
                    self.assertEqual(actual.get("sideEffects"), [])

    def test_unknown_fixture_shape_never_admits_work(self):
        result = evaluate_fixture({"contract": "native-run-intent.v1"})

        self.assertEqual(result["decision"], "FIXTURE_ONLY_NO_ADMISSION")
        self.assertEqual(result["sideEffects"], [])


if __name__ == "__main__":
    unittest.main()
