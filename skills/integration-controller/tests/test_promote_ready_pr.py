import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
SCRIPT = ROOT / "skills/integration-controller/scripts/promote_ready_pr.py"
CONTROLLER_SKILL = ROOT / "skills/integration-controller/SKILL.md"
SPEC = importlib.util.spec_from_file_location("promote_ready_pr", SCRIPT)
PROMOTER = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(PROMOTER)


def pull_request(**overrides):
    value = {
        "state": "OPEN",
        "isDraft": False,
        "headRefOid": "a" * 40,
        "baseRefName": "main",
        "baseRefOid": "c" * 40,
        "mergeable": "MERGEABLE",
        "mergeStateStatus": "CLEAN",
        "reviewDecision": "",
        "url": "https://github.com/example/repo/pull/7",
    }
    value.update(overrides)
    return value


class PromoteReadyPullRequestTests(unittest.TestCase):
    def isolated_git_repo(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        repo = Path(temporary.name)
        subprocess.run(["git", "init", "--quiet", "--initial-branch=main", str(repo)], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.name", "Progressive test"], check=True)
        subprocess.run(["git", "-C", str(repo), "config", "user.email", "test@example.invalid"], check=True)
        (repo / "base.txt").write_text("base\n", encoding="utf-8")
        (repo / ".development-repository.toml").write_text(
            '[repository]\nremote = "origin"\ncanonical_ref = "refs/heads/main"\n',
            encoding="utf-8",
        )
        subprocess.run(["git", "-C", str(repo), "add", "base.txt"], check=True)
        subprocess.run(["git", "-C", str(repo), "commit", "--quiet", "-m", "base"], check=True)
        return repo

    def test_controller_skill_routes_ready_prs_to_the_executor_and_continues(self):
        skill = CONTROLLER_SKILL.read_text(encoding="utf-8")
        self.assertIn("promote_ready_pr.py --pr <number>", skill)
        self.assertIn("--expected-head <sha> --execute", skill)
        self.assertIn("next ready independent WorkUnit", skill)
        self.assertIn("A parent task may remain open after partial canonicalization", skill)
        self.assertIn("ALREADY_MERGED", skill)
        self.assertIn("at most three times", skill)

    def test_open_spec_does_not_block_a_verified_slice(self):
        result = PROMOTER.evaluate_pull_request(
            pull_request(),
            [
                {"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"},
                {"name": "optional-preview", "state": "SKIPPED", "bucket": "skipping"},
            ],
            expected_head=None,
        )
        self.assertEqual("READY", result["status"])
        self.assertEqual([], result["blockers"])

    def test_draft_or_unstable_pr_is_blocked(self):
        checks = [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}]
        for pr in (pull_request(isDraft=True), pull_request(mergeStateStatus="UNSTABLE")):
            with self.subTest(pr=pr):
                self.assertEqual(
                    "BLOCKED",
                    PROMOTER.evaluate_pull_request(pr, checks, expected_head=None)["status"],
                )

    def test_failed_or_missing_checks_block_merge(self):
        for checks in (
            [{"name": "focused-tests", "state": "FAILURE", "bucket": "fail"}],
            [],
            [{"name": "preview", "state": "SKIPPED", "bucket": "skipping"}],
        ):
            with self.subTest(checks=checks):
                result = PROMOTER.evaluate_pull_request(
                    pull_request(), checks, expected_head=None
                )
                self.assertEqual("BLOCKED", result["status"])

    def test_review_requirement_or_head_drift_blocks_merge(self):
        checks = [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}]
        for pr, expected_head in (
            (pull_request(reviewDecision="REVIEW_REQUIRED"), None),
            (pull_request(), "b" * 40),
        ):
            with self.subTest(pr=pr, expected_head=expected_head):
                result = PROMOTER.evaluate_pull_request(
                    pr, checks, expected_head=expected_head
                )
                self.assertEqual("BLOCKED", result["status"])

    def test_canonical_base_drift_blocks_until_candidate_is_refreshed(self):
        result = PROMOTER.evaluate_pull_request(
            pull_request(),
            [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}],
            expected_head=None,
            expected_base_sha="e" * 40,
        )
        self.assertEqual("BLOCKED", result["status"])
        self.assertIn("BASE_REF_STALE", result["blockers"])

    def test_execute_rechecks_head_and_uses_normal_github_merge(self):
        commands = []
        merge_sha = "d" * 40
        canonical_sha = "c" * 40

        def runner(command, *, cwd, check=True):
            commands.append(command)
            if command[:3] == ["gh", "pr", "view"] and command[-1] == "state,mergeCommit,mergeStateStatus,mergedAt":
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    "state": "MERGED", "mergeCommit": {"oid": merge_sha},
                    "mergedAt": "2026-10-10T12:00:00Z",
                }), "")
            if command[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(command, 0, json.dumps(pull_request(
                    commits=[{"committedDate": "2026-10-10T11:00:00Z"}],
                    changedFiles=2, additions=5, deletions=1,
                )), "")
            if command[:3] == ["gh", "pr", "checks"]:
                return subprocess.CompletedProcess(command, 0, json.dumps([
                    {"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"},
                ]), "")
            if command[:3] == ["gh", "pr", "merge"]:
                return subprocess.CompletedProcess(command, 0, "", "")
            if command[:2] == ["git", "rev-parse"]:
                return subprocess.CompletedProcess(command, 0, canonical_sha + "\n", "")
            if command[:2] == ["git", "merge-base"]:
                return subprocess.CompletedProcess(command, 0, "", "")
            return subprocess.CompletedProcess(command, 0, "", "")

        plan = PROMOTER.evaluate_pull_request(
            pull_request(),
            [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}],
            expected_head=None,
        )
        result = PROMOTER.execute_merge(
            self.isolated_git_repo(),
            7,
            plan,
            {"remote": "origin", "canonical_ref": "refs/heads/main"},
            runner=runner,
        )

        self.assertEqual("MERGED", result["status"])
        self.assertEqual(merge_sha, result["merge_sha"])
        self.assertEqual(1, result["metrics"]["branch_age_hours"])
        self.assertEqual({"commits": 1, "files": 2, "insertions": 5, "deletions": 1},
                         result["metrics"]["integration_delta"])
        self.assertEqual("UNKNOWN", result["metrics"]["merge_latency_minutes"])
        self.assertEqual({"sha": merge_sha, "status": "PENDING_POST_INTEGRATION"},
                         result["metrics"]["main_build_health"])
        self.assertEqual(2, sum(command[:3] == ["gh", "pr", "view"] for command in commands))
        merge_command = next(command for command in commands if command[:3] == ["gh", "pr", "merge"])
        self.assertIn("--match-head-commit", merge_command)
        self.assertIn("a" * 40, merge_command)
        self.assertNotIn("--admin", merge_command)
        self.assertNotIn("--delete-branch", merge_command)

    def test_pr_merged_by_another_session_is_reconciled_without_second_merge(self):
        merge_sha = "d" * 40
        canonical_sha = "e" * 40
        commands = []

        def runner(command, *, cwd, check=True):
            commands.append(command)
            if command[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    **pull_request(state="MERGED"),
                    "mergeCommit": {"oid": merge_sha},
                    "mergedAt": "2026-10-12T10:00:00Z",
                }), "")
            if command[:3] == ["gh", "pr", "checks"]:
                return subprocess.CompletedProcess(command, 0, "[]", "")
            if command[:2] == ["git", "rev-parse"]:
                return subprocess.CompletedProcess(command, 0, canonical_sha + "\n", "")
            if command[:2] == ["git", "merge-base"]:
                return subprocess.CompletedProcess(command, 0, "", "")
            return subprocess.CompletedProcess(command, 0, "", "")

        plan = PROMOTER.evaluate_pull_request(
            pull_request(),
            [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}],
            expected_head=None,
        )
        result = PROMOTER.execute_merge(
            self.isolated_git_repo(),
            7,
            plan,
            {"remote": "origin", "canonical_ref": "refs/heads/main"},
            runner=runner,
        )

        self.assertEqual("ALREADY_MERGED", result["status"])
        self.assertEqual("ANOTHER_SESSION", result["merge_source"])
        self.assertEqual(merge_sha, result["merge_sha"])
        self.assertEqual(canonical_sha, result["canonical_sha"])
        self.assertFalse(any(command[:3] == ["gh", "pr", "merge"] for command in commands))
        def continuation_runner(command, *, cwd, check=True):
            output = canonical_sha + "\n" if command[:2] == ["git", "rev-parse"] else ""
            return subprocess.CompletedProcess(command, 0, output, "")

        continuation = PROMOTER.continue_next_workunit(
            ROOT,
            {"status": "ALREADY_MERGED", "canonical_sha": canonical_sha},
            {"workunits": []},
            ["never-execute"],
            ROOT / ".never-created",
            runner=continuation_runner,
        )
        self.assertEqual("NO_READY_WORKUNIT", continuation["status"])
        self.assertFalse((ROOT / ".never-created").exists())

    def test_closed_pr_is_reported_without_retrying_merge(self):
        result = PROMOTER.evaluate_pull_request(
            pull_request(state="CLOSED"),
            [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}],
            expected_head=None,
        )
        self.assertEqual("CLOSED", result["pull_request_state"])
        self.assertEqual("AUTHORITY", result["failure_class"])

    def test_changed_open_pr_head_is_classified_as_superseded(self):
        result = PROMOTER.evaluate_pull_request(
            pull_request(headRefOid="b" * 40),
            [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}],
            expected_head="a" * 40,
        )
        self.assertEqual("b" * 40, result["head_sha"])
        self.assertEqual("CONFLICT", result["failure_class"])

    def test_transient_command_failure_uses_bounded_exponential_backoff(self):
        calls = []
        delays = []

        def runner(command, *, cwd, check=True):
            calls.append(command)
            if len(calls) < 3:
                return subprocess.CompletedProcess(
                    command, 1, "", "HTTP 503 Service Unavailable token=fake-value-for-test",
                )
            return subprocess.CompletedProcess(command, 0, "ok", "")

        retrying = PROMOTER.RetryingCommandRunner(
            runner, max_attempts=3, base_delay_seconds=0.25, sleep=delays.append,
        )
        result = retrying(["git", "fetch", "origin", "main"], cwd=ROOT)

        self.assertEqual(0, result.returncode)
        self.assertEqual(3, len(calls))
        self.assertEqual([0.25, 0.5], delays)
        self.assertEqual(3, len(retrying.history))
        self.assertEqual("INFRASTRUCTURE", retrying.history[0]["failure_class"])
        self.assertIn("HTTP 503", json.dumps(retrying.history))
        self.assertNotIn("fake-value-for-test", json.dumps(retrying.history))

    def test_command_timeout_is_classified_and_retried_with_a_bound(self):
        calls = []
        delays = []

        def runner(command, *, cwd, check=True):
            calls.append(command)
            raise subprocess.TimeoutExpired(command, timeout=1)

        retrying = PROMOTER.RetryingCommandRunner(
            runner, max_attempts=2, base_delay_seconds=0.1, sleep=delays.append,
        )
        result = retrying(["git", "fetch", "origin", "main"], cwd=ROOT, check=False)

        self.assertEqual(124, result.returncode)
        self.assertEqual(2, len(calls))
        self.assertEqual([0.1], delays)
        self.assertEqual("INFRASTRUCTURE", retrying.history[-1]["failure_class"])
        self.assertIn("command timed out", retrying.history[-1]["diagnostic_excerpt"])

    def test_application_failure_is_not_retried(self):
        calls = []

        def runner(command, *, cwd, check=True):
            calls.append(command)
            return subprocess.CompletedProcess(command, 1, "", "required check failed")

        retrying = PROMOTER.RetryingCommandRunner(
            runner, max_attempts=3, sleep=lambda _delay: self.fail("must not retry application failures"),
        )
        result = retrying(["gh", "pr", "checks", "7"], cwd=ROOT, check=False)

        self.assertEqual(1, result.returncode)
        self.assertEqual(1, len(calls))
        self.assertEqual("APPLICATION", retrying.history[0]["failure_class"])

    def test_repeated_infrastructure_failures_stop_at_retry_limit(self):
        calls = []
        delays = []

        def runner(command, *, cwd, check=True):
            calls.append(command)
            return subprocess.CompletedProcess(command, 1, "", "connection reset by peer")

        retrying = PROMOTER.RetryingCommandRunner(
            runner, max_attempts=3, base_delay_seconds=0.1, sleep=delays.append,
        )
        result = retrying(["gh", "pr", "view", "7"], cwd=ROOT, check=False)

        self.assertEqual(1, result.returncode)
        self.assertEqual(3, len(calls))
        self.assertEqual([0.1, 0.2], delays)
        self.assertEqual(3, len(retrying.history))


if __name__ == "__main__":
    unittest.main()
