import json
import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.index import _record_view, _review_priority, build_views, status_drift, write_views
from tools.spec_handoff.inventory import inventory
from tools.spec_handoff.reconcile import reconcile_one


class IndexTests(unittest.TestCase):
    def test_review_priority_uses_risk_evidence_without_recommending_implementation(self):
        self.assertEqual(_review_priority({"record_kind": "MALFORMED_CANDIDATE"}), "R0_DATA_INTEGRITY")
        self.assertEqual(_review_priority({"configured_root": "specs/security", "record_kind": "CANONICAL_SPEC"}), "R0_SECURITY")
        self.assertEqual(_review_priority({"authority": "AUTHORITY_CONFLICT", "record_kind": "CANONICAL_SPEC"}), "R1_IDENTITY_CONFLICT")
        self.assertEqual(_review_priority({"current_reference_counts": {"SOURCE": 2}, "record_kind": "CANONICAL_SPEC"}), "R1_RUNTIME_REFERENCE")

    def test_every_discovered_record_appears_once_in_global_index(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=["archive/specs"]\n', encoding="utf-8")
            (repo / "specs/feature/001-a").mkdir(parents=True)
            (repo / "specs/feature/001-a/spec.md").write_text("# A\n", encoding="utf-8")
            (repo / "specs/feature/002-b").mkdir()
            discovered = inventory(repo)
            view = build_views(repo)
            keys = [row["record_key"] for row in view["spec-index.json"]["records"]]
            self.assertEqual(len(keys), len(set(keys)))
            self.assertEqual(len(keys), discovered["invariants"]["record_count"])
            self.assertTrue(view["reconciliation-report.json"]["invariant_discovered_equals_indexed"])
            self.assertTrue(view["continuation-queue.json"]["records"] == [])
            self.assertEqual(len(view["continuation-queue.json"]["reconciliation_review"]), 2)
            self.assertEqual(view["continuation-queue.json"]["reconciliation_review"][0]["priority"], "R0_DATA_INTEGRITY")

    def test_missing_handoff_is_visible_and_does_not_claim_complete(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            (repo / "specs/feature/001-a").mkdir(parents=True)
            (repo / "specs/feature/001-a/spec.md").write_text("# A\n", encoding="utf-8")
            row = build_views(repo)["spec-index.json"]["records"][0]
            self.assertEqual(row["primary_blocker"], "HANDOFF_REQUIRED")
            self.assertEqual(row["lifecycle"], "DISCOVERING")
            self.assertNotEqual(row["continuation"], "CONTINUE_REQUIRED")

    def test_retired_specs_are_excluded_from_implementation_queue(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-retired"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# Retired\nThe old service must remain documented.\n", encoding="utf-8")
            result = reconcile_one(spec, repo, write=True)
            manifest = result["manifest"]
            manifest["manual_decisions"] = {
                "disposition": {"value": "RETIRED", "rationale": "Approved retirement decision.", "confidence": "HIGH", "evidence": ["decision.md"]},
                "continuation_assessment": {"decision": "DO_NOT_CONTINUE_RETIRED", "confidence": "HIGH", "rationale": "The old service is intentionally removed.", "residual_requirements": [], "evidence": ["decision.md"], "next_action": "Retain history only."},
            }
            (spec / "handoff/manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
            reconcile_one(spec, repo, write=True)
            views = build_views(repo)
            record_key = "canonical:specs/feature/001-retired"
            self.assertNotIn(record_key, {row["record_key"] for row in views["continuation-queue.json"]["records"]})
            self.assertIn(record_key, {row["record_key"] for row in views["continuation-queue.json"]["excluded"]})

    def test_review_actions_match_malformed_and_security_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/security"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            (repo / "specs/security/20261006").mkdir(parents=True)
            (repo / "specs/security/20261006/spec.md").write_text("# Security\nBlock unsafe schemes.\n", encoding="utf-8")
            (repo / "specs/security/001-missing-spec").mkdir()
            discovered = inventory(repo)["records"]
            malformed = next(row for row in discovered if row["record_kind"] == "MALFORMED_CANDIDATE")
            security = next(row for row in discovered if row["record_kind"] == "CANONICAL_SPEC")
            reconcile_one(repo / security["path"], repo, write=True)
            malformed_view = _record_view(repo, malformed)
            security_view = _record_view(repo, security)
            self.assertIn("locate its normative spec.md", malformed_view["next_action"])
            self.assertIn("current implementation and regression tests", security_view["next_action"])

    def test_generated_status_manual_drift_is_detected(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-a"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# A\nThe system must preserve state.\n", encoding="utf-8")
            reconcile_one(spec, repo, write=True)
            write_views(repo, build_views(repo))
            self.assertEqual(status_drift(repo), [])
            (spec / "handoff/STATUS.md").write_text("manual edit\n", encoding="utf-8")
            self.assertEqual(status_drift(repo), ["specs/feature/001-a/handoff/STATUS.md"])


if __name__ == "__main__":
    unittest.main()
