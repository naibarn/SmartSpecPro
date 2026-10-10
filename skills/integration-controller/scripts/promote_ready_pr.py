#!/usr/bin/env python3
"""Preflight and normally merge one verified slice PR against repository policy."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tomllib
from pathlib import Path
from typing import Any, Callable


Runner = Callable[..., subprocess.CompletedProcess[str]]


def run_command(
    command: list[str], *, cwd: Path, check: bool = True
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, cwd=cwd, text=True, capture_output=True, check=False)
    if check and result.returncode:
        raise RuntimeError(f"COMMAND_FAILED: {command[0]} exit={result.returncode}")
    return result


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

    return {
        "status": "READY" if not blockers else "BLOCKED",
        "blockers": blockers,
        "head_sha": head_sha,
        "base_branch": pull_request.get("baseRefName"),
        "merge_state": pull_request.get("mergeStateStatus"),
        "checks": [
            {"name": check.get("name"), "state": check.get("state"), "link": check.get("link")}
            for check in checks
        ],
        "url": pull_request.get("url"),
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
            "state,isDraft,headRefOid,baseRefName,mergeable,mergeStateStatus,reviewDecision,url",
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
        canonical_branch=canonical_branch,
    )
    result["canonical_ref"] = policy["canonical_ref"]
    result["canonical_sha"] = canonical_sha
    result["pr_number"] = pr_number
    return result, policy


def execute_merge(
    repo: Path,
    pr_number: int,
    plan: dict[str, Any],
    policy: dict[str, Any],
    *,
    runner: Runner = run_command,
) -> dict[str, Any]:
    if plan["status"] != "READY":
        return {**plan, "status": "BLOCKED"}

    latest, latest_policy = preflight(
        repo, pr_number, expected_head=plan["head_sha"], runner=runner
    )
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
        return {**plan, "status": "MERGE_REFUSED_BY_GITHUB"}

    refreshed = _json_command(
        ["gh", "pr", "view", str(pr_number), "--json", "state,mergeCommit,mergeStateStatus"],
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
    return {**plan, "status": "MERGED", "merge_sha": merge_sha, "canonical_sha": canonical_sha}


def main(argv: list[str] | None = None, *, runner: Runner = run_command) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pr", type=int, required=True)
    parser.add_argument("--repository", type=Path, default=Path.cwd())
    parser.add_argument("--expected-head")
    parser.add_argument("--execute", action="store_true", help="perform normal GitHub merge after passing preflight")
    args = parser.parse_args(argv)
    try:
        repo = Path(str(runner(["git", "rev-parse", "--show-toplevel"], cwd=args.repository, check=True).stdout).strip())
        plan, policy = preflight(repo, args.pr, expected_head=args.expected_head, runner=runner)
        if args.execute and plan["status"] == "READY":
            result = execute_merge(repo, args.pr, plan, policy, runner=runner)
        else:
            result = plan
        print(json.dumps(result, sort_keys=True))
        return 0 if result["status"] in {"READY", "MERGED"} else 3
    except (OSError, RuntimeError, KeyError, TypeError, ValueError) as error:
        print(json.dumps({"status": "CONTROLLER_ERROR", "reason": str(error)}, sort_keys=True))
        return 2


if __name__ == "__main__":
    sys.exit(main())
