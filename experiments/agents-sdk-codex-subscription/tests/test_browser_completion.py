from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_spec_workunit import browser_source_hash, project_browser_uat, terminal_workunit_status


class BrowserCompletionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "demo").mkdir()
        (self.root / "demo/index.html").write_text("<main>demo</main>", encoding="utf-8")
        (self.root / "demo/app.js").write_text("document.body.dataset.ready = 'yes';", encoding="utf-8")
        self.contract = SimpleNamespace(
            browser_uat={"status": "configured", "projectPath": "demo"},
            allowed_files=("demo/index.html", "demo/app.js", "tests/test_demo.py"),
            root=self.root,
            task_id="task-1",
            workspace_id="workspace-1",
            source_revision="a" * 40,
        )

    def tearDown(self):
        self.temp.cleanup()

    def receipt(self, **overrides):
        result = {
            "schema": "agents-sdk-miniapp-browser-uat.v1",
            "runId": "run-1",
            "taskId": "task-1",
            "workspaceId": "workspace-1",
            "workspace": str(self.root),
            "sourceRevision": "a" * 40,
            "projectPath": "demo",
            "contractSourceSha256": browser_source_hash(self.contract),
            "sourceSha256": browser_source_hash(self.contract),
            "result": "PASS",
            "pageErrors": [],
            "unexpectedConsoleErrors": [],
            "blockedExternalRequests": [],
            "operationId": "browser-op-1",
            "toolOperationId": "op-1",
            "runner": {"exitCode": 0},
        }
        result.update(overrides)
        return {"operation_id": "op-1", "status": "completed", "result": result}

    def test_browser_pass_and_independent_verification_complete(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt()], [])
        self.assertEqual(projected["status"], "PASS")
        self.assertTrue(projected["completedToolReceipt"])
        self.assertEqual(projected["pendingToolReceiptCount"], 0)
        self.assertEqual(terminal_workunit_status(True, False, True, projected["status"], 0), "VERIFIED_COMPLETE")

    def test_browser_pass_does_not_complete_normative_acceptance(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt()], [])
        self.assertEqual(projected["status"], "PASS")
        self.assertEqual(terminal_workunit_status(False, True, True, projected["status"], 0), "IMPLEMENTED_READY_FOR_USER_TEST")

    def test_browser_failed_receipt_stays_failed(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt(result="FAIL")], [])
        self.assertEqual(projected["status"], "FAILED")
        self.assertEqual(terminal_workunit_status(True, False, True, projected["status"], 0), "awaiting_browser_uat")

    def test_pending_tool_receipt_prevents_browser_pass_projection(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt()], [{"tool": "read_file"}])
        self.assertEqual(projected["status"], "PENDING")
        self.assertEqual(projected["pendingToolReceiptCount"], 1)
        self.assertEqual(terminal_workunit_status(True, False, True, projected["status"], 1), "PARTIAL_CONTINUABLE")

    def test_missing_browser_receipt_is_pending(self):
        self.assertEqual(project_browser_uat(self.contract, "run-1", [], [])["status"], "PENDING")

    def test_wrong_source_receipt_is_rejected(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt(sourceRevision="b" * 40)], [])
        self.assertEqual(projected["status"], "FAILED")
        self.assertIn("sourceRevision", projected["mismatchedBindings"])

    def test_resume_does_not_reuse_receipt_from_another_run(self):
        projected = project_browser_uat(self.contract, "run-2", [self.receipt()], [])
        self.assertEqual(projected["status"], "FAILED")
        self.assertIn("runId", projected["mismatchedBindings"])

    def test_receipt_for_old_workspace_is_rejected(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt(workspaceId="workspace-old")], [])
        self.assertEqual(projected["status"], "FAILED")
        self.assertIn("workspaceId", projected["mismatchedBindings"])

    def test_tool_operation_id_must_match_durable_receipt(self):
        projected = project_browser_uat(self.contract, "run-1", [self.receipt(toolOperationId="other-op")], [])
        self.assertEqual(projected["status"], "FAILED")
        self.assertIn("toolOperationId", projected["mismatchedBindings"])


if __name__ == "__main__":
    unittest.main()
