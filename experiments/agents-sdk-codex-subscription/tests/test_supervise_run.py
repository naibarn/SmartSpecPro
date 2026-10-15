from __future__ import annotations

import json
import signal
import subprocess
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from durable_store import DurableRunStore
import supervise_run
from supervise_run import continuation_result, record_operator_signal


class SupervisorTelemetryTests(unittest.TestCase):
    def test_partial_iterations_and_quota_waits_are_continuations_not_terminal_failures(self) -> None:
        self.assertTrue(continuation_result(75, "PARTIAL_CONTINUABLE"))
        self.assertTrue(continuation_result(75, "WAITING_CAPACITY"))
        self.assertFalse(continuation_result(1, "PARTIAL_CONTINUABLE"))
        self.assertFalse(continuation_result(1, "WAITING_CAPACITY"))
        self.assertFalse(continuation_result(1, "VERIFIED_COMPLETE"))
        self.assertFalse(continuation_result(1, "BLOCKED_EXTERNAL"))

    def test_supervisor_does_not_spin_when_contract_binding_rejects_continuation(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            evidence = Path(temp) / "evidence"
            contract = Path(temp) / "workunit-contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                with DurableRunStore(evidence, run_id=run_id, initial_state={
                    "runId": run_id, "status": "PARTIAL_CONTINUABLE", "developmentIteration": 8,
                    "iterationInProgress": False,
                }):
                    pass
                return subprocess.CompletedProcess(
                    command, 1, "", "RuntimeError: Resumed run contract/workspace binding differs from its original state",
                )

            with patch.object(supervise_run.subprocess, "run", side_effect=fake_run), patch.object(supervise_run.time, "sleep"):
                self.assertEqual(supervise_run.main([
                    "--workspace", str(workspace), "--spec-contract", str(contract),
                    "--evidence-dir", str(evidence),
                ]), 1)

            self.assertEqual(len(calls), 1)
            state = json.loads((evidence / "run-state.json").read_text())
            self.assertEqual(state["status"], "BLOCKED_EXTERNAL")
            self.assertEqual(state["developmentIteration"], 8)
            self.assertTrue(any(event["kind"] == "workunit.contract_reconciliation_required" for event in state["lifecycleEvents"]))
            receipt = json.loads((evidence / "recovery-receipt.json").read_text())
            self.assertEqual(receipt["supervisorResult"], "BLOCKED_EXTERNAL")
            self.assertEqual(receipt["continuationProcessCount"], 0)

    def test_supervisor_resumes_crashed_process_with_same_run_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            evidence = Path(temp) / "evidence"
            contract = Path(temp) / "workunit-contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                if len(calls) == 1:
                    with DurableRunStore(evidence, run_id=run_id, initial_state={
                        "runId": run_id, "status": "running", "developmentIteration": 3,
                        "iterationInProgress": True,
                    }):
                        pass
                    return subprocess.CompletedProcess(command, -9, "", "simulated process kill")
                with DurableRunStore(evidence, run_id=run_id, resume=True) as store:
                    store.finish_run(True, terminal_status="VERIFIED_COMPLETE")
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch.object(supervise_run.subprocess, "run", side_effect=fake_run), patch.object(supervise_run.time, "sleep"):
                self.assertEqual(supervise_run.main([
                    "--workspace", str(workspace), "--spec-contract", str(contract),
                    "--evidence-dir", str(evidence),
                ]), 0)
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0][calls[0].index("--run-id") + 1], calls[1][calls[1].index("--run-id") + 1])
            self.assertIn("--resume", calls[1])
            state = json.loads((evidence / "run-state.json").read_text())
            self.assertEqual(state["restartCount"], 1)
            self.assertEqual(state["developmentIteration"], 3)
            receipt = json.loads((evidence / "recovery-receipt.json").read_text())
            self.assertEqual(receipt["restartCount"], 1)
            self.assertEqual(receipt["processCount"], 2)

    def test_supervisor_waits_for_capacity_then_continues_without_counting_restart(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            evidence = Path(temp) / "evidence"
            contract = Path(temp) / "workunit-contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                if len(calls) == 1:
                    with DurableRunStore(evidence, run_id=run_id, initial_state={
                        "runId": run_id, "status": "running", "developmentIteration": 0,
                        "iterationInProgress": True,
                    }) as store:
                        store.wait_for_capacity(retry_after="2000-01-01T00:00:00+00:00", detail="simulated quota exhaustion")
                    return subprocess.CompletedProcess(command, 75, "", "")
                with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                    store.state["status"] = "running"
                    store.commit_state()
                    store.finish_run(True, terminal_status="VERIFIED_COMPLETE")
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch.object(supervise_run.subprocess, "run", side_effect=fake_run), patch.object(supervise_run.time, "sleep"):
                self.assertEqual(supervise_run.main([
                    "--workspace", str(workspace), "--spec-contract", str(contract),
                    "--evidence-dir", str(evidence),
                ]), 0)
            self.assertEqual(len(calls), 2)
            self.assertIn("--continuation", calls[1])
            state = json.loads((evidence / "run-state.json").read_text())
            self.assertEqual(state["restartCount"], 0)
            self.assertEqual(state["developmentIteration"], 0)
            receipt = json.loads((evidence / "recovery-receipt.json").read_text())
            self.assertEqual(receipt["continuationProcessCount"], 1)

    def test_canonical_budget_and_capacity_waits_release_supervisor_without_local_sleep(self) -> None:
        for status, reason in (("WAITING_BUDGET", "budget"), ("WAITING_CAPACITY", "provider_capacity")):
            with self.subTest(status=status), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                workspace = root / "workspace"
                workspace.mkdir()
                evidence = root / "evidence"
                contract = root / "contract.json"
                contract.write_text("{}", encoding="utf-8")
                calls = []

                def fake_wait(command, **_kwargs):
                    calls.append(command)
                    run_id = command[command.index("--run-id") + 1]
                    with DurableRunStore(evidence, run_id=run_id, initial_state={
                        "runId": run_id, "status": "running", "canonicalModelAdmissionRequired": True,
                    }) as store:
                        if status == "WAITING_BUDGET":
                            store.wait_for_budget(next_eligible_at="2099-01-01T00:00:00+00:00",
                                                  operation_key="operation-1", canonical_scheduler_owned=True)
                        else:
                            store.wait_for_capacity(retry_after="2099-01-01T00:00:00+00:00",
                                                    detail="mock provider reset", canonical_scheduler_owned=True)
                    return subprocess.CompletedProcess(command, 75, "", "")

                original_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
                with patch.object(sys, "argv", ["supervise_run.py", "--workspace", str(workspace),
                          "--spec-contract", str(contract), "--evidence-dir", str(evidence),
                          "--canonical-admission-fd", "91"]), \
                     patch.object(supervise_run.subprocess, "run", side_effect=fake_wait), \
                     patch.object(supervise_run.time, "sleep") as sleep, \
                     patch.object(supervise_run.signal, "signal", side_effect=lambda sig, _handler: original_handlers[sig]):
                    self.assertEqual(supervise_run.main(), 75)
                self.assertEqual(len(calls), 1)
                sleep.assert_not_called()
                state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
                self.assertEqual(state["status"], status)
                self.assertTrue(state["canonicalWaitPersisted"])
                self.assertEqual(state["canonicalWaitReason"], reason)
                receipt = json.loads((evidence / "recovery-receipt.json").read_text(encoding="utf-8"))
                self.assertEqual(receipt["supervisorResult"], "DEFERRED_CANONICAL_WAIT")

    def test_canonical_wait_without_new_durable_scheduler_ack_fails_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            workspace.mkdir()
            evidence = root / "evidence"
            contract = root / "contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls = []

            def fake_unacknowledged_wait(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                with DurableRunStore(evidence, run_id=run_id, initial_state={
                    "runId": run_id, "status": "WAITING_CAPACITY", "canonicalModelAdmissionRequired": True,
                }):
                    pass
                return subprocess.CompletedProcess(command, 75, "", "")

            original_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
            with patch.object(sys, "argv", ["supervise_run.py", "--workspace", str(workspace),
                      "--spec-contract", str(contract), "--evidence-dir", str(evidence),
                      "--canonical-admission-fd", "91"]), \
                 patch.object(supervise_run.subprocess, "run", side_effect=fake_unacknowledged_wait), \
                 patch.object(supervise_run.time, "sleep") as sleep, \
                 patch.object(supervise_run.signal, "signal", side_effect=lambda sig, _handler: original_handlers[sig]):
                self.assertEqual(supervise_run.main(), 1)
            self.assertEqual(len(calls), 1)
            sleep.assert_not_called()
            receipt = json.loads((evidence / "recovery-receipt.json").read_text(encoding="utf-8"))
            self.assertEqual(receipt["supervisorResult"], "FAILED")
            self.assertIn("no newly acknowledged durable scheduler wait", receipt["reason"])

    def test_scheduler_claim_skips_prior_multi_day_local_capacity_sleep(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            workspace = root / "workspace"
            workspace.mkdir()
            evidence = root / "evidence"
            contract = root / "contract.json"
            contract.write_text("{}", encoding="utf-8")
            run_id = str(uuid.uuid4())
            with DurableRunStore(evidence, run_id=run_id, initial_state={
                "runId": run_id, "status": "WAITING_CAPACITY", "canonicalModelAdmissionRequired": True,
                "canonicalWaitPersisted": True, "canonicalWaitReason": "provider_capacity",
                "canonicalWaitSequence": 1, "retryAfter": "2099-01-01T00:00:00+00:00",
            }):
                pass

            def finish_resumed_run(command, **_kwargs):
                with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                    store.state["status"] = "running"
                    store.finish_run(True, terminal_status="VERIFIED_COMPLETE")
                return subprocess.CompletedProcess(command, 0, "", "")

            original_handlers = {sig: signal.getsignal(sig) for sig in (signal.SIGINT, signal.SIGTERM)}
            with patch.object(sys, "argv", ["supervise_run.py", "--workspace", str(workspace),
                      "--spec-contract", str(contract), "--evidence-dir", str(evidence), "--run-id", run_id,
                      "--canonical-admission-fd", "91"]), \
                 patch.object(supervise_run.subprocess, "run", side_effect=finish_resumed_run), \
                 patch.object(supervise_run.signal, "signal", side_effect=lambda sig, _handler: original_handlers[sig]), \
                 patch.object(supervise_run.time, "sleep") as sleep:
                self.assertEqual(supervise_run.main(), 0)
            sleep.assert_not_called()

    def test_supervisor_runs_one_diagnostic_replan_for_exit_75_without_progress(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            evidence = Path(temp) / "evidence"
            contract = Path(temp) / "contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                if len(calls) == 1:
                    with DurableRunStore(evidence, run_id=run_id, initial_state={
                        "runId": run_id, "status": "running", "developmentIteration": 1,
                        "iterationInProgress": False, "iterations": [],
                    }) as store:
                        store.continue_development(iteration=1, findings=["planner phase emitted no progress"],
                                                   reason="diagnostic replan needed")
                        phase = store.phase_id("planning", 0)
                        store.reserve_model_call("model-only-progress", phase, "planner", {"input": "same plan"})
                        store.update_model_call("model-only-progress", event="model.call.completed", stable_suffix="completed",
                                                status="completed", thread_id="thread-only", turn_id="turn-only")
                    return subprocess.CompletedProcess(command, 75, "", "")
                self.assertIn("--diagnose-no-progress", command)
                with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                    phase = store.phase_id("planning-1", 0)
                    store.reserve_model_call("diagnostic-turn", phase, "planner_2", {"input": "diagnose"})
                    store.update_model_call("diagnostic-turn", event="model.call.completed", stable_suffix="completed",
                                            status="completed", thread_id="thread", turn_id="turn-diagnostic")
                    store.finish_run(True, terminal_status="VERIFIED_COMPLETE")
                return subprocess.CompletedProcess(command, 0, "", "")

            with patch.object(supervise_run.subprocess, "run", side_effect=fake_run), patch.object(supervise_run.time, "sleep"):
                self.assertEqual(supervise_run.main([
                    "--workspace", str(workspace), "--spec-contract", str(contract),
                    "--evidence-dir", str(evidence),
                ]), 0)
            self.assertEqual(len(calls), 2)
            state = json.loads((evidence / "run-state.json").read_text())
            self.assertIn("VERIFIED_COMPLETE", [event.get("payload", {}).get("status") for event in state["lifecycleEvents"]
                                                  if event["kind"] == "run.completed"])

    def test_supervisor_stops_after_diagnostic_replan_also_makes_no_progress(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            workspace = Path(temp) / "workspace"
            workspace.mkdir()
            evidence = Path(temp) / "evidence"
            contract = Path(temp) / "contract.json"
            contract.write_text("{}", encoding="utf-8")
            calls: list[list[str]] = []

            def fake_run(command, **_kwargs):
                calls.append(command)
                run_id = command[command.index("--run-id") + 1]
                if len(calls) == 1:
                    with DurableRunStore(evidence, run_id=run_id, initial_state={
                        "runId": run_id, "status": "running", "developmentIteration": 1,
                        "iterationInProgress": False, "iterations": [],
                    }) as store:
                        store.continue_development(iteration=1, findings=["stalled"], reason="replan")
                else:
                    self.assertIn("--diagnose-no-progress", command)
                    with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                        store.continue_development(iteration=1, findings=["still stalled"], reason="replan")
                return subprocess.CompletedProcess(command, 75, "", "")

            with patch.object(supervise_run.subprocess, "run", side_effect=fake_run), patch.object(supervise_run.time, "sleep"):
                self.assertEqual(supervise_run.main([
                    "--workspace", str(workspace), "--spec-contract", str(contract),
                    "--evidence-dir", str(evidence),
                ]), 1)
            self.assertEqual(len(calls), 2)
            state = json.loads((evidence / "run-state.json").read_text())
            self.assertTrue(any(event["kind"] == "supervisor.no_progress_repair_exhausted" for event in state["lifecycleEvents"]))
            receipt = json.loads((evidence / "recovery-receipt.json").read_text())
            self.assertEqual(receipt["supervisorResult"], "FAILED")

    def test_operator_intervention_count_is_projected_from_human_signal_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            run_id = str(uuid.uuid4())
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}):
                pass

            record_operator_signal(evidence, run_id, signal.SIGINT)
            state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["humanInterventions"], 1)
            self.assertEqual(
                [event["kind"] for event in state["lifecycleEvents"] if event["actor"] == "human"],
                ["human.intervention.signal_received"],
            )

    def test_automatic_restart_does_not_count_as_human_intervention(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            run_id = str(uuid.uuid4())
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}):
                pass
            with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                store.event("supervisor.restart_scheduled", {"restart": 1}, stable_key="restart:1")
            state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["humanInterventions"], 0)


if __name__ == "__main__":
    unittest.main()
