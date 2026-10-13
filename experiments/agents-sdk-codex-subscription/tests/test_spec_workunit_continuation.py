from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from run_spec_workunit import repeated_patch_rejection_reason


class RepeatedPatchRejectionTests(unittest.TestCase):
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
