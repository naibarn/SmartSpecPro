import multiprocessing
import tempfile
import unittest
import uuid
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from durable_store import DurableRunStore
from durable_store import digest
from run_experiment import BROWSER_UAT, ToolBox, reconcile_pending_tool_receipts


def _hold_store(path: str, run_id: str, ready, release) -> None:
    with DurableRunStore(Path(path), run_id=run_id, resume=True):
        ready.set()
        release.wait(5)


class DurableRunStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.evidence = Path(self.temp.name) / "evidence"
        self.run_id = "12345678-1234-5678-1234-567812345678"
        self.state = {"runId": self.run_id, "status": "running", "mode": "test"}
        with DurableRunStore(self.evidence, run_id=self.run_id, initial_state=self.state):
            pass

    def tearDown(self):
        self.temp.cleanup()

    def test_phase_checkpoint_and_receipts_survive_reopen(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            phase = store.start_phase("plan", 0, {"goal": "x"}, 3)
            store.save_checkpoint(phase["phase_id"], {"agent": {"run_id": "r"}})
            intent = store.begin_tool("op-1", phase["phase_id"], "write_file", {"path": "a", "text": "x"})
            self.assertEqual(intent["status"], "intent")
            store.complete_tool("op-1", {"sha256": "abc"}, effect_hash="abc")
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            phase = store.get_phase(store.phase_id("plan"))
            self.assertEqual(phase["checkpoint_revision"], 1)
            self.assertEqual(store.get_tool_receipt("op-1")["status"], "completed")
            self.assertEqual(store.state["restartCount"], 2)
            self.assertEqual(store.state["humanInterventions"], 0)

    def test_identical_checkpoint_hash_does_not_create_revision_event_or_export(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            phase = store.start_phase("dedup", 0, {"goal": "x"}, 3)
            checkpoint = {"agent": {"run_id": "stable", "turns": []}}
            self.assertTrue(store.save_checkpoint(phase["phase_id"], checkpoint))
            before_events = store.connection.execute("SELECT COUNT(*) FROM events WHERE kind='agents.run_state.checkpointed'").fetchone()[0]
            exports = 0
            original_export = store.export
            def count_export():
                nonlocal exports
                exports += 1
                original_export()
            store.export = count_export
            self.assertFalse(store.save_checkpoint(phase["phase_id"], checkpoint))
            self.assertEqual(exports, 0)
            current = store.get_phase(phase["phase_id"])
            self.assertEqual(current["checkpoint_revision"], 1)
            self.assertEqual(store.connection.execute("SELECT COUNT(*) FROM events WHERE kind='agents.run_state.checkpointed'").fetchone()[0], before_events)
            self.assertTrue(store.save_checkpoint(phase["phase_id"], {"agent": {"run_id": "stable", "turns": [1]}}))
            self.assertEqual(store.get_phase(phase["phase_id"])["checkpoint_revision"], 2)

    def test_meaningful_progress_signature_changes_for_completed_turn_and_tool_receipt(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            before = store.meaningful_progress({"app.py": "a"})
            phase = store.phase_id("progress")
            store.reserve_model_call("progress-call", phase, "planner", {"input": "x"})
            store.update_model_call("progress-call", event="model.call.completed", stable_suffix="complete",
                                    status="completed", thread_id="thread", turn_id="turn")
            after_turn = store.meaningful_progress({"app.py": "a"})
            self.assertNotEqual(before, after_turn)
            self.assertEqual(after_turn["completedModelTurns"], 1)
            store.begin_tool("progress-tool", phase, "write_file", {"path": "app.py"})
            store.complete_tool("progress-tool", {"written": True}, effect_hash="new-source")
            after_tool = store.meaningful_progress({"app.py": "b"})
            self.assertEqual(after_tool["completedToolReceipts"], 1)
            self.assertNotEqual(after_turn, after_tool)
            store.state["iterations"] = [{"iteration": 1, "testReceipt": {"exitCode": 0, "revision": "source-sha"}}]
            after_test = store.meaningful_progress({"app.py": "b"})
            self.assertNotEqual(after_tool, after_test)
            self.assertEqual(after_test["verifiedTestOutcomes"][0]["exitCode"], 0)

    def test_stable_ids_reject_payload_conflicts(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            store.event("human.intervention.note", {"reason": "asked"}, actor="human", stable_key="human:1")
            self.assertEqual(store.state["humanInterventions"], 1)
            with self.assertRaisesRegex(RuntimeError, "reused"):
                store.event("human.intervention.note", {"reason": "different"}, actor="human", stable_key="human:1")

    def test_reusable_codex_thread_is_scoped_and_requires_completed_prior_call(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            implementation = store.phase_id("implementation", 1)
            review = store.phase_id("review", 1)
            store.reserve_model_call("call-1", implementation, "implementer", {"input": "first"})
            store.update_model_call(
                "call-1", event="model.call.completed", stable_suffix="completed",
                status="completed", thread_id="thread-implementation", turn_id="turn-1",
            )
            store.reserve_model_call("call-2", implementation, "implementer", {"input": "next"})
            store.reserve_model_call("call-review", review, "reviewer", {"input": "review"})
            self.assertEqual(
                store.reusable_model_thread(implementation, "implementer", exclude_call_id="call-2"),
                {"call_id": "call-1", "status": "completed", "thread_id": "thread-implementation", "turn_id": "turn-1"},
            )
            self.assertIsNone(store.reusable_model_thread(review, "reviewer", exclude_call_id="call-review"))

            store.reserve_model_call("call-unresolved", implementation, "implementer", {"input": "uncertain"})
            store.update_model_call(
                "call-unresolved", event="model.turn.started", stable_suffix="started",
                status="turn_running", thread_id="thread-implementation", turn_id="turn-2",
            )
            with self.assertRaisesRegex(RuntimeError, "unresolved model call"):
                store.reusable_model_thread(implementation, "implementer", exclude_call_id="call-2")

    def test_browser_pending_is_not_projected_as_completed(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            store.finish_run(False, terminal_status="awaiting_browser_uat")
            self.assertEqual(store.state["status"], "awaiting_browser_uat")
            self.assertIn("run.awaiting_browser_uat", [event["kind"] for event in store.state["lifecycleEvents"]])

    def test_concurrent_resume_is_denied(self):
        ctx = multiprocessing.get_context("fork")
        ready, release = ctx.Event(), ctx.Event()
        child = ctx.Process(target=_hold_store, args=(str(self.evidence), self.run_id, ready, release))
        child.start()
        try:
            self.assertTrue(ready.wait(3))
            with self.assertRaisesRegex(RuntimeError, "concurrent resume"):
                DurableRunStore(self.evidence, run_id=self.run_id, resume=True)
        finally:
            release.set()
            child.join(5)
        self.assertEqual(child.exitcode, 0)

    def test_write_effect_without_receipt_is_reconciled_without_rewriting(self):
        workspace = Path(self.temp.name) / "app"
        workspace.mkdir()
        with DurableRunStore(workspace / "evidence", run_id=self.run_id, initial_state={"runId": self.run_id, "status": "running"}) as store:
            phase_id = store.phase_id("implementation", 1)
            store.start_phase("implementation", 1, {"input": "x"}, 12)
            operation_input = {"path": "index.html", "content": "durable app source"}
            operation_id = str(uuid.uuid5(uuid.UUID(self.run_id), f"tool:{phase_id}:write_file:{digest(operation_input)}"))
            store.begin_tool(operation_id, phase_id, "write_file", operation_input)
            target = workspace / "index.html"
            target.write_text(operation_input["content"], encoding="utf-8")
            receipts = reconcile_pending_tool_receipts(workspace, store.state, store)
            self.assertEqual(receipts[0]["operationId"], operation_id)
            self.assertEqual(store.get_tool_receipt(operation_id)["status"], "completed")
            self.assertEqual(target.read_text(encoding="utf-8"), operation_input["content"])

    def test_changed_browser_harness_supersedes_stale_pending_receipt(self):
        workspace = Path(self.temp.name) / "miniapp"
        workspace.mkdir()
        (workspace / "index.html").write_text("<main>app</main>", encoding="utf-8")
        with DurableRunStore(workspace / "evidence", run_id=self.run_id, initial_state={"runId": self.run_id, "status": "running"}) as store:
            phase_id = store.phase_id("implementation", 1)
            store.start_phase("implementation", 1, {"input": "x"}, 12)
            toolbox = ToolBox(workspace, store.state, writable=False, store=store, phase_id=phase_id)
            operation_input = {
                "sourceSha256": toolbox._source_hash(),
                "harness": str(BROWSER_UAT),
                "harnessSha256": "stale-harness-digest",
            }
            operation_id = str(uuid.uuid5(uuid.UUID(self.run_id), f"tool:{phase_id}:run_browser_uat:{digest(operation_input)}"))
            store.begin_tool(operation_id, phase_id, "run_browser_uat", operation_input)
            reconcile_pending_tool_receipts(workspace, store.state, store)
            self.assertEqual(store.get_tool_receipt(operation_id)["status"], "superseded")
            self.assertEqual(store.pending_tool_receipts(), [])


if __name__ == "__main__":
    unittest.main()
