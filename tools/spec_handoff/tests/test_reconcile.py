import json
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.reconcile import _normalize_repo_reference, reconcile_one


class ReconciliationTests(unittest.TestCase):
    def make_spec(self, root: Path, content: str) -> Path:
        spec = root / "specs/feature/001-legacy"
        spec.mkdir(parents=True)
        (spec / "spec.md").write_text(content, encoding="utf-8")
        (spec / "completion.md").write_text("All work completed", encoding="utf-8")
        return spec

    def test_missing_implementation_mapping_stays_reconciliation_required(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\n\n## Requirements\n- The service must preserve audit evidence.\n")
            result = reconcile_one(spec, repo, write=True)
            self.assertEqual(result["manifest"]["implementation"]["mapping"], [])
            self.assertEqual(result["manifest"]["continuation_assessment"]["decision"], "RECONCILIATION_REQUIRED")

    def test_duplicate_spec_revision_surfaces_authority_conflict_without_selecting_winner(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            self.make_spec(repo, "# First\nRevision: 4\nThe service must preserve audit evidence.\n")
            duplicate = repo / "specs/feature/001-new-name"
            duplicate.mkdir(parents=True)
            (duplicate / "spec.md").write_text("# Second\nRevision: 4\nThe service must preserve audit evidence.\n", encoding="utf-8")
            result = reconcile_one(duplicate, repo, write=True)
            self.assertEqual(result["manifest"]["authority"]["status"], "AUTHORITY_CONFLICT")
            conflict = next(row for row in result["manifest"]["authority"]["conflicts"] if row["kind"] == "DUPLICATE_SPEC_REVISION")
            self.assertEqual(set(conflict["paths"]), {"specs/feature/001-legacy", "specs/feature/001-new-name"})
            self.assertEqual(result["manifest"]["continuation_assessment"]["decision"], "RECONCILIATION_REQUIRED")

    def test_old_worktree_reference_normalizes_only_when_repo_target_exists(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            target = repo / "specs/feature/001-legacy/spec.md"
            target.parent.mkdir(parents=True)
            target.write_text("# Legacy\n", encoding="utf-8")
            old_reference = "/home/dev/.codex/worktrees/old-checkout/specs/feature/001-legacy/spec.md#L1"
            self.assertEqual(_normalize_repo_reference(old_reference, repo), "specs/feature/001-legacy/spec.md#L1")
            external_reference = "/mnt/evidence/provider/approval.json"
            self.assertEqual(_normalize_repo_reference(external_reference, repo), external_reference)

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

    def test_reconciliation_evidence_paths_are_repository_relative(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\n\n## Requirements\n- The service must retain audit evidence.\n")
            result = reconcile_one(spec, repo, write=True)
            ledger = result["ledger"]
            self.assertTrue(ledger["requirements"][0]["authority_source"].startswith("specs/feature/"))
            self.assertTrue(all(not Path(row["path"]).is_absolute() for row in result["manifest"]["reconciliation"]["sources"] if row.get("path")))
            self.assertTrue(all(not Path(row["path"]).is_absolute() for row in result["manifest"]["relevance_assessment"]["evidence"] if row.get("path")))

    def test_rerun_is_idempotent(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\nRequirement: the system must preserve data.\n")
            first = reconcile_one(spec, repo, write=True)
            before = {name: (spec / "handoff" / name).read_bytes() for name in ("manifest.json", "requirement-ledger.json", "STATUS.md", "history.jsonl")}
            second = reconcile_one(spec, repo, write=True)
            after = {name: (spec / "handoff" / name).read_bytes() for name in before}
            self.assertEqual(first["manifest"]["generation"], second["manifest"]["generation"])
            self.assertEqual(second["ledger"]["reconciliation_version"], 3)
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
            self.assertTrue(all(row["final_state"] == "OPEN" for row in result["ledger"]["requirements"]))

    def test_partial_supersession_retains_open_residual_scope(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Legacy\n\n## Requirements\n- The service must preserve audit evidence.\n- The client must support safe resume.\n")
            result = reconcile_one(spec, repo, write=True)
            manifest = result["manifest"]
            manifest["manual_decisions"] = {
                "disposition": {"value": "SUPERSEDED_PARTIAL", "rationale": "Only the service-side requirement moved.", "confidence": "MEDIUM", "evidence": ["successor/spec.md#L4"]},
                "continuation_assessment": {"decision": "CONTINUE_REQUIRED", "confidence": "MEDIUM", "rationale": "Client resume requirement remains unmapped.", "residual_requirements": ["REQ-RESUME"], "evidence": ["successor/spec.md#L4"], "next_action": "Map the remaining client resume requirement."},
            }
            (spec / "handoff/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            reconciled = reconcile_one(spec, repo, write=True)
            self.assertEqual(reconciled["manifest"]["disposition"]["value"], "SUPERSEDED_PARTIAL")
            self.assertEqual(reconciled["manifest"]["continuation_assessment"]["residual_requirements"], ["REQ-RESUME"])
            self.assertTrue(all(row["final_state"] == "OPEN" for row in reconciled["ledger"]["requirements"]))

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

    def test_requirement_extraction_supports_thai_normative_headings_and_keywords(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            spec = self.make_spec(repo, "# Example\n\n## Root cause\n- config lacks a path alias ที่จำเป็น\n\n## เกณฑ์การยอมรับ\n- ระบบต้องคง strict mode ไว้\n\n## Security Constraints (ห้ามทำ)\n- ห้ามใช้ any เพื่อปิด type errors\n")
            result = reconcile_one(spec, repo, write=True)
            rows = result["ledger"]["requirements"]
            self.assertEqual(len(rows), 2)
            self.assertTrue(any("ต้องคง strict" in row["requirement_text"] for row in rows))
            self.assertTrue(any("ห้ามใช้ any" in row["requirement_text"] for row in rows))
            self.assertFalse(any("จำเป็น" in row["requirement_text"] for row in rows))
            self.assertNotIn("UNPARSED-SPEC-", " ".join(row["requirement_id"] for row in rows))


if __name__ == "__main__":
    unittest.main()
