"""Focused tests for SPEC WorkUnit write receipts and scoped patching."""
from __future__ import annotations

import json
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

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
        contract = SimpleNamespace(
            root=self.root,
            allowed_files=(self.relative,),
            writable_files=(self.relative,),
            raw={"patchableFiles": [self.relative]},
            binding={"specId": "SPEC-001", "workUnit": "SPEC001_TEST", "requirementId": "REQ-0123456789AB", "sourceRevision": "test-revision", "workspace": str(self.root)},
        )
        self.tools = workunit.ScopedRepoTools(self.store, "phase-test", writable=True, contract=contract)
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

    def test_numbered_hunk_updates_only_the_intended_duplicate_context(self) -> None:
        self.target.write_text("first\nsame\nthird\nsame\nlast\n", encoding="utf-8")
        patch = (
            "*** Begin Patch\n"
            f"*** Update File: {self.relative}\n"
            "@@ -4,1 +4,1 @@\n-same\n+changed\n"
            "*** End Patch"
        )

        self.tools.patch_file(self.relative, patch)

        self.assertEqual(self.target.read_text(), "first\nsame\nthird\nchanged\nlast\n")

    def test_rejects_non_allowlisted_path(self) -> None:
        with self.assertRaises(PermissionError):
            self.tools.patch_file("outside.ts", self.patch)

    def test_new_patchable_file_can_be_created_with_idempotent_write_receipt(self) -> None:
        new_path = "apps/web/server/services/__tests__/new.integration.test.ts"
        self.tools.contract = SimpleNamespace(
            root=self.root,
            allowed_files=(new_path,),
            writable_files=(new_path,),
            raw={"patchableFiles": [new_path]},
            binding={"specId": "SPEC-001", "workUnit": "SPEC001_TEST", "requirementId": "REQ-0123456789AB", "sourceRevision": "test-revision", "workspace": str(self.root)},
        )

        result = self.tools.write_file(new_path, "export {}\n")

        self.assertIn("Wrote", result)
        self.assertEqual((self.root / new_path).read_text(), "export {}\n")
        self.assertEqual(next(iter(self.store.receipts.values()))["status"], "completed")

    def test_missing_contract_test_path_fails_closed_without_running_vitest(self) -> None:
        missing = "apps/web/server/services/missing.integration.test.ts"
        contract = SimpleNamespace(
            root=self.root,
            allowed_files=(missing,),
            writable_files=(missing,),
            raw={"patchableFiles": []},
            binding={"specId": "SPEC-001", "workUnit": "SPEC001_TEST", "requirementId": "REQ-0123456789AB", "sourceRevision": "test-revision", "workspace": str(self.root)},
            spec_id="SPEC-001",
            test_paths=(missing,),
            test_command=["pnpm", "--dir", "apps/web", "exec", "vitest", "run", "server/services/missing.integration.test.ts"],
            database_mode="none",
        )
        tools = workunit.ScopedRepoTools(self.store, "verification-missing-test", False, contract)

        receipt = json.loads(tools.run_focused_tests())

        self.assertEqual(receipt["exitCode"], 2)
        self.assertEqual(receipt["missingTestPaths"], [missing])
        self.assertIn("no tests were run", receipt["stderr"])


class PhaseTurnContinuationTests(unittest.TestCase):
    def test_max_turns_continues_from_checkpoint_in_same_phase_and_session(self) -> None:
        class Store:
            evidence_dir = Path(tempfile.gettempdir())

            def __init__(self):
                self.saved = []
                self.events = []
                self.existing = None

            def phase_id(self, name, attempt):
                return "stable-phase-id"

            def get_phase(self, phase_id):
                return self.existing

            def start_phase(self, name, attempt, phase_input, max_turns):
                self.phase_id = "stable-phase-id"
                return {"phase_id": self.phase_id, "status": "running", "checkpoint_json": None}

            def save_checkpoint(self, phase_id, state):
                self.saved.append((phase_id, state))

            def event(self, kind, payload, *, stable_key):
                self.events.append((kind, payload, stable_key))

            def complete_phase(self, phase_id, output):
                self.completed = (phase_id, output)

        class Session:
            def __init__(self, session_id, db_path):
                self.session_id = session_id
                self.closed = False

            def close(self):
                self.closed = True

        class Snapshot:
            def to_json(self):
                return {"snapshot": "trusted", "max_turns": 3}

        class Stream:
            def __init__(self, fail):
                self.fail = fail
                self.final_output = '{"complete":true}'
                self.last_response_id = "response-final"

            def to_state(self):
                return Snapshot()

            async def stream_events(self):
                yield object()
                if self.fail:
                    raise workunit.MaxTurnsExceeded("Max turns exceeded")

        class FakeRunState:
            restored = []

            @staticmethod
            async def from_json(agent, checkpoint):
                FakeRunState.restored.append(checkpoint)
                return {"resumed": checkpoint}

        store = Store()
        agent = object()
        streams = [Stream(True), Stream(False)]
        calls = []

        def run_streamed(starting_agent, run_input, *, max_turns, session):
            calls.append((starting_agent, run_input, max_turns, session))
            return streams.pop(0)

        with patch.object(workunit, "SQLiteSession", Session), \
             patch.object(workunit, "RunState", FakeRunState), \
             patch.object(workunit.Runner, "run_streamed", side_effect=run_streamed):
            result = workunit.run_phase(store, "implementation", 1, agent, "input", 3)

        self.assertEqual(len(calls), 2)
        self.assertIs(calls[0][0], agent)
        self.assertIs(calls[1][0], agent)
        self.assertEqual([call[2] for call in calls], [3, 6])
        self.assertIs(calls[0][3], calls[1][3])
        self.assertEqual(calls[1][1], {"resumed": {"snapshot": "trusted", "max_turns": 6}})
        self.assertEqual(FakeRunState.restored[0]["max_turns"], 6)
        self.assertTrue(all(phase_id == "stable-phase-id" for phase_id, _ in store.saved))
        self.assertEqual(store.events[0][0], "phase.turn_limit_continued")
        self.assertEqual(store.completed[0], "stable-phase-id")
        self.assertEqual(result.final_output, '{"complete":true}')

    def test_completed_phase_replays_without_rebinding_to_changed_source(self) -> None:
        class Store:
            def __init__(self):
                self.run_id = str(uuid.uuid4())
                self.called_start = False

            def phase_id(self, name, attempt):
                return "stable-completed-phase"

            def get_phase(self, phase_id):
                return {"status": "completed", "output_json": json.dumps({"finalOutput": "saved plan"})}

            def start_phase(self, *args):
                self.called_start = True
                raise AssertionError("completed phase must be replayed directly")

        store = Store()
        result = workunit.run_phase(store, "planning", 0, object(), "changed source context", 5)

        self.assertEqual(result.final_output, "saved plan")
        self.assertFalse(store.called_start)

    def test_running_phase_keeps_persisted_prompt_when_source_context_changes(self) -> None:
        class Store:
            evidence_dir = Path(tempfile.gettempdir())

            def __init__(self):
                self.run_id = str(uuid.uuid4())
                self.phase_input = {"input": "original durable prompt", "maxTurns": 3}
                self.existing = {"status": "running", "input_json": json.dumps(self.phase_input), "checkpoint_json": json.dumps({"snapshot": "trusted", "max_turns": 3})}

            def phase_id(self, name, attempt):
                return "stable-running-phase"

            def get_phase(self, phase_id):
                return self.existing

            def start_phase(self, name, attempt, phase_input, max_turns):
                self.received = (phase_input, max_turns)
                return {"phase_id": "stable-running-phase", "status": "running", "checkpoint_json": json.dumps({"snapshot": "trusted", "max_turns": 3})}

            def save_checkpoint(self, *_):
                pass

            def complete_phase(self, *_):
                pass

        class Session:
            def __init__(self, *_args, **_kwargs):
                pass

            def close(self):
                pass

        class State:
            @staticmethod
            async def from_json(agent, checkpoint):
                return {"restored": checkpoint}

        class Stream:
            final_output = "resumed"
            last_response_id = "response-resumed"

            def to_state(self):
                return SimpleNamespace(to_json=lambda: {"snapshot": "trusted", "max_turns": 6})

            async def stream_events(self):
                yield object()

        store = Store()
        calls = []

        def run_streamed(agent, run_input, *, max_turns, session):
            calls.append((run_input, max_turns))
            return Stream()

        with patch.object(workunit, "SQLiteSession", Session), patch.object(workunit, "RunState", State), patch.object(workunit.Runner, "run_streamed", side_effect=run_streamed):
            result = workunit.run_phase(store, "planning", 0, object(), "mutated source context", 5)

        self.assertEqual(store.received, (store.phase_input, 3))
        self.assertEqual(calls[0][0], {"restored": {"snapshot": "trusted", "max_turns": 6}})
        self.assertEqual(calls[0][1], 6)
        self.assertEqual(result.final_output, "resumed")


if __name__ == "__main__":
    unittest.main()
