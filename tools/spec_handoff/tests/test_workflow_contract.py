import tempfile
import unittest
from pathlib import Path

from tools.spec_handoff.index import build_views
from tools.spec_handoff.reconcile import reconcile_one
from tools.spec_handoff.store import update_manifest, update_requirement_ledger, update_requirement_ledger_batch


REPO = Path(__file__).resolve().parents[3]


class WorkflowContractTests(unittest.TestCase):
    def test_requirement_batch_refreshes_all_rows_after_canonical_sha_advances(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            spec = repo / "specs/feature/001-batch-refresh"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text(
                "# Batch refresh\n\n## Requirements\n- External image flow must remain usable.\n- Unsafe URLs must be blocked.\n",
                encoding="utf-8",
            )
            reconcile_one(spec, repo, write=True)
            from tools.spec_handoff.store import read_manifest

            manifest = read_manifest(spec)
            digest = manifest["identity"]["digest"]
            ledger_path = spec / "handoff/requirement-ledger.json"
            import json

            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            first_sha, second_sha = "first-integrated-sha", "second-integrated-sha"
            manifest = update_manifest(
                spec,
                expected_generation=manifest["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=None,
                repo=repo,
                changes={"integration.integrated": True, "integration.canonical_sha": first_sha},
            )
            fields = {
                "applicability": "APPLICABLE",
                "implementation_status": "IMPLEMENTED",
                "implementation_evidence": ["src/feature.ts"],
                "verification_method": "focused regression tests",
                "verification_evidence": ["evidence/first.json"],
                "evidence_sha": first_sha,
                "evidence_freshness": "FRESH",
                "final_state": "PASS",
                "next_action": "Retain regression coverage.",
            }
            changes = {row["requirement_id"]: fields for row in ledger["requirements"]}
            manifest, ledger = update_requirement_ledger_batch(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=first_sha,
                changes_by_requirement=changes,
            )
            manifest = update_manifest(
                spec,
                expected_generation=manifest["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=first_sha,
                repo=repo,
                changes={"integration.canonical_sha": second_sha},
            )
            refresh = {
                row["requirement_id"]: {
                    "verification_evidence": ["evidence/second.json"],
                    "evidence_sha": second_sha,
                    "evidence_freshness": "FRESH",
                }
                for row in ledger["requirements"]
            }
            manifest, ledger = update_requirement_ledger_batch(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=second_sha,
                changes_by_requirement=refresh,
            )
            self.assertTrue(all(row["evidence_sha"] == second_sha for row in ledger["requirements"]))
            self.assertTrue(all(row["verification_evidence"] == ["evidence/second.json"] for row in ledger["requirements"]))

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

    def test_checkpoint_skills_stage_only_task_owned_paths(self):
        session_finish = (REPO / "skills/session-finish/SKILL.md").read_text(encoding="utf-8").lower()
        integration = (REPO / "skills/integration-controller/SKILL.md").read_text(encoding="utf-8").lower()
        self.assertIn("stage only files owned by this task", session_finish)
        self.assertIn("without staging other work", integration)

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

    def test_cross_skill_lifecycle_persists_deployment_and_resume_in_one_handoff(self):
        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp)
            (repo / "specs/_config").mkdir(parents=True)
            (repo / "specs/_config/handoff-roots.toml").write_text(
                '[spec_handoff]\nschema_version=1\ncanonical_roots=["specs/feature"]\nalternate_roots=[]\n',
                encoding="utf-8",
            )
            spec = repo / "specs/feature/001-cross-skill-flow"
            spec.mkdir(parents=True)
            (spec / "spec.md").write_text(
                "# Cross-skill flow\n\n## Requirements\n- One Handoff carries the work through deployment and resume.\n",
                encoding="utf-8",
            )

            # deep-project/deep-plan initialize one canonical manifest and ledger.
            reconcile_one(spec, repo, write=True)
            from tools.spec_handoff.store import read_manifest

            manifest = read_manifest(spec)
            digest = manifest["identity"]["digest"]
            ledger_path = spec / "handoff/requirement-ledger.json"
            ledger = __import__("json").loads(ledger_path.read_text(encoding="utf-8"))
            requirement_id = ledger["requirements"][0]["requirement_id"]
            self.assertEqual(ledger["requirements"][0]["final_state"], "OPEN")

            # deep-implement records implementation before integration exists.
            manifest, ledger = update_requirement_ledger(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=None,
                requirement_id=requirement_id,
                changes={
                    "applicability": "APPLICABLE",
                    "current_relevance": "CURRENT",
                    "implementation_status": "IMPLEMENTED",
                    "implementation_evidence": ["src/flow.py"],
                    "verification_method": "focused contract test",
                    "final_state": "OPEN",
                    "next_action": "Integrate, verify, and deploy the exact canonical revision.",
                },
            )

            # integration-controller records the canonical SHA; verification binds to it.
            canonical_sha = "canonical-commit-001"
            manifest = update_manifest(
                spec,
                expected_generation=manifest["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=None,
                repo=repo,
                changes={
                    "lifecycle.current_state": "PARTIAL_INTEGRATED",
                    "integration.canonical_ref": "refs/heads/main",
                    "integration.integrated": True,
                    "integration.canonical_sha": canonical_sha,
                    "integration.integrated_at": "2026-10-06T00:00:00Z",
                },
            )
            manifest, ledger = update_requirement_ledger(
                spec,
                expected_manifest_generation=manifest["generation"],
                expected_ledger_generation=ledger["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=canonical_sha,
                requirement_id=requirement_id,
                changes={
                    "verification_evidence": ["evidence/verification.json"],
                    "evidence_sha": canonical_sha,
                    "evidence_freshness": "FRESH",
                    "final_state": "PASS",
                    "next_action": "Keep exact-SHA deployment and resume evidence current.",
                },
            )
            manifest = update_manifest(
                spec,
                expected_generation=manifest["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=canonical_sha,
                repo=repo,
                changes={
                    "authority.status": "ACTIVE_CANONICAL",
                    "authority.confidence": "HIGH",
                    "disposition.value": "ACTIVE_CANONICAL",
                    "disposition.rationale": "Current approved outcome.",
                    "disposition.confidence": "HIGH",
                    "disposition.evidence": ["decision.md"],
                    "reconciliation.confidence": "HIGH",
                    "lifecycle.current_state": "VERIFIED",
                    "verification.status": "PASS",
                    "verification.sha": canonical_sha,
                    "verification.evidence": ["evidence/verification.json"],
                    "verification.freshness": "FRESH",
                    "verification.required_profiles": ["quick"],
                },
            )

            # deploy records its artifact and exact source; session-finish stores resume.
            manifest = update_manifest(
                spec,
                expected_generation=manifest["generation"],
                expected_spec_digest=digest,
                expected_canonical_sha=canonical_sha,
                repo=repo,
                changes={
                    "lifecycle.current_state": "DEPLOYED",
                    "deployment.required": True,
                    "deployment.status": "PASS",
                    "deployment.source_sha": canonical_sha,
                    "deployment.artifact_digest": "sha256:artifact-001",
                    "deployment.environment": "staging",
                    "deployment.evidence": ["evidence/deployment.json"],
                    "continuation.next_ready_workunit": "accept-flow",
                    "continuation.next_action": "Resume the acceptance WorkUnit from the canonical Handoff.",
                    "continuation.waiting_predicate": "Acceptance evidence is recorded for canonical-commit-001",
                    "continuation.reactivation_predicate": "Acceptance evidence is recorded for canonical-commit-001",
                    "continuation.resume_point": "accept-flow after deployment evidence",
                },
            )

            # A new Orchestra session reads the same exact state and next WorkUnit.
            resumed_manifest = read_manifest(spec)
            resumed_ledger = __import__("json").loads(ledger_path.read_text(encoding="utf-8"))
            self.assertEqual(resumed_manifest["integration"]["canonical_sha"], canonical_sha)
            self.assertEqual(resumed_manifest["deployment"]["source_sha"], canonical_sha)
            self.assertEqual(resumed_manifest["continuation"]["next_ready_workunit"], "accept-flow")
            self.assertEqual(resumed_manifest["continuation"]["resume_point"], "accept-flow after deployment evidence")
            self.assertEqual(resumed_ledger["requirements"][0]["evidence_sha"], canonical_sha)
            views = build_views(repo)
            row = views["spec-index.json"]["records"][0]
            self.assertEqual(row["canonical_sha"], canonical_sha)
            self.assertTrue(row["completion_eligible"], row["completion_reasons"])


if __name__ == "__main__":
    unittest.main()
