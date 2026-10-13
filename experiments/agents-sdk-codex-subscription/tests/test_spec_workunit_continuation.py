from __future__ import annotations

import sys
import sqlite3
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_spec_workunit import (
    repeated_patch_rejection_for_phase,
    repeated_patch_rejection_reason,
    unexecuted_patch_dispatch_streak,
)


class RepeatedPatchRejectionTests(unittest.TestCase):
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
