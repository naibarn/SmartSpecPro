import importlib.util
import json
import subprocess
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
    def test_controller_skill_routes_ready_prs_to_the_executor_and_continues(self):
        skill = CONTROLLER_SKILL.read_text(encoding="utf-8")
        self.assertIn("promote_ready_pr.py --pr <number>", skill)
        self.assertIn("--expected-head <sha> --execute", skill)
        self.assertIn("next ready independent WorkUnit", skill)
        self.assertIn("A parent task may remain open after partial canonicalization", skill)

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
            if command[:3] == ["gh", "pr", "view"] and "mergeCommit" in command[-1]:
                return subprocess.CompletedProcess(command, 0, json.dumps({
                    "state": "MERGED", "mergeCommit": {"oid": merge_sha},
                }), "")
            if command[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(command, 0, json.dumps(pull_request()), "")
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
            ROOT,
            7,
            plan,
            {"remote": "origin", "canonical_ref": "refs/heads/main"},
            runner=runner,
        )

        self.assertEqual("MERGED", result["status"])
        self.assertEqual(merge_sha, result["merge_sha"])
        self.assertEqual(2, sum(command[:3] == ["gh", "pr", "view"] for command in commands))
        merge_command = next(command for command in commands if command[:3] == ["gh", "pr", "merge"])
        self.assertIn("--match-head-commit", merge_command)
        self.assertIn("a" * 40, merge_command)
        self.assertNotIn("--admin", merge_command)
        self.assertNotIn("--delete-branch", merge_command)


if __name__ == "__main__":
    unittest.main()
