"""Cross-skill regression checks for the shared autonomous completion contract."""

import json
import re
import unittest
from pathlib import Path

from skills.orchestra.tools import lifecycle_policy

ROOT = Path(__file__).resolve().parents[2]

DEEP_SKILLS = {
    "deep-project": ROOT / "skills/deep-project/skills/deep-project/SKILL.md",
    "deep-plan": ROOT / "skills/deep-plan/skills/deep-plan/SKILL.md",
    "deep-plan-quick": ROOT / "skills/deep-plan-quick/SKILL.md",
    "deep-implement": ROOT / "skills/deep-implement/skills/deep-implement/SKILL.md",
}
ACTIVE_GUIDANCE = [
    *DEEP_SKILLS.values(),
    ROOT / "skills/deep-project/README.md",
    ROOT / "skills/deep-project/skills/deep-project/references/interview-protocol.md",
    ROOT / "skills/deep-project/skills/deep-project/references/spec-review-loop.md",
    ROOT / "skills/deep-plan/README.md",
    ROOT / "skills/deep-plan/skills/deep-plan/references/interview-protocol.md",
    ROOT / "skills/deep-plan/skills/deep-plan/references/plan-review-loop.md",
    ROOT / "skills/deep-plan-quick/README.md",
    ROOT / "skills/deep-implement/README.md",
    ROOT / "skills/deep-implement/skills/deep-implement/references/finalization.md",
    ROOT / "skills/deep-implement/skills/deep-implement/references/implementation-review-loop.md",
    ROOT / "skills/deep-implement/skills/deep-implement/references/git-operations.md",
    ROOT / "skills/deep-implement/skills/deep-implement/references/code-review-protocol.md",
    ROOT / "skills/deep-implement/skills/deep-implement/references/apply-interview-fixes.md",
]


class CrossSkillContractTests(unittest.TestCase):
    def test_all_workflows_reference_the_shared_lifecycle_contract(self):
        contract = ROOT / "skills/development-lifecycle/SKILL.md"
        self.assertTrue(contract.is_file())
        for name, skill in DEEP_SKILLS.items():
            text = skill.read_text(encoding="utf-8").lower()
            self.assertIn("development-lifecycle/skill.md", text, f"{name} does not reference the shared lifecycle contract")
            self.assertIn("requirement ledger", text, f"{name} omits the shared requirement ledger")
            self.assertIn("evidence freshness", text, f"{name} omits evidence-gated completion")

    def test_active_workflow_guidance_has_no_contradictory_stop_or_staging_policy(self):
        forbidden = [
            r"after 5 review loop rounds with unresolved issues",
            r"max 5 rounds.{0,100}\[SUGGEST\]",
            r"run at least 5 review/revision rounds",
            r"fatal errors after 3 fix attempts",
            r"auto-skip the section",
            r"skipping section.{0,80}continue",
            r"git add -u",
            r"git add \\.\b",
            r"run the full test suite",
            r"after 3 logged attempts still failing.{0,100}skip",
        ]
        for path in ACTIVE_GUIDANCE:
            if not path.exists():
                continue
            text = path.read_text(encoding="utf-8").lower()
            for pattern in forbidden:
                self.assertIsNone(
                    re.search(pattern, text, re.DOTALL),
                    f"{path.relative_to(ROOT)} retains contradictory policy: {pattern}",
                )

    def test_shared_kernel_is_owned_by_development_lifecycle_and_adapter_is_compatible(self):
        self.assertEqual(
            "skills/development-lifecycle/lifecycle_policy.py",
            lifecycle_policy.POLICY_OWNER,
        )
        shared = ROOT / "skills/development-lifecycle/lifecycle_policy.py"
        self.assertTrue(shared.is_file())
        self.assertTrue(hasattr(lifecycle_policy, "remaining_requirements"))

    def test_requirement_closure_requires_evidence_predicate_and_clear_regressions(self):
        requirement = {
            "requirement_id": "R1",
            "applicability": "APPLICABLE",
            "final_state": "PASS",
            "completion_predicate": {"kind": "test_passes", "source": "tests/r1.log"},
            "completion_predicate_satisfied": True,
            "evidence": ["tests/r1.log"],
            "evidence_fresh": True,
        }
        kwargs = dict(integrated=True, required_verification_fresh=True, authority_resolved=True, task_regressions_clear=True)
        self.assertTrue(lifecycle_policy.outcome_complete([requirement], **kwargs))
        self.assertFalse(lifecycle_policy.outcome_complete([dict(requirement, evidence=[])], **kwargs))
        self.assertFalse(lifecycle_policy.outcome_complete([dict(requirement, completion_predicate_satisfied=False)], **kwargs))
        self.assertFalse(lifecycle_policy.outcome_complete([requirement], **dict(kwargs, task_regressions_clear=False)))

    def test_ten_downstream_scenarios_use_the_shared_lifecycle_kernel(self):
        fixture = json.loads((ROOT / "skills/development-lifecycle/deep-workflow-scenarios.json").read_text())
        self.assertEqual(10, len(fixture["scenarios"]))
        for scenario in fixture["scenarios"]:
            with self.subTest(scenario=scenario["id"]):
                event, facts = scenario["event"], scenario["facts"]
                if event in {"same_blocker_no_delta", "full_verification_resource_wait", "unrelated_dirty_session_worktree", "conflicting_product_outcomes", "destructive_db_change_recoverable", "destructive_db_change_unrecoverable"}:
                    actual = lifecycle_policy.decide_closure({"event": event, "facts": facts})
                elif event == "missing_external_approval_with_substitute":
                    actual = lifecycle_policy.classify_failure("MANDATORY_LEGAL_APPROVAL_NO_SUBSTITUTE", has_safe_alternative=facts["has_safe_alternative"])
                elif event == "existing_implementation_satisfies_requirements":
                    actual = [row["requirement_id"] for row in lifecycle_policy.remaining_requirements(facts["requirements"])]
                    self.assertEqual(scenario["expected_remaining"], actual)
                    continue
                elif event in {"section_checkpoint_missing_evidence", "all_sections_checkpointed_with_requirement_failure"}:
                    actual = lifecycle_policy.decide_closure({"event": event, "facts": facts})
                else:
                    actual = "VALIDATION_PENDING" if not lifecycle_policy.outcome_complete(
                        facts["requirements"], integrated=True, required_verification_fresh=True,
                        authority_resolved=True, task_regressions_clear=True,
                    ) else "COMPLETE"
                self.assertEqual(scenario["expected"], actual)

    def test_packaging_and_runtime_sync_include_shared_contract_and_api(self):
        manifest = (ROOT / "skills/mirrored-skills.txt").read_text(encoding="utf-8").splitlines()
        self.assertIn("development-lifecycle", manifest)
        source = ROOT / "skills/development-lifecycle/lifecycle_policy.py"
        self.assertTrue(source.is_file())
        from skills import runtime_sync
        runtime_view = "development-lifecycle"
        self.assertTrue(any(str(item).endswith(runtime_view) for item in runtime_sync.read_manifest()))
        self.assertTrue((ROOT / "skills/development-lifecycle/SKILL.md").is_file())


if __name__ == "__main__":
    unittest.main()
