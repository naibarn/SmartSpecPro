import unittest
import sys
import json
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))
from retry_github_integration import mark_integration_retryable, retry_checkpoint, retry_delay_seconds


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

    def test_outage_checkpoint_retries_automatically_and_resumes_after_recovery(self):
        branch = "codex/mini-app-factory-runtime-20261007"
        checkpoint = "a" * 40
        integrated = "b" * 40
        with tempfile.TemporaryDirectory() as directory:
            repo = Path(directory)
            program_path = repo / "orchestra/programs/autonomous-mini-app-factory/program.json"
            program_path.parent.mkdir(parents=True)
            program_path.write_text(json.dumps({
                "state": "WORKING",
                "currentWorkunit": {"id": "RESEARCH_NOTES_PACKAGE", "state": "WORKING"},
                "blockedWorkunits": [],
                "autonomy": {},
                "canonical": {"sha": "old", "userWorkspace": "/canonical", "userWorkspaceClean": True},
            }))
            commands = []
            push_attempt = 0
            reachability_checks = 0

            def run(command, *, cwd, capture=True):
                nonlocal push_attempt, reachability_checks
                commands.append(command)
                if command[:3] == ["git", "fetch", "origin"]:
                    return subprocess.CompletedProcess(command, 0, "", "")
                if command[:3] == ["git", "merge-base", "--is-ancestor"]:
                    reachability_checks += 1
                    return subprocess.CompletedProcess(command, 0 if reachability_checks == 3 else 1, "", "")
                if "push" in command:
                    push_attempt += 1
                    if push_attempt == 1:
                        return subprocess.CompletedProcess(command, 1, "", "remote returned Internal Server Error")
                    return subprocess.CompletedProcess(command, 0, "", "")
                if command[:3] == ["gh", "pr", "create"]:
                    return subprocess.CompletedProcess(command, 0, "https://github.com/naibarn/SmartSpecPro/pull/999\n", "")
                if command[:3] == ["gh", "pr", "merge"]:
                    return subprocess.CompletedProcess(command, 0, "", "")
                if command[:3] == ["git", "rev-parse", "origin/main"]:
                    return subprocess.CompletedProcess(command, 0, integrated + "\n", "")
                if "workspace_authority.py" in " ".join(command):
                    return subprocess.CompletedProcess(command, 0, '{"status":"CANONICAL_CONVERGENCE_VERIFIED"}', "")
                return subprocess.CompletedProcess(command, 0, "", "")

            def gh_json(command, *, cwd):
                if command[:3] == ["gh", "pr", "list"]:
                    return []
                return {"state": "MERGED", "mergedAt": "2026-10-07T00:00:00Z", "mergeCommit": {"oid": integrated}, "url": "https://github.com/naibarn/SmartSpecPro/pull/999"}

            wait_snapshots = []

            def automatic_wait(seconds):
                wait_snapshots.append((seconds, json.loads(program_path.read_text())))

            with patch("retry_github_integration._run", side_effect=run), patch(
                "retry_github_integration._gh_json", side_effect=gh_json
            ), patch("retry_github_integration.time.sleep", side_effect=automatic_wait):
                result = retry_checkpoint(
                    repo_dir=repo,
                    repository="naibarn/SmartSpecPro",
                    remote_branch=branch,
                    checkpoint_sha=checkpoint,
                    attempts=3,
                    base_seconds=5,
                    cap_seconds=20,
                    title="Research Notes checkpoint",
                    body="checkpoint body",
                    sleep=automatic_wait,
                )

            self.assertEqual(result, 0)
            self.assertEqual(len(wait_snapshots), 1)
            delay, waiting = wait_snapshots[0]
            self.assertEqual(delay, 5)
            self.assertEqual(waiting["state"], "WORKING")
            self.assertEqual(waiting["currentWorkunit"]["state"], "WORKING")
            self.assertEqual(waiting["blockedWorkunits"][0]["state"], "WAITING_EXTERNAL_RETRYABLE")
            self.assertEqual(waiting["blockedWorkunits"][0]["taskWorktree"], str(repo))
            self.assertEqual(waiting["blockedWorkunits"][0]["localCheckpointSha"], checkpoint)
            self.assertEqual(waiting["blockedWorkunits"][0]["intendedRemoteBranch"], branch)
            self.assertTrue(waiting["blockedWorkunits"][0]["pendingPullRequest"])
            self.assertTrue(any("lfs.https://github.com/naibarn/SmartSpecPro.git/info/lfs.locksverify=false" in item for cmd in commands for item in cmd))
            self.assertFalse(any(item in {"--force", "-f", "--force-with-lease"} for cmd in commands for item in cmd))
            self.assertTrue(any(command[:3] == ["gh", "pr", "create"] for command in commands))
            self.assertTrue(any(command[:4] == ["gh", "pr", "merge", "https://github.com/naibarn/SmartSpecPro/pull/999"] and "--merge" in command for command in commands))

            resumed = json.loads(program_path.read_text())
            self.assertEqual(resumed["state"], "WORKING")
            self.assertEqual(resumed["blockedWorkunits"], [])
            self.assertEqual(resumed["canonical"]["sha"], integrated)
            self.assertEqual(resumed["autonomy"]["githubRetryPolicy"]["state"], "IDLE_AFTER_SUCCESS")


if __name__ == "__main__":
    unittest.main()
