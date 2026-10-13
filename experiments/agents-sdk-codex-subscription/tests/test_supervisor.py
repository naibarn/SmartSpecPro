import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from supervise_run import write_recovery_receipt


class SupervisorReceiptTests(unittest.TestCase):
    def test_failed_restart_result_is_durably_recorded_from_run_projection(self):
        with tempfile.TemporaryDirectory() as temp:
            evidence = Path(temp) / "evidence"
            evidence.mkdir()
            logs = evidence / "process-logs"
            logs.mkdir()
            (evidence / "run-state.json").write_text(json.dumps({
                "runId": "run-1", "status": "retry_exhausted", "crashConsumed": ["model.after_receipt"],
                "eventCount": 9, "humanInterventions": 0,
            }))
            receipt = write_recovery_receipt(
                evidence, logs, run_id="run-1", restarts=1, started=1.0,
                crash_at="model.after_receipt,verification.after_phase_complete",
                supervisor_result="FAILED", reason="bounded attempts exhausted", return_code=1,
            )
            persisted = json.loads((evidence / "recovery-receipt.json").read_text())
            self.assertEqual(persisted, receipt)
            self.assertEqual(receipt["status"], "retry_exhausted")
            self.assertEqual(receipt["supervisorResult"], "FAILED")
            self.assertEqual(receipt["faultsConsumed"], ["model.after_receipt"])
            self.assertEqual(receipt["returnCode"], 1)


if __name__ == "__main__":
    unittest.main()
