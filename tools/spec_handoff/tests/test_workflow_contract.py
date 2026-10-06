import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.index import build_views
from tools.spec_handoff.reconcile import reconcile_one
from tools.spec_handoff.store import update_manifest, update_requirement_ledger


REPO = Path(__file__).resolve().parents[3]


class WorkflowContractTests(unittest.TestCase):
    def test_lifecycle_skills_share_the_same_handoff_contract(self):
        files = [
            REPO / "skills/development-lifecycle/SKILL.md",
            REPO / "skills/orchestra/SKILL.md",
            REPO / "skills/deep-project/skills/deep-project/SKILL.md",
            REPO / "skills/deep-plan/skills/deep-plan/SKILL.md",
            REPO / "skills/deep-plan-quick/SKILL.md",
            REPO / "skills/deep-implement/skills/deep-implement/SKILL.md",
            REPO / "skills/session-finish/SKILL.md",
            REPO / "skills/integration-controller/SKILL.md",
            REPO / "skills/canonical-checkout-sync/SKILL.md",
            REPO / "skills/release/SKILL.md",
            REPO / "skills/deploy/SKILL.md",
        ]
        for path in files:
            content = path.read_text(encoding="utf-8")
            with self.subTest(skill=path):
                self.assertTrue("Canonical Spec" in content or "spec-handoff-contract.md" in content)

    def test_planning_to_resume_flow_uses_one_manifest_and_exact_sha(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text('[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n', encoding="utf-8")
            spec = repo / "specs/feature/001-flow"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text("# Flow\n\n## Requirements\n- The handoff must resume the next WorkUnit.\n", encoding="utf-8")
            reconcile_one(spec, repo, write=True)
            from tools.spec_handoff.store import read_manifest
            manifest = read_manifest(spec)
            digest = manifest["identity"]["digest"]
            manifest = update_manifest(spec, expected_generation=manifest["generation"], expected_spec_digest=digest, expected_canonical_sha=None, repo=repo, changes={
                "authority.confidence": "HIGH",
                "authority.status": "ACTIVE_CANONICAL",
                "disposition.value": "ACTIVE_CANONICAL", "disposition.rationale": "Current approved outcome.", "disposition.confidence": "HIGH", "disposition.evidence": ["decision.md"],
                "continuation_assessment.decision": "VALIDATION_ONLY", "continuation_assessment.confidence": "HIGH", "continuation_assessment.rationale": "Implementation is integrated; fresh verification is required.", "continuation_assessment.evidence": ["integration.json"], "continuation_assessment.next_action": "Run the required profile.",
                "lifecycle.current_state": "PARTIAL_INTEGRATED",
                "integration.canonical_ref": "refs/heads/main", "integration.integrated": True, "integration.canonical_sha": "abc123", "integration.integrated_at": "2026-10-06T00:00:00Z",
                "continuation.next_ready_workunit": "verify-flow", "continuation.next_action": "Run the required profile.", "continuation.resume_point": "VERIFY",
            })
            ledger = __import__("json").loads((spec / "handoff/requirement-ledger.json").read_text(encoding="utf-8"))
            requirement_id = ledger["requirements"][0]["requirement_id"]
            manifest, ledger = update_requirement_ledger(spec, expected_manifest_generation=manifest["generation"], expected_ledger_generation=ledger["generation"], expected_spec_digest=digest, expected_canonical_sha="abc123", requirement_id=requirement_id, changes={
                "applicability": "APPLICABLE", "current_relevance": "CURRENT", "implementation_status": "IMPLEMENTED",
                "implementation_evidence": ["src/flow.py"], "verification_method": "focused unit test",
                "verification_evidence": ["evidence/test-flow.log"], "evidence_sha": "abc123", "evidence_freshness": "FRESH",
                "final_state": "PASS", "next_action": "No further action.",
            })
            manifest = update_manifest(spec, expected_generation=manifest["generation"], expected_spec_digest=digest, expected_canonical_sha="abc123", repo=repo, changes={
                "lifecycle.current_state": "VERIFIED",
                "reconciliation.confidence": "HIGH",
                "verification.status": "PASS", "verification.sha": "abc123", "verification.evidence": ["evidence/test-flow.log"], "verification.freshness": "FRESH", "verification.required_profiles": ["quick"],
            })
            views = build_views(repo)
            row = views["spec-index.json"]["records"][0]
            self.assertEqual(row["canonical_sha"], "abc123")
            self.assertTrue(row["completion_eligible"], row["completion_reasons"])
            self.assertEqual(manifest["continuation"]["resume_point"], "VERIFY")


if __name__ == "__main__":
    unittest.main()
