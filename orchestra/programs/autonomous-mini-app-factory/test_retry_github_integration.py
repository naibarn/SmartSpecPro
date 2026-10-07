import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from retry_github_integration import mark_integration_retryable, retry_delay_seconds


class RetryableGitHubIntegrationRegressionTests(unittest.TestCase):
    def test_backoff_is_exponential_and_capped(self):
        self.assertEqual(
            [retry_delay_seconds(attempt, base_seconds=5, cap_seconds=40) for attempt in range(7)],
            [5, 10, 20, 40, 40, 40, 40],
        )

    def test_invalid_retry_configuration_is_rejected(self):
        with self.assertRaises(ValueError):
            retry_delay_seconds(-1)
        with self.assertRaises(ValueError):
            retry_delay_seconds(0, base_seconds=0)

    def test_github_outage_waits_only_on_integration_and_keeps_program_working(self):
        program = {
            "state": "WORKING",
            "currentWorkunit": {"id": "RESEARCH_NOTES_AI", "state": "WORKING"},
            "blockedWorkunits": [],
            "autonomy": {},
        }
        mark_integration_retryable(
            program,
            branch="codex/mini-app-factory-runtime-20261007",
            checkpoint_sha="69bc7a04c62334e2910cf1429fea07dc68a48987",
            task_worktree="/home/dev/worktrees/mini-app-factory-reset",
            attempt=2,
            error="remote returned Internal Server Error",
        )

        self.assertEqual(program["state"], "WORKING")
        self.assertEqual(program["currentWorkunit"]["state"], "WORKING")
        self.assertEqual(program["blockedWorkunits"][0]["state"], "WAITING_EXTERNAL_RETRYABLE")
        self.assertEqual(program["blockedWorkunits"][0]["intendedRemoteBranch"], "codex/mini-app-factory-runtime-20261007")


if __name__ == "__main__":
    unittest.main()
