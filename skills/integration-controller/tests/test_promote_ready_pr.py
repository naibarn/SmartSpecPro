import importlib.util
import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch
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
    def continuation_fixture(self):
        repo = self.isolated_git_repo()
        policy = repo / "skills/development-lifecycle/lifecycle_policy.py"
        policy.parent.mkdir(parents=True)
        policy.write_bytes((ROOT / "skills/development-lifecycle/lifecycle_policy.py").read_bytes())
        return repo

    def test_preflight_accepts_failed_and_pending_check_json_but_keeps_github_gate(self):
        for exit_code, merge_state, expected in ((1, "UNSTABLE", "READY"), (8, "CLEAN", "READY"), (1, "BLOCKED", "BLOCKED")):
            with self.subTest(exit_code=exit_code, merge_state=merge_state):
                def runner(command, *, cwd, check=True):
                    value = "c" * 40
                    code = 0
                    if command[:3] == ["gh", "pr", "view"]:
                        value = json.dumps(pull_request(mergeStateStatus=merge_state))
                    elif command[:3] == ["gh", "pr", "checks"]:
                        value = json.dumps([{"name": "observed-check", "state": "FAILURE" if exit_code == 1 else "PENDING"}])
                        code = exit_code
                    return subprocess.CompletedProcess(command, code, value, "")
                result, _ = PROMOTER.preflight(self.isolated_git_repo(), 7, runner=runner)
                self.assertEqual(expected, result["status"])

    def test_checks_auth_transport_and_malformed_responses_are_not_ready(self):
        for code, output in ((1, '{"message":"Resource not accessible"}'), (1, "permission denied"), (124, "[]")):
            with self.subTest(code=code, output=output):
                def runner(command, *, cwd, check=True):
                    if command[:3] == ["gh", "pr", "view"]:
                        return subprocess.CompletedProcess(command, 0, json.dumps(pull_request()), "")
                    if command[:3] == ["gh", "pr", "checks"]:
                        return subprocess.CompletedProcess(command, code, output, "")
                    return subprocess.CompletedProcess(command, 0, "c" * 40, "")
                with self.assertRaises(RuntimeError):
                    PROMOTER.preflight(self.isolated_git_repo(), 7, runner=runner)

    def test_continuation_reuses_dirty_primary_and_preserves_other_edits(self):
        repo = self.continuation_fixture()
        (repo / "base.txt").write_text("other unfinished work\n")
        (repo / "other.txt").write_text("untracked work\n")
        commands = []
        def runner(command, *, cwd, check=True):
            commands.append((command, cwd))
            if command[:2] == ["git", "fetch"] or command[0] == "test-worker":
                return subprocess.CompletedProcess(command, 0, "", "")
            if command == ["git", "rev-parse", "FETCH_HEAD"]:
                command = ["git", "rev-parse", "HEAD"]
            return PROMOTER.run_command(command, cwd=cwd, check=check)
        result = PROMOTER.continue_next_workunit(
            repo, {"status": "MERGED"}, {"workunits": [{"id": "next", "status": "READY"}]},
            ["test-worker"], runner=runner,
        )
        self.assertEqual("WORKER_SUCCEEDED", result["status"])
        self.assertEqual(str(repo), result["workspace"])
        self.assertFalse(result["isolated_worktree"])
        self.assertTrue(result["workspace_dirty"])
        self.assertEqual("other unfinished work\n", (repo / "base.txt").read_text())
        self.assertEqual("untracked work\n", (repo / "other.txt").read_text())
        self.assertFalse(any("create" in command or command[:2] == ["git", "worktree"] for command, _ in commands))
        self.assertEqual(repo, next(cwd for command, cwd in commands if command[0] == "test-worker"))

    def test_continuation_fast_forwards_primary_without_replacing_dirty_source(self):
        repo = self.continuation_fixture()
        old = PROMOTER.run_command(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip()
        (repo / "incoming.txt").write_text("canonical addition\n")
        PROMOTER.run_command(["git", "add", "incoming.txt"], cwd=repo)
        PROMOTER.run_command(["git", "commit", "-m", "canonical update"], cwd=repo)
        tip = PROMOTER.run_command(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip()
        PROMOTER.run_command(["git", "reset", "--hard", old], cwd=repo)
        (repo / "base.txt").write_text("preserve this edit\n")
        def runner(command, *, cwd, check=True):
            if command[:2] == ["git", "fetch"] or command[0] == "test-worker":
                return subprocess.CompletedProcess(command, 0, "", "")
            if command == ["git", "rev-parse", "FETCH_HEAD"]:
                return subprocess.CompletedProcess(command, 0, tip, "")
            return PROMOTER.run_command(command, cwd=cwd, check=check)
        result = PROMOTER.continue_next_workunit(repo, {"status": "MERGED"}, {"workunits": [{"id": "next"}]}, ["test-worker"], runner=runner)
        self.assertEqual("WORKER_SUCCEEDED", result["status"])
        self.assertEqual(tip, result["canonical_sha"])
        self.assertEqual("preserve this edit\n", (repo / "base.txt").read_text())
        self.assertTrue((repo / "incoming.txt").exists())

    def test_explicit_worktree_requires_a_necessity_reason_before_creation(self):
        repo = self.continuation_fixture()
        def runner(command, *, cwd, check=True):
            if command[:2] == ["git", "fetch"]:
                return subprocess.CompletedProcess(command, 0, "", "")
            self.assertNotIn("create", command)
            return PROMOTER.run_command(command, cwd=cwd, check=check)
        with self.assertRaisesRegex(RuntimeError, "WORKTREE_ISOLATION_REASON_REQUIRED"):
            PROMOTER.continue_next_workunit(repo, {"status": "MERGED"}, {"workunits": [{"id": "next"}]}, ["test-worker"], isolated_worktree=True, runner=runner)

    def test_unsafe_primary_refresh_preserves_edits_without_creating_a_worktree(self):
        repo = self.continuation_fixture()
        (repo / "base.txt").write_text("preserve this edit\n")
        commands = []
        def runner(command, *, cwd, check=True):
            commands.append(command)
            if command[:2] == ["git", "fetch"]:
                return subprocess.CompletedProcess(command, 0, "", "")
            if command == ["git", "rev-parse", "FETCH_HEAD"]:
                return subprocess.CompletedProcess(command, 0, "f" * 40, "")
            if command[:3] == ["git", "merge", "--ff-only"]:
                return subprocess.CompletedProcess(command, 1, "", "overlapping local edit")
            self.assertNotEqual("test-worker", command[0])
            return PROMOTER.run_command(command, cwd=cwd, check=check)
        with self.assertRaisesRegex(RuntimeError, "PRIMARY_WORKSPACE_RECONCILIATION_REQUIRED"):
            PROMOTER.continue_next_workunit(repo, {"status": "MERGED"}, {"workunits": [{"id": "next"}]}, ["test-worker"], runner=runner)
        self.assertEqual("preserve this edit\n", (repo / "base.txt").read_text())
        self.assertFalse(any("create" in command or command[:2] == ["git", "worktree"] for command in commands))

    def test_continuation_cli_does_not_require_a_new_worktree(self):
        repo = self.isolated_git_repo()
        work = repo / "work.json"
        work.write_text('{"workunits": []}')
        receipt = repo / "receipt.json"
        with patch.object(PROMOTER, "preflight", return_value=({}, {})), patch.object(PROMOTER, "execute_merge", return_value={"status": "MERGED"}), patch.object(PROMOTER, "continue_next_workunit", return_value={"status": "NO_READY_WORKUNIT"}) as continuation, contextlib.redirect_stdout(io.StringIO()):
            result = PROMOTER.main(["--repository", str(repo), "--pr", "7", "--execute", "--workunits", str(work), "--worker-command", '["test-worker"]', "--receipt", str(receipt)])
        self.assertEqual(0, result)
        self.assertIsNone(continuation.call_args.args[4])
        self.assertFalse(continuation.call_args.kwargs["isolated_worktree"])

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

    def test_draft_blocks_but_optional_unstable_state_does_not(self):
        self.assertEqual("BLOCKED", PROMOTER.evaluate_pull_request(
            pull_request(isDraft=True), [], expected_head=None)["status"])
        optional_failure = PROMOTER.evaluate_pull_request(
            pull_request(mergeStateStatus="UNSTABLE"),
            [{"name": "optional-preview", "state": "FAILURE", "bucket": "fail"}],
            expected_head=None,
        )
        self.assertEqual("READY", optional_failure["status"])

    def test_unknown_and_behind_merge_states_defer_to_normal_github_merge(self):
        for pr in (
            pull_request(mergeable="UNKNOWN", mergeStateStatus="UNKNOWN"),
            pull_request(mergeStateStatus="BEHIND"),
        ):
            with self.subTest(pr=pr):
                result = PROMOTER.evaluate_pull_request(
                    pr, [{"name": "optional", "state": "IN_PROGRESS"}], expected_head="a" * 40,
                )
                self.assertEqual("READY", result["status"])

    def test_github_reported_conflicts_remain_blocked(self):
        for pr in (
            pull_request(mergeable="CONFLICTING"),
            pull_request(mergeStateStatus="DIRTY"),
        ):
            with self.subTest(pr=pr):
                result = PROMOTER.evaluate_pull_request(pr, [], expected_head="a" * 40)
                self.assertEqual("BLOCKED", result["status"])
                self.assertIn("PR_HAS_MERGE_CONFLICTS", result["blockers"])

    def test_optional_failed_pending_or_missing_checks_do_not_invent_a_gate(self):
        for checks in (
            [{"name": "optional-preview", "state": "FAILURE", "bucket": "fail"}],
            [{"name": "optional-preview", "state": "IN_PROGRESS", "bucket": "pending"}],
            [],
            [{"name": "optional-preview", "state": "SKIPPED", "bucket": "skipping"}],
        ):
            with self.subTest(checks=checks):
                result = PROMOTER.evaluate_pull_request(
                    pull_request(), checks, expected_head=None
                )
                self.assertEqual("READY", result["status"])
                self.assertEqual([], result["blockers"])
                self.assertEqual(checks[0]["name"] if checks else None,
                                 result["checks"][0]["name"] if result["checks"] else None)

    def test_actual_github_required_gate_blocks_and_optional_failure_does_not(self):
        result = PROMOTER.evaluate_pull_request(
            pull_request(mergeStateStatus="BLOCKED"),
            [{"name": "required-security", "state": "FAILURE", "bucket": "fail"}],
            expected_head=None,
        )
        self.assertEqual("BLOCKED", result["status"])
        self.assertIn("GITHUB_REPOSITORY_POLICY_BLOCKED", result["blockers"])
        self.assertEqual("AUTHORITY", result["failure_class"])

    def test_review_requirement_or_head_drift_blocks_merge(self):
        checks = [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}]
        optional_change_request = PROMOTER.evaluate_pull_request(
            pull_request(reviewDecision="CHANGES_REQUESTED"),
            [{"name": "optional-preview", "state": "FAILURE"}], expected_head=None,
        )
        self.assertEqual("READY", optional_change_request["status"])
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

    def test_verified_ancestor_base_does_not_override_other_protected_gates(self):
        checks = [{"name": "focused-tests", "state": "SUCCESS", "bucket": "pass"}]
        ready = PROMOTER.evaluate_pull_request(
            pull_request(), checks, expected_head="a" * 40,
            expected_base_sha="e" * 40, base_ref_ancestry_verified=True,
        )
        self.assertEqual("READY", ready["status"])
        for pr, expected_head, evidence in (
            (pull_request(mergeStateStatus="DIRTY"), "a" * 40, checks),
            (pull_request(reviewDecision="REVIEW_REQUIRED"), "a" * 40, checks),
            (pull_request(), "b" * 40, checks),
            (pull_request(mergeStateStatus="BLOCKED"), "a" * 40,
             [{"name": "required-security", "state": "FAILURE"}]),
        ):
            with self.subTest(pr=pr, expected_head=expected_head, evidence=evidence):
                result = PROMOTER.evaluate_pull_request(
                    pr, evidence, expected_head=expected_head,
                    expected_base_sha="e" * 40, base_ref_ancestry_verified=True,
                )
                self.assertEqual("BLOCKED", result["status"])

    def test_preflight_proves_older_base_commit_ancestry_and_fails_closed(self):
        for base, object_type, ancestry_exit, expected in (
            ("c" * 40, "commit", 0, "READY"),
            ("c" * 40, "commit", 1, "BLOCKED"),
            ("c" * 40, "commit", 128, "BLOCKED"),
            ("c" * 40, "tree", 0, "BLOCKED"),
            ("c" * 40, None, 0, "BLOCKED"),
            (None, "commit", 0, "BLOCKED"),
            ("--malformed-ref", "commit", 0, "BLOCKED"),
        ):
            with self.subTest(base=base, object_type=object_type, ancestry_exit=ancestry_exit):
                commands = []
                def runner(command, *, cwd, check=True):
                    commands.append(command)
                    if command[:2] == ["git", "rev-parse"]:
                        return subprocess.CompletedProcess(command, 0, "e" * 40 + "\n", "")
                    if command[:2] == ["git", "cat-file"]:
                        return subprocess.CompletedProcess(command, 0 if object_type else 128, object_type or "", "")
                    if command[:2] == ["git", "merge-base"]:
                        return subprocess.CompletedProcess(command, ancestry_exit, "", "")
                    if command[:3] == ["gh", "pr", "view"]:
                        return subprocess.CompletedProcess(command, 0, json.dumps(pull_request(baseRefOid=base)), "")
                    if command[:3] == ["gh", "pr", "checks"]:
                        return subprocess.CompletedProcess(command, 0, json.dumps([{"name": "focused-tests", "state": "SUCCESS"}]), "")
                    return subprocess.CompletedProcess(command, 0, "", "")
                result, _ = PROMOTER.preflight(self.isolated_git_repo(), 7, expected_head="a" * 40, runner=runner)
                self.assertEqual(expected, result["status"])
                self.assertEqual("e" * 40, result["canonical_sha"])
                if expected == "READY":
                    self.assertIn(["git", "merge-base", "--is-ancestor", base, "e" * 40], commands)
                    self.assertTrue(result["base_ref_ancestry_verified"])
                else:
                    self.assertIn("BASE_REF_STALE", result["blockers"])
                if base is None or base == "--malformed-ref":
                    self.assertFalse(any(cmd[:2] == ["git", "cat-file"] for cmd in commands))

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

    def test_unknown_preflight_uses_normal_merge_and_records_github_refusal(self):
        commands = []
        merge_attempted = False

        def runner(command, *, cwd, check=True):
            nonlocal merge_attempted
            commands.append(command)
            if command[:2] == ["git", "rev-parse"]:
                return subprocess.CompletedProcess(command, 0, "c" * 40 + "\n", "")
            if command[:3] == ["gh", "pr", "view"]:
                return subprocess.CompletedProcess(command, 0, json.dumps(pull_request(
                    mergeStateStatus="BLOCKED" if merge_attempted else "UNKNOWN",
                )), "")
            if command[:3] == ["gh", "pr", "checks"]:
                return subprocess.CompletedProcess(command, 0, json.dumps([
                    {"name": "optional-preview", "state": "FAILURE", "bucket": "fail"},
                ]), "")
            if command[:3] == ["gh", "pr", "merge"]:
                merge_attempted = True
                return subprocess.CompletedProcess(command, 1, "", "Protected branch requires required-security")
            return subprocess.CompletedProcess(command, 0, "", "")

        plan = PROMOTER.evaluate_pull_request(
            pull_request(mergeStateStatus="UNKNOWN"),
            [{"name": "optional-preview", "state": "FAILURE"}],
            expected_head="a" * 40,
        )
        result = PROMOTER.execute_merge(
            self.isolated_git_repo(), 7, plan,
            {"remote": "origin", "canonical_ref": "refs/heads/main"}, runner=runner,
        )

        self.assertEqual("MERGE_REFUSED_BY_GITHUB", result["status"])
        self.assertEqual("AUTHORITY", result["failure_class"])
        self.assertIn("Protected branch requires required-security", result["merge_error"])
        merge_command = next(command for command in commands if command[:3] == ["gh", "pr", "merge"])
        self.assertIn("--match-head-commit", merge_command)
        self.assertNotIn("--admin", merge_command)

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
