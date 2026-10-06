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
            self.assertEqual(second["ledger"]["reconciliation_version"], 2)
            self.assertEqual(before, after)

    def test_reconciler_version_migration_advances_ledger_generation_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nThe feature must retain evidence.\n")
            first = reconcile_one(spec, repo, write=True)
            ledger_path = spec / "handoff/requirement-ledger.json"
            prior = json.loads(ledger_path.read_text())
            prior.pop("reconciliation_version")
            ledger_path.write_text(json.dumps(prior), encoding="utf-8")
            migrated = reconcile_one(spec, repo, write=True)
            self.assertEqual(migrated["ledger"]["generation"], first["ledger"]["generation"] + 1)
            second = reconcile_one(spec, repo, write=True)
            self.assertEqual(second["ledger"]["generation"], migrated["ledger"]["generation"])

    def test_manual_disposition_is_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nThe feature must remain compatible.\n")
            first = reconcile_one(spec, repo, write=True)
            manifest = first["manifest"]
            manifest["manual_decisions"] = {
                "disposition": {"value": "RETIRED", "rationale": "approved retirement", "confidence": "HIGH", "evidence": ["decision.md"]},
                "relevance_conclusions": {"current_product_relevance": "RETIRED_BY_APPROVED_DECISION"},
            }
            (spec / "handoff/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            self.assertEqual(result["manifest"]["disposition"]["value"], "RETIRED")
            self.assertEqual(result["manifest"]["relevance_assessment"]["current_product_relevance"], "RETIRED_BY_APPROVED_DECISION")

    def test_changed_spec_marks_existing_evidence_stale_and_does_not_fake_dates(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nThe feature must remain compatible.\n")
            reconcile_one(spec, repo, write=True)
            (spec / "spec.md").write_text("# Legacy\nThe feature shall not be retired.\n", encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            manifest = result["manifest"]
            self.assertEqual(manifest["lifecycle"]["current_state"], "VALIDATION_PENDING")
            self.assertEqual(result["ledger"]["generation"], 1)
            self.assertIn("verification", manifest["reconciliation"]["stale_fields"])
            events = [json.loads(line) for line in (spec / "handoff/history.jsonl").read_text().splitlines()]
            self.assertTrue(all("observed_at" in event for event in events))
            self.assertEqual(len(events), 2)
            rerun = reconcile_one(spec, repo, write=True)
            self.assertEqual(rerun["ledger"]["generation"], 1)

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

    def test_generated_status_surfaces_claims_without_promoting_them(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nStatus: Proposed\nThe service must retain audit evidence.\n")
            result = reconcile_one(spec, repo, write=True)
            self.assertIn("Status claim: `Proposed`", result["status"])
            self.assertIn("do not set canonical status", result["status"])
            self.assertEqual(result["manifest"]["disposition"]["value"], "DORMANT_UNRESOLVED")

    def test_requirement_extraction_includes_goals_section_lists_and_success_criteria(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = repo / "specs/feature/001-example"
            spec.mkdir(parents=True)
            spec_file = spec / "spec.md"
            spec_file.write_text(
                "# Example\n## Goals & Non-Goals\n### Goals\n| # | Goal | Target |\n|---|---|---|\n| G1 | Keep citations | 100% |\n### Non-Goals\n- Build a new CMS later\n## Detailed Section Specifications\n### Section 1\n```md\n# Example config\n- The config must never count as a normative requirement.\n```\n- The system must retain sources.\n## 11. Success Criteria\n| Metric | Target |\n|---|---|\n| Freshness | 30 days |\n## Risks\n- unrelated risk note\n",
                encoding="utf-8",
            )
            ledger = reconcile_one(spec, repo)["ledger"]
            texts = [row["requirement_text"] for row in ledger["requirements"]]
            self.assertTrue(any("Keep citations" in text for text in texts))
            self.assertTrue(any("must retain sources" in text for text in texts))
            self.assertFalse(any("Example config" in text or "never count as a normative" in text for text in texts))
            self.assertTrue(any("Freshness" in text for text in texts))
            self.assertFalse(any("Build a new CMS later" in text for text in texts))
            self.assertFalse(any("unrelated risk note" in text for text in texts))


if __name__ == "__main__":
    unittest.main()
