"""Focused tests for SPEC WorkUnit write receipts and scoped patching."""
from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from pathlib import Path

import run_spec_workunit as workunit


class FakeStore:
    def __init__(self) -> None:
        self.run_id = str(uuid.uuid4())
        self.state = {"sourceRevision": "test-revision"}
        self.receipts: dict[str, dict] = {}

    def begin_tool(self, operation_id: str, phase_id: str, name: str, value: dict) -> dict:
        return self.receipts.setdefault(operation_id, {"status": "intent"})

    def get_tool_receipt(self, operation_id: str) -> dict | None:
        return self.receipts.get(operation_id)

    def complete_tool(self, operation_id: str, result: dict, **_: object) -> None:
        self.receipts[operation_id] = {"status": "completed", "result_json": json.dumps(result)}

    def supersede_tool(self, operation_id: str, result: dict, **_: object) -> None:
        self.receipts[operation_id] = {"status": "superseded", "result_json": json.dumps(result)}


class ScopedPatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.relative = "apps/web/server/routers/contentQuality.ts"
        self.target = self.root / self.relative
        self.target.parent.mkdir(parents=True)
        self.target.write_text("alpha\nbeta\ngamma\n", encoding="utf-8")
        self.store = FakeStore()
        self.tools = workunit.ScopedRepoTools(self.store, "phase-test", writable=True)
        self.tools.root = self.root
        self.patch = (
            "*** Begin Patch\n"
            f"*** Update File: {self.relative}\n"
            "@@\n beta\n-gamma\n+delta\n"
            "*** End Patch"
        )

    def tearDown(self) -> None:
        self.temp.cleanup()

    def test_applies_exact_context_and_records_receipt(self) -> None:
        self.assertIn("Applied scoped patch", self.tools.patch_file(self.relative, self.patch))
        self.assertEqual(self.target.read_text(), "alpha\nbeta\ndelta\n")
        self.assertEqual(next(iter(self.store.receipts.values()))["status"], "completed")

    def test_repeated_operation_is_idempotent(self) -> None:
        first = self.tools.patch_file(self.relative, self.patch)
        second = self.tools.patch_file(self.relative, self.patch)
        self.assertIn("Applied", first)
        self.assertEqual(first, second)
        self.assertEqual(self.target.read_text(), "alpha\nbeta\ndelta\n")

    def test_rejects_ambiguous_context_without_writing(self) -> None:
        self.target.write_text("same\nsame\n", encoding="utf-8")
        patch = f"*** Begin Patch\n*** Update File: {self.relative}\n@@\n-same\n+changed\n*** End Patch"
        with self.assertRaisesRegex(ValueError, "exactly once"):
            self.tools.patch_file(self.relative, patch)
        self.assertEqual(self.target.read_text(), "same\nsame\n")

    def test_rejects_non_allowlisted_path(self) -> None:
        with self.assertRaises(PermissionError):
            self.tools.patch_file("outside.ts", self.patch)


if __name__ == "__main__":
    unittest.main()
