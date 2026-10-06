import json
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.store import StaleWriteError, initialize, read_manifest, update_manifest, update_requirement_ledger
from tools.spec_handoff.reconcile import reconcile_one


class StoreTests(unittest.TestCase):
    def setup_spec(self, root: Path) -> Path:
        spec = root / "specs/feature/001-example"
        spec.mkdir(parents=True)
        (spec / "spec.md").write_text("# Example\n\nRequirement R1\n", encoding="utf-8")
        return spec

    def test_initialize_writes_seed_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            first = initialize(spec, root)
            second = initialize(spec, root)
            self.assertEqual(first, second)
            handoff = spec / "handoff"
            self.assertTrue((handoff / "manifest.json").exists())
            self.assertTrue((handoff / "requirement-ledger.json").exists())
            self.assertIn("DO NOT EDIT", (handoff / "STATUS.md").read_text())
            event = json.loads((handoff / "history.jsonl").read_text().splitlines()[0])
            self.assertEqual(event["event_type"], "RECONCILIATION_SNAPSHOT")

    def test_init_dry_run_does_not_create_any_handoff_files_or_directories(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            initialize(spec, root, dry_run=True)
            self.assertFalse((spec / "handoff").exists())

    def test_stale_generation_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            value = initialize(spec, root)
            update_manifest(spec, expected_generation=0, expected_spec_digest=value["identity"]["digest"], expected_canonical_sha=None,
                            changes={"lifecycle.current_state": "WORKING"}, repo=root)
            with self.assertRaises(StaleWriteError):
                update_manifest(spec, expected_generation=0, expected_spec_digest=value["identity"]["digest"], expected_canonical_sha=None,
                                changes={"lifecycle.current_state": "VERIFIED"}, repo=root)

    def test_stale_spec_digest_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            value = initialize(spec, root)
            (spec / "spec.md").write_text("# Changed\n", encoding="utf-8")
            with self.assertRaises(StaleWriteError):
                update_manifest(spec, expected_generation=0, expected_spec_digest=value["identity"]["digest"], expected_canonical_sha=None,
                                changes={"lifecycle.current_state": "WORKING"}, repo=root)

    def test_stale_canonical_sha_is_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            value = initialize(spec, root)
            with self.assertRaises(StaleWriteError):
                update_manifest(spec, expected_generation=0, expected_spec_digest=value["identity"]["digest"], expected_canonical_sha="stale-sha",
                                changes={"lifecycle.current_state": "WORKING"}, repo=root)

    def test_requirement_update_is_the_single_validated_writer(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            reconcile_one(spec, root, write=True)
            manifest = read_manifest(spec)
            ledger = json.loads((spec / "handoff/requirement-ledger.json").read_text())
            req_id = ledger["requirements"][0]["requirement_id"]
            updated, updated_ledger = update_requirement_ledger(spec,
                expected_manifest_generation=manifest["generation"], expected_ledger_generation=ledger["generation"],
                expected_spec_digest=manifest["identity"]["digest"], expected_canonical_sha=None,
                requirement_id=req_id, changes={"applicability": "APPLICABLE", "current_relevance": "UNASSESSED", "next_action": "Map current implementation."})
            self.assertEqual(updated["generation"], manifest["generation"] + 1)
            self.assertEqual(updated_ledger["generation"], ledger["generation"] + 1)
            status = (spec / "handoff/STATUS.md").read_text()
            self.assertIn("generated", status.lower())

    def test_requirement_update_rejects_stale_ledger_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            reconcile_one(spec, root, write=True)
            manifest = read_manifest(spec)
            ledger = json.loads((spec / "handoff/requirement-ledger.json").read_text())
            with self.assertRaises(StaleWriteError):
                update_requirement_ledger(spec,
                    expected_manifest_generation=manifest["generation"], expected_ledger_generation=99,
                    expected_spec_digest=manifest["identity"]["digest"], expected_canonical_sha=None,
                    requirement_id=ledger["requirements"][0]["requirement_id"], changes={"next_action": "retry"})

    def test_requirement_update_survives_reconciliation_for_same_spec_digest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            reconcile_one(spec, root, write=True)
            manifest = read_manifest(spec)
            ledger = json.loads((spec / "handoff/requirement-ledger.json").read_text())
            req = ledger["requirements"][0]
            update_requirement_ledger(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=manifest["identity"]["digest"],
                expected_canonical_sha=None,
                requirement_id=req["requirement_id"],
                changes={"applicability": "APPLICABLE", "verification_evidence": ["tests/result.json"], "final_state": "FAIL", "next_action": "Repair the failing requirement."},
            )
            reconciled = reconcile_one(spec, root, write=True)
            saved = reconciled["ledger"]["requirements"][0]
            self.assertEqual(saved["final_state"], "FAIL")
            self.assertEqual(saved["verification_evidence"], ["tests/result.json"])

    def test_requirement_update_is_not_reapplied_after_normative_digest_changes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            reconcile_one(spec, root, write=True)
            manifest = read_manifest(spec)
            ledger = json.loads((spec / "handoff/requirement-ledger.json").read_text())
            req = ledger["requirements"][0]
            update_requirement_ledger(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=manifest["identity"]["digest"],
                expected_canonical_sha=None,
                requirement_id=req["requirement_id"],
                changes={"applicability": "APPLICABLE", "verification_evidence": ["tests/result.json"], "final_state": "FAIL"},
            )
            (spec / "spec.md").write_text("# Changed\nRequirement R1 changed.\n", encoding="utf-8")
            reconciled = reconcile_one(spec, root, write=True)
            self.assertNotEqual(reconciled["ledger"]["requirements"][0]["final_state"], "FAIL")

    def test_manual_decision_survives_inference_seed_rerun(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            spec = self.setup_spec(root)
            value = initialize(spec, root)
            value["manual_decisions"] = {"disposition": {"value": "RETIRED", "rationale": "signed decision", "authority": "product"}}
            (spec / "handoff/manifest.json").write_text(json.dumps(value), encoding="utf-8")
            self.assertEqual(initialize(spec, root)["manual_decisions"]["disposition"]["value"], "RETIRED")


if __name__ == "__main__":
    unittest.main()
