from __future__ import annotations

import json
import signal
import sys
import tempfile
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from durable_store import DurableRunStore
from supervise_run import record_operator_signal


class SupervisorTelemetryTests(unittest.TestCase):
    def test_operator_intervention_count_is_projected_from_human_signal_event(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            run_id = str(uuid.uuid4())
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}):
                pass

            record_operator_signal(evidence, run_id, signal.SIGINT)
            state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["humanInterventions"], 1)
            self.assertEqual(
                [event["kind"] for event in state["lifecycleEvents"] if event["actor"] == "human"],
                ["human.intervention.signal_received"],
            )

    def test_automatic_restart_does_not_count_as_human_intervention(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp)
            run_id = str(uuid.uuid4())
            with DurableRunStore(evidence, run_id=run_id, initial_state={"runId": run_id, "status": "running"}):
                pass
            with DurableRunStore(evidence, run_id=run_id, resume=True, count_restart=False) as store:
                store.event("supervisor.restart_scheduled", {"restart": 1}, stable_key="restart:1")
            state = json.loads((evidence / "run-state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["humanInterventions"], 0)


if __name__ == "__main__":
    unittest.main()
