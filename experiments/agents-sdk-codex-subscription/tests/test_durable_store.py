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

    def test_stable_ids_reject_payload_conflicts(self):
        with DurableRunStore(self.evidence, run_id=self.run_id, resume=True) as store:
            store.event("human.intervention.note", {"reason": "asked"}, actor="human", stable_key="human:1")
            self.assertEqual(store.state["humanInterventions"], 1)
            with self.assertRaisesRegex(RuntimeError, "reused"):
                store.event("human.intervention.note", {"reason": "different"}, actor="human", stable_key="human:1")

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
