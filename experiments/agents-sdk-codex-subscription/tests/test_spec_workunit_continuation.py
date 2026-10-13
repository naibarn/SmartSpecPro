from __future__ import annotations

import sys
import sqlite3
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_spec_workunit import repeated_patch_rejection_for_phase, repeated_patch_rejection_reason


class RepeatedPatchRejectionTests(unittest.TestCase):
    def test_rejection_scan_uses_tool_phase_identity_not_agents_runstate_uuid(self) -> None:
        connection = sqlite3.connect(":memory:")
        connection.row_factory = sqlite3.Row
        connection.execute("CREATE TABLE tool_receipts (phase_id TEXT, tool TEXT, status TEXT, result_json TEXT)")
        connection.executemany(
            "INSERT INTO tool_receipts VALUES(?,?,?,?)",
            [
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}'),
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}'),
                ("implementation-2", "patch_file", "superseded", '{"error":"Patch marker mismatch"}'),
                ("agents-runstate-uuid", "patch_file", "superseded", '{"error":"unrelated"}'),
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


if __name__ == "__main__":
    unittest.main()
