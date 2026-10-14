from __future__ import annotations

import sys
import sqlite3
import json
import subprocess
import tempfile
import unittest
import uuid
from types import SimpleNamespace
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_spec_workunit import (
    REPLANNER_INSTRUCTIONS,
    contract_scope_snapshot,
    iteration_evidence_summary,
    prior_contract_scope_from_model_calls,
    reconcile_interrupted_write_intents,
    repeated_patch_rejection_for_phase,
    repeated_patch_rejection_reason,
    source_diff_from_baseline,
    unexecuted_patch_dispatch_streak,
)
from durable_store import DurableRunStore


class RepeatedPatchRejectionTests(unittest.TestCase):
    def test_contract_scope_snapshot_allows_guidance_refresh_but_binds_authority(self) -> None:
        original = {
            "specId": "SPEC-038", "workUnit": "COST_BY_SKILL", "requirementId": "REQ-0123456789AB",
            "allowedFiles": ["apps/web/a.ts"], "writableFiles": ["apps/web/a.ts"],
            "acceptanceCriteria": ["Persist tenant-safe usage"],
            "implementationGuidance": "Initial trusted guidance", "budget": {"implementationMaxTurns": 4},
        }
        refreshed = {**original, "implementationGuidance": "Additional recovery note", "budget": {"implementationMaxTurns": 8}}
        self.assertEqual(contract_scope_snapshot(original), contract_scope_snapshot(refreshed))
        widened = {**refreshed, "writableFiles": ["apps/web/a.ts", "apps/web/b.ts"]}
        self.assertNotEqual(contract_scope_snapshot(original), contract_scope_snapshot(widened))
        changed_acceptance = {**refreshed, "acceptanceCriteria": ["Skip tenant checks"]}
        self.assertNotEqual(contract_scope_snapshot(original), contract_scope_snapshot(changed_acceptance))


class DeveloperRecoveryEvidenceTests(unittest.TestCase):
    def test_source_diff_includes_allowlisted_untracked_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            subprocess.run(["git", "init", "-q"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.email", "test@example.invalid"], cwd=root, check=True)
            subprocess.run(["git", "config", "user.name", "Test"], cwd=root, check=True)
            (root / "tracked.txt").write_text("base\n")
            subprocess.run(["git", "add", "tracked.txt"], cwd=root, check=True)
            subprocess.run(["git", "commit", "-qm", "base"], cwd=root, check=True)
            base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root, text=True, capture_output=True, check=True).stdout.strip()
            (root / "new-allowlisted.txt").write_text("new task output\n")
            paths, diff = source_diff_from_baseline(SimpleNamespace(root=root, source_revision=base, allowed_files=("tracked.txt", "new-allowlisted.txt")))
            self.assertEqual(paths, ["new-allowlisted.txt"])
            self.assertIn("new task output", diff)

    def test_interrupted_write_reconciliation_records_exact_effect_without_rewriting(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            target = root / "output.txt"
            content = "durable result\n"
            target.write_text(content)
            run_id = str(uuid.uuid4())
            with DurableRunStore(root / "evidence", run_id=run_id, initial_state={"runId": run_id, "status": "running"}) as store:
                operation = str(uuid.uuid4())
                store.begin_tool(operation, "implementation-1", "write_file", {"path": "output.txt", "content": content})
                settled = reconcile_interrupted_write_intents(store, SimpleNamespace(root=root, writable_files=("output.txt",)))
                self.assertEqual(settled[0]["status"], "RECOVERED_EXACT_EFFECT")
                receipt = store.get_tool_receipt(operation)
                self.assertEqual(receipt["status"], "completed")
                self.assertEqual(target.read_text(), content)
                self.assertEqual(store.pending_tool_receipts(), [])

    def test_legacy_contract_scope_is_recovered_from_durable_planner_request(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            run_id = str(uuid.uuid4())
            scope = {
                "specId": "SPEC-038", "workUnit": "COST_BY_SKILL", "requirementId": "REQ-0123456789AB",
                "allowedFiles": ["apps/web/a.ts"], "writableFiles": ["apps/web/a.ts"],
                "authority": {"gateway": False}, "tests": {"runner": "vitest"},
            }
            payload = {"workunit_scope": scope, "canonical_requirement": "Exact requirement", "acceptanceCriteria": ["Persist usage"]}
            instruction = "planner preamble\nRequest JSON:\n" + json.dumps({"input": [{"content": json.dumps(payload)}]})
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}) as store:
                store.reserve_model_call("call-1", "phase-1", "planner_1", {"instruction": instruction})
                restored = prior_contract_scope_from_model_calls(store)
            expected = contract_scope_snapshot({
                **scope, "requirementText": "Exact requirement", "acceptanceCriteria": ["Persist usage"],
            })
            self.assertEqual(restored, expected)

    def test_review_evidence_includes_prior_iteration_source_and_test_receipts(self) -> None:
        evidence = iteration_evidence_summary([
            {
                "iteration": 3,
                "changedPaths": ["python-backend/app/services/openai_agents_adapter.py"],
                "testReceipt": {
                    "exitCode": 0,
                    "revision": "revision-3",
                    "sourceRevision": "base-sha",
                    "stdout": "large logs are intentionally omitted",
                },
            },
            {"iteration": 4, "changedPaths": ["apps/web/server/routers/skills.ts"]},
        ])

        self.assertEqual(evidence[0]["iteration"], 3)
        self.assertEqual(evidence[0]["changedPaths"], ["python-backend/app/services/openai_agents_adapter.py"])
        self.assertEqual(evidence[0]["test"], {
            "exitCode": 0,
            "revision": "revision-3",
            "sourceRevision": "base-sha",
            "changedPaths": [],
        })
        self.assertEqual(evidence[1]["test"]["exitCode"], None)

    def test_replanner_distinguishes_its_read_only_tools_from_implementer_tools(self) -> None:
        self.assertIn("This planner receives read-only tools", REPLANNER_INSTRUCTIONS)
        self.assertIn("implementation phase receives scoped patch_file and write_file tools", REPLANNER_INSTRUCTIONS)
        self.assertIn("never shell or an alternate write channel", REPLANNER_INSTRUCTIONS)

    def test_unexecuted_patch_dispatches_are_counted_separately_from_tool_receipts(self) -> None:
        calls = [
            {"updated_at": "1", "response_text": '{"action":"call_tool","name":"patch_file"}'},
            {"updated_at": "2", "response_text": '{"action":"call_tool","name":"patch_file"}'},
            {"updated_at": "3", "response_text": '{"action":"call_tool","name":"patch_file"}'},
        ]
        self.assertEqual(unexecuted_patch_dispatch_streak(calls, []), 3)

    def test_executed_patch_receipt_and_different_action_reset_dispatch_streak(self) -> None:
        calls = [
            {"updated_at": "1", "response_text": '{"action":"call_tool","name":"patch_file"}'},
            {"updated_at": "2", "response_text": '{"action":"call_tool","name":"patch_file"}'},
            {"updated_at": "3", "response_text": '{"action":"call_tool","name":"patch_file"}'},
            {"updated_at": "4", "response_text": '{"action":"call_tool","name":"read_file"}'},
        ]
        receipts = [{"updated_at": "2.5"}]
        self.assertEqual(unexecuted_patch_dispatch_streak(calls, receipts), 0)

    def test_rejection_scan_uses_tool_phase_identity_not_agents_runstate_uuid(self) -> None:
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.execute("CREATE TABLE tool_receipts (phase_id TEXT, tool TEXT, status TEXT, result_json TEXT, updated_at TEXT)")
        connection.executemany(
            "INSERT INTO tool_receipts VALUES(?,?,?,?,?)",
            [
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}', "1"),
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}', "2"),
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}', "3"),
                ("agents-runstate-uuid", "patch_file", "superseded", '{"error":"unrelated"}', "4"),
            ],
        )
        store = type("Store", (), {"connection": connection})()
        self.assertEqual(repeated_patch_rejection_for_phase(store, "implementation", 2), ("Patch marker mismatch", 3))
        connection.close()

    def test_identical_rejections_request_a_new_development_plan(self) -> None:
        receipts = [
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Patch context matched 3 times"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Patch context matched 3 times"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Patch context matched 3 times"}'},
        ]
        self.assertEqual(repeated_patch_rejection_reason(receipts), ("Patch context matched 3 times", 3))

    def test_distinct_rejections_and_successful_tools_do_not_trigger_replan(self) -> None:
        receipts = [
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Missing numbered hunk"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Patch context matched 3 times"}'},
            {"tool": "patch_file", "status": "completed", "result_json": '{"message":"Applied"}'},
            {"tool": "write_file", "status": "superseded", "result_json": '{"error":"Patch context matched 3 times"}'},
        ]
        self.assertIsNone(repeated_patch_rejection_reason(receipts))

    def test_numbered_context_rejections_are_grouped_across_line_shifts(self) -> None:
        receipts = [
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 6; refresh source and retry"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 671; refresh source and retry"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 1187; refresh source and retry"}'},
        ]
        self.assertEqual(
            repeated_patch_rejection_reason(receipts),
            ("Numbered patch context did not match at line 6; refresh source and retry", 3),
        )

    def test_successful_patch_resets_the_consecutive_rejection_streak(self) -> None:
        receipts = [
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 6; refresh source and retry"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 671; refresh source and retry"}'},
            {"tool": "patch_file", "status": "superseded", "result_json": '{"error":"Numbered patch context did not match at line 1187; refresh source and retry"}'},
            {"tool": "patch_file", "status": "completed", "result_json": '{"message":"Applied patch"}'},
        ]
        self.assertIsNone(repeated_patch_rejection_reason(receipts))


if __name__ == "__main__":
    unittest.main()
