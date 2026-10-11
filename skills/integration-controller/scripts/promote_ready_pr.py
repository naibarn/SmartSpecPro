#!/usr/bin/env python3
"""Preflight and normally merge one verified slice PR against repository policy."""

from __future__ import annotations

import argparse
import contextlib
import datetime
import hashlib
import importlib.util
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import tomllib
from pathlib import Path
from typing import Any, Callable


Runner = Callable[..., subprocess.CompletedProcess[str]]


def run_command(
    command: list[str], *, cwd: Path, check: bool = True
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False, timeout=60)
    if check and result.returncode:
        raise RuntimeError(f"COMMAND_FAILED: {command[0]} exit={result.returncode}")
    return result


def write_receipt(path: Path, result: dict[str, Any]) -> None:
    """Atomically replace an already reserved task-owned receipt."""
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, delete=False) as receipt:
            temporary = Path(receipt.name)
            json.dump(result, receipt, sort_keys=True)
            receipt.flush()
            os.fsync(receipt.fileno())
        os.replace(temporary, path)
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def classify_failure(evidence: str, *, blockers: list[str] | None = None) -> str:
    """Classify an observed failure without treating unknowns as infrastructure."""
    normalized = f"{evidence} {' '.join(blockers or [])}".lower()
    if any(marker in normalized for marker in (
        "timed out", "timeout", "connection reset", "connection refused",
        "temporary failure in name resolution", "could not resolve host",
        "network is unreachable", "502 bad gateway", "503 service unavailable",
        "504 gateway timeout", "http 500", "http 502", "http 503", "http 504",
    )):
        return "INFRASTRUCTURE"
    if any(marker in normalized for marker in (
        "merge conflict", "conflict", "expected_head_mismatch", "base_ref_stale",
        "pr_not_mergeable", "pr_superseded",
    )):
        return "CONFLICT"
    if any(marker in normalized for marker in (
        "permission denied", "resource not accessible", "review_required",
        "changes_requested", "branch protection", "protected branch", "pr_closed_externally",
    )):
        return "AUTHORITY"
    if any(marker in normalized for marker in (
        "check_not_passing", "check failed", "tests failed", "build failed",
        "conclusion=failure", "state=failure",
    )):
        return "APPLICATION"
    return "UNKNOWN"


def _diagnostic_excerpt(diagnostic: str) -> str:
    redacted = re.sub(
        r"(?i)(authorization|token|password|secret|api[_-]?key)(\s*[:=]\s*)[^\s,;]+",
        r"\1\2[REDACTED]",
        diagnostic,
    )
    redacted = re.sub(r"\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,})\b", "[REDACTED_TOKEN]", redacted)
    return " ".join(redacted.split())[:240]


class RetryingCommandRunner:
    """Retry only observed transient Git/GitHub transport failures, with a hard bound."""

    def __init__(
        self,
        runner: Runner = run_command,
        *,
        max_attempts: int = 3,
        base_delay_seconds: float = 0.5,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.runner = runner
        self.max_attempts = max(1, max_attempts)
        self.base_delay_seconds = max(0, base_delay_seconds)
        self.sleep = sleep
        self.history: list[dict[str, Any]] = []

    def __call__(
        self, command: list[str], *, cwd: Path, check: bool = True
    ) -> subprocess.CompletedProcess[str]:
        result = None
        for attempt in range(1, self.max_attempts + 1):
            try:
                result = self.runner(command, cwd=cwd, check=False)
            except subprocess.TimeoutExpired as error:
                stdout = error.stdout.decode("utf-8", "replace") if isinstance(error.stdout, bytes) else error.stdout or ""
                stderr = error.stderr.decode("utf-8", "replace") if isinstance(error.stderr, bytes) else error.stderr or ""
                result = subprocess.CompletedProcess(command, 124, stdout, f"{stderr}\ncommand timed out")
            diagnostic = f"{result.stdout}\n{result.stderr}"
            failure_class = classify_failure(diagnostic) if result.returncode else "UNKNOWN"
            self.history.append({
                "attempt": attempt,
                "command": f"{Path(command[0]).name} {command[1] if len(command) > 1 else ''}".strip(),
                "exit_code": result.returncode,
                "failure_class": failure_class,
                "diagnostic_sha256": hashlib.sha256(diagnostic.encode("utf-8", "replace")).hexdigest(),
                "diagnostic_excerpt": _diagnostic_excerpt(diagnostic),
            })
            if result.returncode == 0 or failure_class != "INFRASTRUCTURE" or attempt == self.max_attempts:
                break
            self.sleep(self.base_delay_seconds * (2 ** (attempt - 1)))

        assert result is not None
        if check and result.returncode:
            last = self.history[-1]
            raise RuntimeError(
                f"COMMAND_FAILED: {last['command']} exit={result.returncode} "
                f"class={last['failure_class']} attempts={last['attempt']} "
                f"evidence_sha256={last['diagnostic_sha256']}"
            )
        return result


@contextlib.contextmanager
def repository_merge_lock(repo: Path):
    """Share one short promotion lock across all worktrees on this host."""
    try:
        import fcntl
    except ImportError as error:
        raise RuntimeError("MERGE_SERIALIZATION_UNAVAILABLE_ON_THIS_HOST") from error

    common = Path(run_command(["git", "rev-parse", "--git-common-dir"], cwd=repo).stdout.strip())
    if not common.is_absolute():
        common = repo / common
    with (common / "progressive-integration.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError("MERGE_CRITICAL_SECTION_BUSY") from error
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def continue_next_workunit(
    repo: Path, result: dict[str, Any], work: dict[str, Any],
    command: list[str], workspace: Path, *, runner: Runner = run_command,
) -> dict[str, Any]:
    """Dispatch an explicitly authorized worker using the existing WorkUnit policy."""
    if result.get("status") not in {"MERGED", "ALREADY_MERGED"}:
        return {"status": "NOT_INTEGRATED"}
    policy_source = repo / "skills/development-lifecycle/lifecycle_policy.py"
    spec = importlib.util.spec_from_file_location("integration_lifecycle_policy", policy_source)
    if spec is None or spec.loader is None:
        raise RuntimeError("SHARED_LIFECYCLE_POLICY_UNAVAILABLE")
    policy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(policy)
    repository_policy = _repository_policy(repo)
    runner(["git", "fetch", "--no-tags", repository_policy["remote"], repository_policy["canonical_ref"]], cwd=repo)
    canonical_sha = runner(["git", "rev-parse", "FETCH_HEAD"], cwd=repo).stdout.strip()
    unit = policy.next_ready_workunit(
        work["workunits"], canonical_sha=canonical_sha,
        completed_workunits=work.get("completed_workunits", []),
        satisfied_predicates=work.get("satisfied_predicates", []),
        prohibited_retries=work.get("prohibited_retries", []),
    )
    if unit is None:
        return {"status": "NO_READY_WORKUNIT", "canonical_sha": canonical_sha}
    # Never reset, clean, reuse, or modify a pre-existing checkout here.
    runner(["git", "worktree", "add", "--detach", str(workspace), canonical_sha], cwd=repo)
    actual = runner(["git", "rev-parse", "HEAD"], cwd=workspace).stdout.strip()
    dirty = runner(["git", "status", "--porcelain"], cwd=workspace).stdout.strip()
    if actual != canonical_sha or dirty:
        raise RuntimeError("CONTINUATION_WORKSPACE_NOT_CANONICAL_AND_CLEAN")
    worker = runner(
        [*command, "--workunit-id", unit, "--canonical-sha", canonical_sha],
        cwd=workspace, check=False,
    )
    return {
        "status": "WORKER_SUCCEEDED" if worker.returncode == 0 else "WORKER_FAILED",
        "workunit_id": unit, "canonical_sha": canonical_sha,
        "workspace": str(workspace), "exit_code": worker.returncode,
    }


def _json_command(command: list[str], *, cwd: Path, runner: Runner) -> Any:
    result = runner(command, cwd=cwd, check=False)
    if result.returncode:
        raise RuntimeError(f"GITHUB_QUERY_FAILED: {command[1:3]}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("GITHUB_RESPONSE_INVALID_JSON") from error


def evaluate_pull_request(
    pull_request: dict[str, Any],
    checks: list[dict[str, Any]],
    *,
    expected_head: str | None,
    expected_base_sha: str | None = None,
    canonical_branch: str = "main",
) -> dict[str, Any]:
    blockers: list[str] = []
    if pull_request.get("state") != "OPEN":
        blockers.append("PR_NOT_OPEN")
    if pull_request.get("isDraft") is True:
        blockers.append("PR_IS_DRAFT")
    if pull_request.get("baseRefName") != canonical_branch:
        blockers.append("BASE_IS_NOT_CONFIGURED_CANONICAL_REF")
    if pull_request.get("mergeable") != "MERGEABLE":
        blockers.append("PR_NOT_MERGEABLE")
    if pull_request.get("mergeStateStatus") != "CLEAN":
        blockers.append("GITHUB_MERGE_STATE_NOT_CLEAN")
    if pull_request.get("reviewDecision") in {"REVIEW_REQUIRED", "CHANGES_REQUESTED"}:
        blockers.append("REVIEW_REQUIREMENT_UNSATISFIED")

    head_sha = pull_request.get("headRefOid")
    if expected_head and head_sha != expected_head:
        blockers.append("EXPECTED_HEAD_MISMATCH")
    if expected_base_sha and pull_request.get("baseRefOid") != expected_base_sha:
        blockers.append("BASE_REF_STALE")

    if not checks:
        blockers.append("NO_CI_CHECK_EVIDENCE")
    elif not any(check.get("state") == "SUCCESS" for check in checks):
        blockers.append("NO_CI_CHECK_PASSED")
    for check in checks:
        state = check.get("state")
        # Skipped jobs are allowed only as non-applicable workflow steps. GitHub's
        # own merge operation remains authoritative for configured required checks.
        if state not in {"SUCCESS", "SKIPPED"}:
            blockers.append(f"CHECK_NOT_PASSING:{check.get('name', 'unnamed')}")

    failure_class = classify_failure("", blockers=blockers)
    if pull_request.get("state") == "CLOSED":
        failure_class = "AUTHORITY"
    elif expected_head and head_sha != expected_head:
        failure_class = "CONFLICT"
    elif any(check.get("state") == "FAILURE" for check in checks):
        failure_class = "APPLICATION"

    return {
        "status": "READY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "failure_class": failure_class,
        "pull_request_state": pull_request.get("state", "UNKNOWN"),
        "head_sha": head_sha,
        "merge_sha": (pull_request.get("mergeCommit") or {}).get("oid"),
        "merged_at": pull_request.get("mergedAt"),
        "base_branch": pull_request.get("baseRefName"),
        "merge_state": pull_request.get("mergeStateStatus"),
        "checks": [
            {"name": check.get("name"), "state": check.get("state"), "link": check.get("link")}
            for check in checks
        ],
        "url": pull_request.get("url"),
        "slice_commits": pull_request.get("commits", []),
        "integration_delta": {
            "commits": len(pull_request["commits"]) if "commits" in pull_request else "UNKNOWN",
            "files": pull_request.get("changedFiles", "UNKNOWN"),
            "insertions": pull_request.get("additions", "UNKNOWN"),
            "deletions": pull_request.get("deletions", "UNKNOWN"),
        },
    }


def _repository_policy(repo: Path) -> dict[str, Any]:
    policy_path = repo / ".development-repository.toml"
    with policy_path.open("rb") as policy_file:
        policy = tomllib.load(policy_file).get("repository", {})
    remote = policy.get("remote")
    canonical_ref = policy.get("canonical_ref")
    if not remote or not isinstance(canonical_ref, str) or not canonical_ref.startswith("refs/heads/"):
        raise RuntimeError("CANONICAL_REPOSITORY_POLICY_INVALID")
    return {"remote": str(remote), "canonical_ref": canonical_ref}


def preflight(
    repo: Path,
    pr_number: int,
    *,
    expected_head: str | None = None,
    runner: Runner = run_command,
) -> tuple[dict[str, Any], dict[str, Any]]:
    policy = _repository_policy(repo)
    canonical_branch = policy["canonical_ref"].removeprefix("refs/heads/")
    runner(
        ["git", "fetch", "--no-tags", policy["remote"], policy["canonical_ref"]],
        cwd=repo,
        check=True,
    )
    canonical_sha = runner(["git", "rev-parse", "FETCH_HEAD"], cwd=repo, check=True).stdout.strip()
    pull_request = _json_command(
        [
            "gh", "pr", "view", str(pr_number), "--json",
            "state,isDraft,headRefOid,baseRefName,baseRefOid,mergeable,mergeStateStatus,reviewDecision,url,commits,changedFiles,additions,deletions,mergeCommit,mergedAt",
        ],
        cwd=repo,
        runner=runner,
    )
    checks = _json_command(
        ["gh", "pr", "checks", str(pr_number), "--json", "name,state,bucket,link"],
        cwd=repo,
        runner=runner,
    )
    if not isinstance(pull_request, dict) or not isinstance(checks, list):
        raise RuntimeError("GITHUB_RESPONSE_SHAPE_INVALID")
    result = evaluate_pull_request(
        pull_request,
        checks,
        expected_head=expected_head,
        expected_base_sha=canonical_sha,
        canonical_branch=canonical_branch,
    )
    result["canonical_ref"] = policy["canonical_ref"]
    result["canonical_sha"] = canonical_sha
    result["pr_number"] = pr_number
    return result, policy


def _integration_metrics(
    plan: dict[str, Any], merge_sha: str, canonical_sha: str, merged_at_value: str | None,
) -> dict[str, Any]:
    age: float | str = "UNKNOWN"
    try:
        committed = [datetime.datetime.fromisoformat(row["committedDate"].replace("Z", "+00:00"))
                     for row in plan.get("slice_commits", [])]
        merged_at = datetime.datetime.fromisoformat(str(merged_at_value).replace("Z", "+00:00"))
        if committed:
            age = max(0, (merged_at - min(committed)).total_seconds() / 3600)
    except (KeyError, TypeError, ValueError):
        pass
    return {
        "branch_age_hours": age,
        "merge_latency_minutes": "UNKNOWN",
        "integration_delta": plan["integration_delta"],
        "conflict_attempts": 0,
        "promotion_attempts": 1,
        "conflict_rate": 0,
        "main_build_health": {"sha": merge_sha, "status": "PENDING_POST_INTEGRATION"},
        "time_to_first_preview_minutes": "UNKNOWN",
    }


def _reconcile_pr_lifecycle(
    repo: Path,
    pr_number: int,
    plan: dict[str, Any],
    observed: dict[str, Any],
    policy: dict[str, Any],
    *,
    runner: Runner,
) -> dict[str, Any] | None:
    """Reconcile PR state changed by another session before reporting blocked."""
    state = observed.get("pull_request_state")
    expected_head = plan.get("head_sha")
    if state == "MERGED":
        merge_sha = observed.get("merge_sha")
        if not merge_sha:
            return {**observed, "status": "MERGED_SHA_NOT_REPORTED", "merge_source": "ANOTHER_SESSION"}
        runner(["git", "fetch", "--no-tags", policy["remote"], policy["canonical_ref"]], cwd=repo)
        canonical_sha = runner(["git", "rev-parse", "FETCH_HEAD"], cwd=repo).stdout.strip()
        ancestry = runner(
            ["git", "merge-base", "--is-ancestor", merge_sha, canonical_sha],
            cwd=repo,
            check=False,
        )
        if ancestry.returncode:
            return {
                **observed,
                "status": "MERGED_SHA_NOT_YET_VERIFIED_ON_CANONICAL_REF",
                "merge_source": "ANOTHER_SESSION",
                "merge_sha": merge_sha,
                "canonical_sha": canonical_sha,
            }
        return {
            **observed,
            "status": "ALREADY_MERGED",
            "merge_source": "ANOTHER_SESSION",
            "merge_sha": merge_sha,
            "canonical_sha": canonical_sha,
            "metrics": _integration_metrics(plan, merge_sha, canonical_sha, observed.get("merged_at")),
        }
    if state == "CLOSED":
        return {
            **observed,
            "status": "PR_CLOSED_EXTERNALLY",
            "failure_class": "AUTHORITY",
        }
    if state == "OPEN" and expected_head and observed.get("head_sha") != expected_head:
        return {
            **observed,
            "status": "PR_SUPERSEDED",
            "failure_class": "CONFLICT",
            "expected_head": expected_head,
        }
    return None


def execute_merge(
    repo: Path,
    pr_number: int,
    plan: dict[str, Any],
    policy: dict[str, Any],
    *,
    runner: Runner = run_command,
) -> dict[str, Any]:
    with repository_merge_lock(repo):
        return _execute_merge(repo, pr_number, plan, policy, runner=runner)


def _execute_merge(
    repo: Path, pr_number: int, plan: dict[str, Any], policy: dict[str, Any],
    *, runner: Runner = run_command,
) -> dict[str, Any]:
    latest, latest_policy = preflight(
        repo, pr_number, expected_head=plan.get("head_sha"), runner=runner
    )
    reconciled = _reconcile_pr_lifecycle(
        repo, pr_number, plan, latest, latest_policy, runner=runner,
    )
    if reconciled is not None:
        return reconciled
    if latest["status"] != "READY":
        return {**latest, "status": "BLOCKED_BEFORE_MERGE"}
    if latest_policy != policy:
        return {**latest, "status": "REPOSITORY_POLICY_CHANGED"}
    plan = latest

    # GitHub checks expectedHeadCommit and still applies its branch/ruleset policy.
    # No admin bypass, force update, or branch deletion is requested here.
    merge = runner(
        [
            "gh", "pr", "merge", str(pr_number), "--squash",
            "--match-head-commit", plan["head_sha"],
        ],
        cwd=repo,
        check=False,
    )
    if merge.returncode:
        refreshed, refreshed_policy = preflight(
            repo, pr_number, expected_head=plan["head_sha"], runner=runner,
        )
        reconciled = _reconcile_pr_lifecycle(
            repo, pr_number, plan, refreshed, refreshed_policy, runner=runner,
        )
        if reconciled is not None:
            return reconciled
        failure = classify_failure(f"{merge.stdout}\n{merge.stderr}")
        return {
            **refreshed,
            "status": "MERGE_REFUSED_BY_GITHUB",
            "failure_class": failure,
            "merge_error_observed": True,
        }

    refreshed = _json_command(
        ["gh", "pr", "view", str(pr_number), "--json", "state,mergeCommit,mergeStateStatus,mergedAt"],
        cwd=repo,
        runner=runner,
    )
    if refreshed.get("state") != "MERGED":
        return {**plan, "status": "MERGE_QUEUED_OR_PENDING"}

    runner(
        ["git", "fetch", "--no-tags", policy["remote"], policy["canonical_ref"]],
        cwd=repo,
        check=True,
    )
    canonical_sha = runner(["git", "rev-parse", "FETCH_HEAD"], cwd=repo, check=True).stdout.strip()
    merge_sha = (refreshed.get("mergeCommit") or {}).get("oid")
    if not merge_sha:
        return {**plan, "status": "MERGED_SHA_NOT_REPORTED", "canonical_sha": canonical_sha}
    ancestry = runner(
        ["git", "merge-base", "--is-ancestor", merge_sha, canonical_sha],
        cwd=repo,
        check=False,
    )
    if ancestry.returncode:
        return {
            **plan,
            "status": "MERGED_SHA_NOT_YET_VERIFIED_ON_CANONICAL_REF",
            "merge_sha": merge_sha,
            "canonical_sha": canonical_sha,
        }
    metrics = _integration_metrics(plan, merge_sha, canonical_sha, refreshed.get("mergedAt"))
    return {**plan, "status": "MERGED", "merge_sha": merge_sha, "canonical_sha": canonical_sha,
            "metrics": metrics}


def main(argv: list[str] | None = None, *, runner: Runner = run_command) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--expected-head")
    parser.add_argument("--execute", action="store_true", help="perform normal GitHub merge after passing preflight")
    parser.add_argument("--workunits", type=Path, help="existing WorkUnit ledger export; never contains executable commands")
    parser.add_argument("--worker-command", help="explicitly authorized worker argv as a JSON array; no shell execution")
    parser.add_argument("--next-worktree", type=Path, help="new isolated path for the next ready WorkUnit")
    parser.add_argument("--receipt", type=Path, help="new durable integration receipt, written before worker dispatch")
    args = parser.parse_args(argv)
    retrying_runner = RetryingCommandRunner(runner)
    try:
        continuation = [args.workunits, args.worker_command, args.next_worktree]
        work = None
        worker_command = None
        if any(continuation):
            if not all(continuation) or not args.receipt or not args.execute:
                raise ValueError("CONTINUATION_REQUIRES_WORKUNITS_COMMAND_WORKTREE_RECEIPT_AND_EXECUTE")
            worker_command = json.loads(args.worker_command)
            if not isinstance(worker_command, list) or not worker_command or not all(isinstance(x, str) and x for x in worker_command):
                raise ValueError("WORKER_COMMAND_MUST_BE_NONEMPTY_ARGV")
            work = json.loads(args.workunits.read_text())
            if not isinstance(work, dict) or not isinstance(work.get("workunits"), list):
                raise ValueError("WORKUNIT_LEDGER_INVALID")
            args.next_worktree = args.next_worktree.resolve()
            if args.next_worktree.exists():
                raise ValueError("CONTINUATION_WORKSPACE_ALREADY_EXISTS")
        if args.receipt and (args.receipt.exists() or not args.receipt.parent.is_dir()):
            raise ValueError("RECEIPT_MUST_BE_NEW_WITH_EXISTING_PARENT")
        if args.receipt:
            # Reserve before mutation so a path collision cannot lose a merge receipt.
            with args.receipt.open("x") as receipt:
                json.dump({"status": "INTEGRATION_PENDING", "pr_number": args.pr}, receipt)
                receipt.flush()
                os.fsync(receipt.fileno())
        repo = Path(str(retrying_runner(["git", "rev-parse", "--show-toplevel"], cwd=args.repository, check=True).stdout).strip())
        plan, policy = preflight(repo, args.pr, expected_head=args.expected_head, runner=retrying_runner)
        if args.execute:
            result = execute_merge(repo, args.pr, plan, policy, runner=retrying_runner)
        else:
            result = plan
        result["retry_history"] = [
            item for item in retrying_runner.history
            if item["attempt"] > 1 or item["exit_code"] != 0
        ]
        if args.receipt:
            write_receipt(args.receipt, result)
        if work is not None and result["status"] in {"MERGED", "ALREADY_MERGED"}:
            # execute_merge has released its lock: implementation runs in parallel.
            try:
                result["continuation"] = continue_next_workunit(
                    repo, result, work, worker_command, args.next_worktree, runner=runner,
                )
            except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
                result["continuation"] = {"status": "WORKER_BLOCKED", "reason": str(error)}
            write_receipt(args.receipt, result)
        print(json.dumps(result, sort_keys=True))
        if result.get("continuation", {}).get("status") in {"WORKER_FAILED", "WORKER_BLOCKED"}:
            return 3
        return 0 if result["status"] in {"READY", "MERGED", "ALREADY_MERGED"} else 3
    except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
        last_attempt = retrying_runner.history[-1] if retrying_runner.history else None
        failed_attempt = last_attempt if last_attempt and last_attempt["exit_code"] != 0 else None
        result = {
            "status": "CONTROLLER_ERROR",
            "reason": str(error),
            "failure_class": failed_attempt["failure_class"] if failed_attempt else classify_failure(str(error)),
            "retry_history": [
                item for item in retrying_runner.history
                if item["attempt"] > 1 or item["exit_code"] != 0
            ],
        }
        if args.receipt and args.receipt.exists():
            try:
                current_receipt = json.loads(args.receipt.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                current_receipt = None
            if isinstance(current_receipt, dict) and current_receipt.get("status") == "INTEGRATION_PENDING":
                write_receipt(args.receipt, result)
        print(json.dumps(result, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
