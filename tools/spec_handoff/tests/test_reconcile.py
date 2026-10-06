import json
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.reconcile import reconcile_one


class ReconciliationTests(unittest.TestCase):
    def make_spec(self, root: Path, content: str) -> Path:
        spec = root / "specs/feature/001-legacy"
        spec.mkdir(parents=True)
        (spec / "spec.md").write_text(content, encoding="utf-8")
        (spec / "completion.md").write_text("All work completed", encoding="utf-8")
        return spec

    def test_completion_artifact_never_auto_completes_and_emits_requirement_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\n\n## Requirements\n- The service must retain audit evidence.\n")
            result = reconcile_one(spec, repo, write=True)
            manifest = result["manifest"]
            self.assertEqual(manifest["lifecycle"]["current_state"], "DISCOVERING")
            self.assertEqual(manifest["continuation_assessment"]["decision"], "RECONCILIATION_REQUIRED")
            self.assertEqual(result["ledger"]["requirements"][0]["final_state"], "OPEN")
            self.assertEqual(len((spec / "handoff/history.jsonl").read_text().splitlines()), 1)

    def test_rerun_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nRequirement: the system must preserve data.\n")
            first = reconcile_one(spec, repo, write=True)
            before = {name: (spec / "handoff" / name).read_bytes() for name in ("manifest.json", "requirement-ledger.json", "STATUS.md", "history.jsonl")}
            second = reconcile_one(spec, repo, write=True)
            after = {name: (spec / "handoff" / name).read_bytes() for name in before}
            self.assertEqual(first["manifest"]["generation"], second["manifest"]["generation"])
            self.assertEqual(before, after)

    def test_manual_disposition_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nThe feature must remain compatible.\n")
            first = reconcile_one(spec, repo, write=True)
            manifest = first["manifest"]
            manifest["manual_decisions"] = {"disposition": {"value": "RETIRED", "rationale": "approved retirement", "confidence": "HIGH", "evidence": ["decision.md"]}}
            (spec / "handoff/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            self.assertEqual(result["manifest"]["disposition"]["value"], "RETIRED")

    def test_changed_spec_marks_existing_evidence_stale_and_does_not_fake_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nThe feature must remain compatible.\n")
            reconcile_one(spec, repo, write=True)
            (spec / "spec.md").write_text("# Legacy\nThe feature shall not be retired.\n", encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            manifest = result["manifest"]
            self.assertEqual(manifest["lifecycle"]["current_state"], "VALIDATION_PENDING")
            self.assertIn("verification", manifest["reconciliation"]["stale_fields"])
            events = [json.loads(line) for line in (spec / "handoff/history.jsonl").read_text().splitlines()]
            self.assertTrue(all("observed_at" in event for event in events))
            self.assertEqual(len(events), 2)

    def test_full_supersession_requires_manual_decision_and_preserves_implementation_history(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Old\nThe feature must retain compatibility.\n")
            first = reconcile_one(spec, repo, write=True)
            manifest = first["manifest"]
            manifest["implementation"]["status"] = "PARTIAL_INTEGRATED"
            manifest["manual_decisions"] = {
                "disposition": {"value": "SUPERSEDED_FULL", "rationale": "Successor owns all applicable scope.", "confidence": "HIGH", "evidence": ["successor/spec.md#L4"]},
                "continuation_assessment": {"decision": "DO_NOT_CONTINUE_SUPERSEDED", "confidence": "HIGH", "rationale": "All current requirements mapped to successor.", "residual_requirements": [], "evidence": ["successor/spec.md#L4"], "next_action": "Retain historical evidence only."},
            }
            (spec / "handoff/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            self.assertEqual(result["manifest"]["disposition"]["value"], "SUPERSEDED_FULL")
            self.assertEqual(result["manifest"]["implementation"]["status"], "PARTIAL_INTEGRATED")
            self.assertEqual(result["manifest"]["continuation_assessment"]["decision"], "DO_NOT_CONTINUE_SUPERSEDED")

    def test_age_or_newness_does_not_choose_a_winner(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Newer\nCreated: 2026-10-01\nVersion: 9.0\nThe feature must be audited.\n")
            result = reconcile_one(spec, repo, write=True)
            self.assertEqual(result["manifest"]["authority"]["status"], "UNRESOLVED")
            self.assertEqual(result["manifest"]["continuation_assessment"]["decision"], "RECONCILIATION_REQUIRED")


if __name__ == "__main__":
    unittest.main()
