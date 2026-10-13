from __future__ import annotations

import json
import sys
import tempfile
import unittest
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from durable_store import DurableRunStore
from run_spec_workunit import capacity_retry_after, changed_source_paths, cumulative_source_paths, is_capacity_error, is_ready_for_user_test, next_turn_limit


class DevelopmentContinuationTests(unittest.TestCase):
    def test_readiness_is_separate_from_strict_acceptance_and_requires_independent_proof(self) -> None:
        test_receipt = {"exitCode": 0}
        review = {"complete": False, "functionalReadyForUserTest": True}
        verification = {"complete": False, "functionalReadyForUserTest": True}
        self.assertTrue(is_ready_for_user_test(test_receipt, review, verification, []))
        self.assertFalse(is_ready_for_user_test({"exitCode": 1}, review, verification, []))
        self.assertFalse(is_ready_for_user_test(test_receipt, {**review, "functionalReadyForUserTest": False}, verification, []))
        self.assertFalse(is_ready_for_user_test(test_receipt, review, verification, [{"status": "pending"}]))

    def test_max_turns_is_a_resumable_segment_boundary(self) -> None:
        self.assertEqual(next_turn_limit(12, 12), 24)
        self.assertEqual(next_turn_limit(24, 12), 36)

    def test_source_delta_survives_restart_before_test_and_review(self) -> None:
        before = {"api.py": "a", "api.test.py": "same"}
        after = {"api.py": "b", "api.test.py": "same"}
        self.assertEqual(changed_source_paths(before, after), ["api.py"])
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            store.state.setdefault("iterationStartHashes", {})["1"] = before
            store.commit_state()
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=True) as store:
            saved_before = store.state["iterationStartHashes"]["1"]
            self.assertEqual(changed_source_paths(saved_before, after), ["api.py"])

    def test_reviewer_source_paths_include_prior_iteration_changes(self) -> None:
        iterations = [
            {"iteration": 1, "changedPaths": ["apps/web/server/routers/skills.ts"]},
            {"iteration": 2, "changedPaths": ["python-backend/app/services/openai_agents_adapter.py"]},
        ]
        self.assertEqual(
            cumulative_source_paths(iterations, ["apps/web/server/services/runtime.ts"]),
            [
                "apps/web/server/routers/skills.ts",
                "apps/web/server/services/runtime.ts",
                "python-backend/app/services/openai_agents_adapter.py",
            ],
        )

    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.evidence = Path(self.temp.name) / "evidence"
        self.run_id = str(uuid.uuid4())
        with DurableRunStore(self.evidence, run_id=self.run_id, initial_state={
            "runId": self.run_id, "status": "running", "developmentIteration": 0,
            "iterationInProgress": True, "humanInterventions": 0,
        }):
            pass

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_review_and_test_findings_become_a_durable_next_iteration(self) -> None:
        findings = ["Review: render missing zero state", "Test failure: expected 200, got 500"]
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            # A productive continuation is not counted as a process restart.
            store.continue_development(iteration=1, findings=findings, reason="review and tests found repair work")
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            self.assertEqual(store.state["status"], "PARTIAL_CONTINUABLE")
            self.assertEqual(store.state["developmentIteration"], 1)
            self.assertFalse(store.state["iterationInProgress"])
            self.assertEqual(store.state["lastFindings"], findings)
            self.assertEqual(store.state["restartCount"], 0)
            store.state["developmentIteration"] += 1
            store.state["iterationInProgress"] = True
            store.commit_state()
            store.event("development.repair_input.bound", {
                "iteration": 2, "reviewerFindings": findings[:1], "testFailures": findings[1:],
            }, stable_key="development:repair-input:2")
        events = [json.loads(row) for row in (self.evidence / "events.jsonl").read_text().splitlines()]
        repair = next(event for event in events if event["kind"] == "development.repair_input.bound")
        self.assertEqual(repair["payload"]["reviewerFindings"], [findings[0]])
        self.assertEqual(repair["payload"]["testFailures"], [findings[1]])

    def test_capacity_exhaustion_waits_and_resumes_without_ending_the_workunit(self) -> None:
        class RateLimitError(Exception):
            status_code = 429

        self.assertTrue(is_capacity_error(RateLimitError("too many requests")))
        self.assertFalse(is_capacity_error(ValueError("syntax error")))
        now = datetime(2026, 10, 13, tzinfo=timezone.utc)
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            retry_after = capacity_retry_after(store.state, now_utc=now)
            store.wait_for_capacity(retry_after=retry_after, detail="Codex subscription rate limit")
            self.assertEqual(store.state["status"], "WAITING_CAPACITY")
            self.assertEqual(store.state["retryAfter"], "2026-10-13T00:00:30+00:00")
            self.assertEqual(store.state["developmentIteration"], 0)
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            self.assertEqual(store.state["status"], "WAITING_CAPACITY")
            self.assertEqual(store.state["capacityWaitCount"], 1)
            # Simulate the automatic wakeup after capacity is restored.
            store.state["status"] = "running"
            store.state.pop("retryAfter", None)
            store.commit_state()
            store.event("run.capacity_restored", {"iteration": 0}, stable_key="capacity-restored:1")
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            self.assertEqual(store.state["status"], "running")
            self.assertEqual(store.state["developmentIteration"], 0)
            self.assertEqual(store.state["restartCount"], 0)

    def test_process_restart_keeps_phase_identity_but_increments_only_restart_count(self) -> None:
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=True) as store:
            phase_id = store.phase_id("implementation", 7)
            self.assertEqual(store.state["restartCount"], 1)
            self.assertEqual(store.state["developmentIteration"], 0)
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False) as store:
            self.assertEqual(store.phase_id("implementation", 7), phase_id)
            self.assertEqual(store.state["restartCount"], 1)


if __name__ == "__main__":
    unittest.main()
