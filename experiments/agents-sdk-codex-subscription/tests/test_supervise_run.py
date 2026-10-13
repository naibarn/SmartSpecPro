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
