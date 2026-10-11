"""Regression tests for exact-main build freshness and bounded retries."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from canonical_source import LifecycleError, build_latest_canonical


class CanonicalBuildRetryTests(unittest.TestCase):
    def run_sequence(self, sequence, **kwargs):
        with patch("canonical_source.build_canonical", side_effect=sequence) as builder:
            result = build_latest_canonical(Path("/nonexistent/fixture"),
                                            command=["true"], **kwargs)
            return result, builder.call_count

    def test_one_stale_build_is_replaced_by_latest_success(self):
        result, calls = self.run_sequence([
            {"status": "STALE_CANONICAL_ADVANCED", "source_revision": "old", "exit_code": 0},
            {"status": "BUILD_PASSED", "source_revision": "latest", "exit_code": 0},
        ])
        self.assertEqual((result["status"], result["source_revision"], result["build_attempts"], calls),
                         ("BUILD_PASSED", "latest", 2, 2))

    def test_endless_source_advances_are_bounded_and_never_pass(self):
        result, calls = self.run_sequence([
            {"status": "STALE_CANONICAL_ADVANCED", "source_revision": str(i), "exit_code": 0}
            for i in range(3)
        ])
        self.assertEqual((result["status"], result["build_attempts"], calls),
                         ("STALE_CANONICAL_ADVANCED", 3, 3))

    def test_resource_and_code_failures_do_not_trigger_rebuild_loop(self):
        for status in ("RESOURCE_BLOCKED", "BUILD_FAILED"):
            with self.subTest(status=status):
                result, calls = self.run_sequence([{"status": status, "exit_code": 137 if status == "RESOURCE_BLOCKED" else 1}])
                self.assertEqual(result["status"], status)
                self.assertEqual(calls, 1)

    def test_zero_retry_ends_with_stale_status(self):
        result, calls = self.run_sequence(
            [{"status": "STALE_CANONICAL_ADVANCED", "exit_code": 0}],
            max_stale_rebuilds=0,
        )
        self.assertEqual((result["status"], calls), ("STALE_CANONICAL_ADVANCED", 1))

    def test_budget_is_bounded(self):
        with self.assertRaises(LifecycleError):
            build_latest_canonical(Path("/unused"), command=["true"], max_stale_rebuilds=10)


if __name__ == "__main__":
    unittest.main()
