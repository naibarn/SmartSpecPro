from __future__ import annotations

import asyncio
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import run_spec_workunit
from durable_store import DurableRunStore
from agents.exceptions import MaxTurnsExceeded


class FakeSession:
    def __init__(self, *_args, **_kwargs):
        pass

    def close(self):
        pass


class FakeState:
    def to_json(self):
        return {"run_id": "fake", "turns": []}


class PhaseProgressTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.evidence = Path(self.temp.name) / "evidence"
        self.run_id = str(uuid.uuid4())
        with DurableRunStore(self.evidence, run_id=self.run_id, initial_state={
            "runId": self.run_id, "status": "running", "iterations": [],
        }):
            pass

    def tearDown(self):
        self.temp.cleanup()

    def test_many_identical_stream_events_do_not_grow_checkpoint_history(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)

        class Stream:
            final_output = "done"
            last_response_id = "response-1"
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                for _ in range(500):
                    await asyncio.sleep(0)
                    yield object()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", return_value=Stream()):
            result = run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 8)
        self.assertEqual(result.final_output, "done")
        phase = store.get_phase(store.phase_id("planning", 0))
        self.assertEqual(phase["checkpoint_revision"], 1)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='agents.run_state.checkpointed'"
        ).fetchone()[0], 1)
        store.close()

    def test_repeated_max_turns_without_progress_diagnoses_and_stops_extending(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)
        calls = 0

        class Stream:
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                nonlocal calls
                calls += 1
                if calls == 1:
                    phase_id = store.phase_id("planning", 0)
                    store.reserve_model_call("first-turn", phase_id, "planner", {"input": "first"})
                    store.update_model_call("first-turn", event="model.call.completed", stable_suffix="completed",
                                            status="completed", thread_id="thread", turn_id="turn-1")
                raise MaxTurnsExceeded("test boundary")
                yield  # pragma: no cover - make this an async generator

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", side_effect=lambda *_a, **_kw: Stream()), \
             patch.object(run_spec_workunit.RunState, "from_json", new=AsyncMock(return_value="resumed")):
            with self.assertRaisesRegex(run_spec_workunit.NoProgressPhaseError, "without a completed model turn"):
                run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 1)
        self.assertEqual(calls, 2)
        phase = store.get_phase(store.phase_id("planning", 0))
        self.assertEqual(phase["status"], "needs_replan")
        self.assertEqual(phase["no_progress_segments"], 1)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='phase.turn_limit_continued'"
        ).fetchone()[0], 1)
        self.assertEqual(store.connection.execute(
            "SELECT COUNT(*) FROM events WHERE kind='phase.no_progress_diagnosed'"
        ).fetchone()[0], 1)
        store.close()

    def test_long_running_stream_is_not_stalled_by_elapsed_time(self):
        store = DurableRunStore(self.evidence, run_id=self.run_id, resume=True, count_restart=False)

        class Stream:
            final_output = "completed after wait"
            last_response_id = "response-long"
            def to_state(self):
                return FakeState()
            async def stream_events(self):
                await asyncio.sleep(0.02)
                yield object()

        with patch.object(run_spec_workunit, "SQLiteSession", FakeSession), \
             patch.object(run_spec_workunit.Runner, "run_streamed", return_value=Stream()):
            result = run_spec_workunit.run_phase(store, "planning", 0, object(), "plan", 1)
        self.assertEqual(result.final_output, "completed after wait")
        self.assertEqual(store.get_phase(store.phase_id("planning", 0))["status"], "completed")
        store.close()


if __name__ == "__main__":
    unittest.main()
