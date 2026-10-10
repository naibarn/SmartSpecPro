import json
import unittest
from pathlib import Path

from skills.orchestra.tools.lifecycle_policy import (
    blocker_strategy,
    classify_failure,
    decide_closure,
    next_ready_workunit,
    outcome_complete,
    implementation_outcome_complete,
    resume_capsule,
)


ROOT = Path(__file__).resolve().parents[3]
SCENARIOS = ROOT / "skills/orchestra/references/autonomous-completion-scenarios.json"


class AutonomousCompletionPolicyTests(unittest.TestCase):
    def test_required_scenarios(self):
        cases = json.loads(SCENARIOS.read_text(encoding="utf-8"))["scenarios"]
        self.assertEqual(38, len(cases))
        for case in cases:
            with self.subTest(case=case["id"]):
                self.assertEqual(case["expected"], decide_closure(case))

    def test_only_allowlisted_true_blockers_stop(self):
        self.assertEqual("TRUE_BLOCKER", classify_failure("EXTERNAL_DESTRUCTIVE_NO_RECOVERY"))
        self.assertEqual("TRUE_BLOCKER", classify_failure("PRODUCT_AMBIGUITY"))
        self.assertEqual("TRUE_BLOCKER", classify_failure("CRITICAL_SECURITY_ACCEPTANCE"))
        self.assertEqual("RECOVERABLE", classify_failure("RESOURCE_BLOCKED"))
        self.assertEqual("RECOVERABLE", classify_failure("POLICY_BLOCKED"))
        self.assertEqual("RECOVERABLE", classify_failure("TASK_REGRESSION"))
        self.assertEqual("RECOVERABLE", classify_failure("BASELINE_FAILURE"))
        self.assertEqual("RECOVERABLE", classify_failure("MISSING_CREDENTIAL_NO_FALLBACK", has_safe_alternative=True))

    def test_repeated_no_progress_changes_strategy(self):
        self.assertEqual("TRY_NEXT_SAFE_STRATEGY", blocker_strategy(1, meaningful_delta=False))
        self.assertEqual("CHALLENGE_BLOCKER", blocker_strategy(2, meaningful_delta=False))
        self.assertEqual("STALLED_STRATEGY", blocker_strategy(3, meaningful_delta=False))
        self.assertEqual("CHALLENGE_BLOCKER", blocker_strategy(3, meaningful_delta=True))

    def test_waiting_unit_does_not_hide_ready_independent_work(self):
        units = [
            {"id": "WU-wait", "status": "WAITING_RESOURCE", "ready": False, "prerequisites": []},
            {"id": "WU-prereq", "status": "READY", "prerequisites": ["WU-upstream"], "completion_predicate": {"kind":"test_passes", "source":"tests/wu-prereq.log"}},
            {"id": "WU-stale", "status": "READY", "prerequisites": [], "completion_predicate": {"kind":"test_passes", "source":"tests/wu-stale.log"}, "evidence_fresh": False},
            {"id": "WU-ready", "status": "READY", "prerequisites": ["WU-done"], "completion_predicate": {"kind":"test_passes", "source":"tests/wu-ready.log"}},
            {"id": "WU-done", "status": "COMPLETE", "completion_evidence": ["evidence/wu-done.log"], "canonical_sha":"main-sha"},
        ]
        self.assertEqual("WU-ready", next_ready_workunit(units, canonical_sha="main-sha"))
        self.assertIsNone(next_ready_workunit(units[:3]))
        unproven_complete = units[:3] + [
            {"id":"WU-done", "status":"COMPLETE", "completion_evidence":[]},
            units[3],
        ]
        self.assertIsNone(next_ready_workunit(unproven_complete, canonical_sha="main-sha"))

    def test_resume_preserves_exact_unresolved_and_prohibited_work(self):
        checkpoint = {
            "completed_workunits": [{"id":"WU-01", "status":"COMPLETE", "completion_evidence":["evidence/wu01.log"], "evidence_fresh":True, "canonical_sha":"main-sha-1"}],
            "unresolved_requirements": ["REQ-03"],
            "blocker_classification": "RESOURCE_BLOCKED",
            "attempted_strategies": ["full-suite: resource unavailable"],
            "prohibited_retries": ["repeat full-suite without new resource sample"],
            "waiting_predicate": {"kind": "resource_available", "profile": "full", "source":"admission gate"},
            "reactivation_predicate": {"kind": "admission_passes", "profile": "full", "source":"admission gate"},
            "evidence_fresh": False,
            "canonical_sha": "main-sha-1",
        }
        workunits = [
            {"id": "WU-02", "status": "WAITING_RESOURCE", "ready": False},
            {"id": "WU-03", "status": "READY", "prerequisites": ["WU-01"], "completion_predicate":{"kind":"test_passes", "source":"tests/wu03.log"}},
        ]
        resumed = resume_capsule(checkpoint, workunits)
        self.assertIsNone(resumed["next_workunit"])
        self.assertFalse(resumed["canonical_reconciled"])
        self.assertEqual(["REQ-03"], resumed["unresolved_requirements"])
        self.assertEqual(checkpoint["attempted_strategies"], resumed["attempted_strategies"])
        self.assertEqual(checkpoint["prohibited_retries"], resumed["prohibited_retries"])
        self.assertEqual(checkpoint["reactivation_predicate"], resumed["reactivation_predicate"])
        fresh_checkpoint = dict(checkpoint, evidence_fresh=True)
        resumed = resume_capsule(fresh_checkpoint, workunits, reconciled_canonical_sha="main-sha-1")
        self.assertEqual("WU-03", resumed["next_workunit"])
        self.assertTrue(resumed["canonical_reconciled"])
        self.assertIsNone(resume_capsule(fresh_checkpoint, workunits, reconciled_canonical_sha="main-sha-2")["next_workunit"])
        for invalid_row in (
            {"id":"WU-01", "status":"COMPLETE", "completion_evidence":[], "evidence_fresh":True, "canonical_sha":"main-sha-1"},
            {"id":"WU-01", "status":"COMPLETE", "completion_evidence":["evidence/wu01.log"], "evidence_fresh":False, "canonical_sha":"main-sha-1"},
            {"id":"WU-01", "status":"COMPLETE", "completion_evidence":["evidence/wu01.log"], "evidence_fresh":True, "canonical_sha":"old-main"},
        ):
            stale = dict(fresh_checkpoint, completed_workunits=[invalid_row])
            self.assertIsNone(resume_capsule(stale, workunits, reconciled_canonical_sha="main-sha-1")["next_workunit"])

    def test_waiting_work_requires_machine_predicates_and_new_evidence(self):
        waiting = {"id":"WU-wait", "status":"WAITING_RESOURCE", "prerequisites":[], "completion_predicate":{"kind":"test_passes", "source":"tests/wait.log"}, "waiting_predicate":{"kind":"resource_available", "source":"admission"}, "reactivation_predicate":{"kind":"admission_passes", "source":"admission"}}
        self.assertIsNone(next_ready_workunit([waiting]))
        satisfied = [
            dict(waiting["waiting_predicate"], evidence="evidence/resource.log"),
            dict(waiting["reactivation_predicate"], evidence="evidence/admission.log"),
        ]
        self.assertIsNone(next_ready_workunit([waiting], satisfied_predicates=satisfied[:1]))
        self.assertEqual("WU-wait", next_ready_workunit([waiting], satisfied_predicates=satisfied, canonical_sha="main-sha"))
        waiting["reactivation_predicate"] = "when ready"
        self.assertIsNone(next_ready_workunit([waiting], satisfied_predicates=satisfied))
        waiting["reactivation_predicate"] = {"kind":"unregistered_predicate", "source":"admission"}
        self.assertIsNone(next_ready_workunit([waiting], satisfied_predicates=satisfied))

    def test_resume_never_repeats_prohibited_strategy(self):
        unit = {"id":"WU-retry", "status":"READY", "prerequisites":[], "strategy":"retry-full-suite", "completion_predicate":{"kind":"test_passes", "source":"tests/full.log"}}
        self.assertIsNone(next_ready_workunit([unit], prohibited_retries=["retry-full-suite"]))

    def test_complete_requires_all_applicable_requirements_and_fresh_evidence(self):
        requirements = [
            {"requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS", "completion_predicate": {"kind": "test_passes", "source": "tests/r1.py"}, "completion_predicate_satisfied": True, "evidence": ["evidence/r1-test.log"], "evidence_fresh": True},
            {"requirement_id": "R2", "applicability": "NOT_APPLICABLE", "final_state": "NOT_APPLICABLE"},
        ]
        settled = {"canonical_verified": True, "user_workspace_converged": True, "worktree_lifecycle_settled": True}
        self.assertTrue(outcome_complete(requirements, integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True, **settled))
        self.assertFalse(outcome_complete(requirements, integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True))
        self.assertFalse(outcome_complete([], integrated=True, required_verification_fresh=True, authority_resolved=True))
        self.assertFalse(outcome_complete(requirements, integrated=True, required_verification_fresh=True))
        self.assertFalse(outcome_complete(requirements + [{"requirement_id":"R3", "applicability":"APPLICABLE", "final_state":"PARTIAL"}], integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True))
        self.assertFalse(outcome_complete(requirements, integrated=False, required_verification_fresh=True, authority_resolved=True))
        self.assertFalse(outcome_complete(requirements, integrated=True, required_verification_fresh=False, authority_resolved=True))
        self.assertFalse(outcome_complete([{"requirement_id":"R1", "applicability":"APPLICABLE", "final_state":"PASS", "evidence":[]}], integrated=True, required_verification_fresh=True, authority_resolved=True))
        self.assertFalse(outcome_complete([{"requirement_id":"R1", "applicability":"NOT_APPLICABLE", "final_state":None}], integrated=True, required_verification_fresh=True, authority_resolved=True))

    def test_required_deployment_and_acceptance_are_separate_completion_gates(self):
        requirements = [{"requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS", "completion_predicate": {"kind": "test_passes", "source": "tests/r1.py"}, "completion_predicate_satisfied": True, "evidence": ["test.log"], "evidence_fresh": True}]
        settled = {"canonical_verified": True, "user_workspace_converged": True, "worktree_lifecycle_settled": True}
        self.assertFalse(outcome_complete(requirements, integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True, deployment_required=True))
        self.assertFalse(outcome_complete(requirements, integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True, acceptance_required=True))
        self.assertTrue(outcome_complete(requirements, integrated=True, required_verification_fresh=True, task_regressions_clear=True, authority_resolved=True, deployment_required=True, deployed=True, acceptance_required=True, accepted=True, **settled))

    def test_scoped_implementation_closes_without_waiting_for_other_workspaces(self):
        requirements = [{
            "requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS",
            "completion_predicate": {"kind": "test_passes", "source": "tests/r1.py"},
            "completion_predicate_satisfied": True, "evidence": ["evidence/r1.log"], "evidence_fresh": True,
        }]
        kwargs = dict(
            integrated=True, required_verification_fresh=True, task_regressions_clear=True,
            authority_resolved=True, canonical_verified=True,
        )
        self.assertTrue(implementation_outcome_complete(requirements, **kwargs))
        self.assertFalse(outcome_complete(requirements, **kwargs))
        self.assertFalse(implementation_outcome_complete(requirements, **dict(kwargs, acceptance_required=True)))
        self.assertFalse(implementation_outcome_complete(requirements, **dict(kwargs, canonical_verified=False)))

    def test_implementation_and_workspace_convergence_are_reported_separately(self):
        requirement = {
            "requirement_id": "R1", "applicability": "APPLICABLE", "final_state": "PASS",
            "completion_predicate": {"kind": "evidence_exists", "locator": "evidence/r1.md"},
            "completion_predicate_satisfied": True, "evidence": ["evidence/r1.md"], "evidence_fresh": True,
        }
        facts = {"requirements": [requirement], "required_evidence": True, "canonical_verified": True}
        self.assertEqual("IMPLEMENTATION_COMPLETE", decide_closure({
            "event": "section_checkpoint_missing_evidence",
            "facts": dict(facts, user_workspace_converged=False, worktree_lifecycle_settled=False),
        }))
        self.assertEqual("CANONICAL_CONVERGENCE_PENDING", decide_closure({
            "event": "development_complete_convergence",
            "facts": dict(facts, user_workspace_converged=False, worktree_lifecycle_settled=False),
        }))
        self.assertEqual("VALIDATION_PENDING", decide_closure({
            "event": "section_checkpoint_missing_evidence",
            "facts": dict(facts, required_evidence=False, user_workspace_converged=False),
        }))

    def test_nine_deadlock_regressions_keep_gates_scoped_and_truthful(self):
        cases = [
            ("UI work beside unrelated runtime blocker", "local_blocker_with_independent_work", {"independent_work": True, "blocker_scoped": True}, "ISOLATE_BLOCKER_AND_CONTINUE"),
            ("unrelated advisory beside independent work", "unrelated_baseline_failure", {"task_regression": False, "independent_work": True}, "ISOLATE_AND_CONTINUE"),
            ("optional preview remains a capability wait", "nonproduction_preview_unavailable", {"preview_optional": True}, "WAITING_CAPABILITY"),
            ("deployed but unresolved tenant flag remains inactive", "deployed_feature_gate_unresolved", {"global_flag_enabled": False, "tenant_flag_resolved": False}, "WAITING_DEPENDENCY"),
            ("no-progress handoff changes strategy", "same_blocker_no_delta", {"repeat_count": 3, "meaningful_delta": False, "alternative_available": True}, "STALLED_STRATEGY"),
            ("external wait leaves independent work runnable", "full_verification_resource_wait", {"ready_independent_unit": True}, "QUEUE_AND_CONTINUE"),
            ("passing tests do not replace required acceptance", "production_acceptance_evidence_missing", {"acceptance_required": True, "acceptance_evidence": False}, "CONTINUE_UNTIL_ACCEPTANCE"),
            ("missing live authorization never grants permission", "unauthorized_action", {"independent_work": True}, "DENY_AND_CONTINUE_SAFE_WORK"),
        ]
        for label, event, facts, expected in cases:
            with self.subTest(regression=label):
                self.assertEqual(expected, decide_closure({"event": event, "facts": facts}))
        self.assertEqual("TRUE_BLOCKER", classify_failure("CRITICAL_SECURITY_ACCEPTANCE"))


if __name__ == "__main__":
    unittest.main()
