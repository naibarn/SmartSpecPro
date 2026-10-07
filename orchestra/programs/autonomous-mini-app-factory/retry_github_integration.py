#!/usr/bin/env python3
"""Retry one already-validated Mini App checkpoint through normal GitHub PR flow."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from pathlib import Path
from typing import Callable


def retry_delay_seconds(attempt: int, base_seconds: int = 5, cap_seconds: int = 300) -> int:
    if attempt < 0 or base_seconds < 1 or cap_seconds < 1:
        raise ValueError("retry policy values must be positive")
    return min(base_seconds * (2**attempt), cap_seconds)


def mark_integration_retryable(
    program: dict[str, object], *, branch: str, checkpoint_sha: str,
    task_worktree: str, attempt: int, error: str,
) -> dict[str, object]:
    """Record only the integration workunit as retryable; keep the program live."""
    blockers = program.setdefault("blockedWorkunits", [])
    if not isinstance(blockers, list):
        blockers = []
        program["blockedWorkunits"] = blockers
    wait = {
        "id": "INTEGRATE_RESEARCH_NOTES_UI_CHECKPOINT",
        "state": "WAITING_EXTERNAL_RETRYABLE",
        "taskWorktree": task_worktree,
        "localCheckpointSha": checkpoint_sha,
        "intendedRemoteBranch": branch,
        "pendingPullRequest": True,
        "attempt": attempt,
        "lastError": error[:500],
        "nextAction": "Retry push and normal PR integration automatically; continue independent implementation work.",
    }
    blockers[:] = [item for item in blockers if not isinstance(item, dict) or item.get("id") != wait["id"]]
    blockers.append(wait)
    autonomy = program.setdefault("autonomy", {})
    if isinstance(autonomy, dict):
        autonomy["integrationWaitPolicy"] = "WAITING_EXTERNAL_RETRYABLE is scoped to this integration workunit; the program remains WORKING."
    return program


def persist_retryable_state(
    *, repo_dir: Path, branch: str, checkpoint_sha: str, attempt: int, error: str,
) -> None:
    program_path = repo_dir / "orchestra/programs/autonomous-mini-app-factory/program.json"
    if not program_path.exists():
        return
    program = json.loads(program_path.read_text())
    mark_integration_retryable(
        program,
        branch=branch,
        checkpoint_sha=checkpoint_sha,
        task_worktree=str(repo_dir),
        attempt=attempt,
        error=error,
    )
    program["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    program_path.write_text(json.dumps(program, indent=2) + "\n")


def record_integration_success(*, repo_dir: Path, integrated_sha: str, pr_url: str | None = None) -> None:
    program_path = repo_dir / "orchestra/programs/autonomous-mini-app-factory/program.json"
    if not program_path.exists():
        return
    program = json.loads(program_path.read_text())
    program["blockedWorkunits"] = [
        item for item in program.get("blockedWorkunits", [])
        if not isinstance(item, dict) or item.get("id") != "INTEGRATE_RESEARCH_NOTES_UI_CHECKPOINT"
    ]
    autonomy = program.setdefault("autonomy", {})
    if isinstance(autonomy, dict):
        previous = autonomy.get("githubRetryPolicy", {})
        autonomy["githubRetryPolicy"] = {
            "state": "IDLE_AFTER_SUCCESS",
            "lastScenario": "Retryable GitHub integration completed without a user prompt.",
            "lastPr": pr_url or (previous.get("lastPr") if isinstance(previous, dict) else None),
            "integratedSha": integrated_sha,
        }
    program["canonical"] = {
        **program.get("canonical", {}),
        "sha": integrated_sha,
    }
    program["updatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    program_path.write_text(json.dumps(program, indent=2) + "\n")


def _run(command: list[str], *, cwd: Path, capture: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=cwd, text=True, capture_output=capture, check=False)


def _gh_json(command: list[str], *, cwd: Path) -> object:
    result = _run(command, cwd=cwd)
    if result.returncode:
        raise RuntimeError((result.stderr or result.stdout or "GitHub command failed").strip())
    return json.loads(result.stdout)


def retry_checkpoint(
    *,
    repo_dir: Path,
    repository: str,
    remote_branch: str,
    checkpoint_sha: str,
    attempts: int = 10,
    base_seconds: int = 5,
    cap_seconds: int = 300,
    title: str = "feat(mini-app): add Research Notes reference UI",
    body: str = "Partial Mini App Factory checkpoint.",
    sleep: Callable[[float], None] = time.sleep,
) -> int:
    """Push, open/update a PR, and request a normal merge with bounded retries."""
    if attempts < 1:
        raise ValueError("attempts must be positive")

    last_error = "GitHub integration has not completed"

    for attempt in range(attempts):
        fetch = _run(["git", "fetch", "origin", "main"], cwd=repo_dir)
        if fetch.returncode:
            last_error = (fetch.stderr or fetch.stdout or "fetch failed").strip()
        else:
            already_integrated = _run(
                ["git", "merge-base", "--is-ancestor", checkpoint_sha, "origin/main"], cwd=repo_dir
            )
            if already_integrated.returncode == 0:
                integrated_sha = _run(["git", "rev-parse", "origin/main"], cwd=repo_dir).stdout.strip()
                authority = _run([
                    sys.executable, "scripts/development-lifecycle/workspace_authority.py",
                    "converge", "--repository", str(repo_dir), "--integrated-sha", integrated_sha,
                ], cwd=repo_dir)
                if authority.returncode:
                    last_error = (authority.stderr or authority.stdout or "workspace convergence pending").strip()
                else:
                    verify = _run([
                        sys.executable, "scripts/development-lifecycle/workspace_authority.py",
                        "verify", "--repository", str(repo_dir), "--integrated-sha", integrated_sha,
                    ], cwd=repo_dir)
                    if verify.returncode == 0:
                        record_integration_success(repo_dir=repo_dir, integrated_sha=integrated_sha)
                        print(json.dumps({"status": "INTEGRATED", "sha": integrated_sha, "workspace": verify.stdout.strip()}))
                        return 0
                    last_error = (verify.stderr or verify.stdout or "workspace verification pending").strip()
            elif already_integrated.returncode != 1:
                last_error = "checkpoint reachability could not be determined"
            else:
                push = _run(
                    ["git", "-c", "lfs.https://github.com/naibarn/SmartSpecPro.git/info/lfs.locksverify=false",
                     "push", "origin", f"{checkpoint_sha}:refs/heads/{remote_branch}"],
                    cwd=repo_dir,
                )
                if push.returncode:
                    last_error = (push.stderr or push.stdout or "push failed").strip()
                else:
                    try:
                        prs = _gh_json([
                            "gh", "pr", "list", "--repo", repository, "--state", "open",
                            "--head", remote_branch, "--json", "number,url",
                        ], cwd=repo_dir)
                        if not isinstance(prs, list):
                            raise RuntimeError("GitHub returned an invalid PR list")
                        if prs:
                            pr = prs[0]
                        else:
                            created = _run([
                                "gh", "pr", "create", "--repo", repository, "--base", "main",
                                "--head", remote_branch, "--title", title, "--body", body,
                            ], cwd=repo_dir)
                            if created.returncode:
                                last_error = (created.stderr or created.stdout or "PR creation failed").strip()
                                raise RuntimeError(last_error)
                            pr_url = created.stdout.strip().splitlines()[-1]
                            pr = {"url": pr_url}

                        pr_url = str(pr.get("url", ""))
                        if not pr_url:
                            raise RuntimeError("GitHub PR URL is missing")
                        merge = _run(["gh", "pr", "merge", pr_url, "--merge"], cwd=repo_dir)
                        state = _gh_json([
                            "gh", "pr", "view", pr_url, "--repo", repository,
                            "--json", "state,mergedAt,mergeCommit,url",
                        ], cwd=repo_dir)
                        if isinstance(state, dict) and state.get("state") == "MERGED":
                            refresh = _run(["git", "fetch", "origin", "main"], cwd=repo_dir)
                            if refresh.returncode:
                                raise RuntimeError("merged PR but origin/main refresh failed")
                            main_sha = _run(["git", "rev-parse", "origin/main"], cwd=repo_dir)
                            if main_sha.returncode:
                                raise RuntimeError("origin/main SHA could not be read after merge")
                            integrated_sha = main_sha.stdout.strip()
                            ancestry = _run(["git", "merge-base", "--is-ancestor", checkpoint_sha, integrated_sha], cwd=repo_dir)
                            if ancestry.returncode:
                                raise RuntimeError("checkpoint is not reachable from refreshed origin/main")
                            authority = _run([
                                sys.executable, "scripts/development-lifecycle/workspace_authority.py",
                                "converge", "--repository", str(repo_dir), "--integrated-sha", integrated_sha,
                            ], cwd=repo_dir)
                            if authority.returncode:
                                raise RuntimeError((authority.stderr or authority.stdout or "workspace convergence pending").strip())
                            verify = _run([
                                sys.executable, "scripts/development-lifecycle/workspace_authority.py",
                                "verify", "--repository", str(repo_dir), "--integrated-sha", integrated_sha,
                            ], cwd=repo_dir)
                        if verify.returncode:
                            raise RuntimeError((verify.stderr or verify.stdout or "workspace verification pending").strip())
                        record_integration_success(repo_dir=repo_dir, integrated_sha=integrated_sha, pr_url=pr_url)
                        print(json.dumps({"status": "INTEGRATED", "pr": pr_url, "sha": integrated_sha, "workspace": verify.stdout.strip()}))
                        return 0
                        if merge.returncode:
                            last_error = (merge.stderr or merge.stdout or "merge is waiting for required checks").strip()
                        else:
                            last_error = f"PR is open and auto-merge is enabled: {pr_url}"
                    except (RuntimeError, json.JSONDecodeError) as error:
                        last_error = str(error)

        if attempt + 1 < attempts:
            delay = retry_delay_seconds(attempt, base_seconds, cap_seconds)
            persist_retryable_state(
                repo_dir=repo_dir,
                branch=remote_branch,
                checkpoint_sha=checkpoint_sha,
                attempt=attempt + 1,
                error=last_error,
            )
            print(json.dumps({"status": "WAITING_EXTERNAL_RETRYABLE", "attempt": attempt + 1, "next_delay_seconds": delay, "error": last_error}), flush=True)
            sleep(delay)

    persist_retryable_state(
        repo_dir=repo_dir,
        branch=remote_branch,
        checkpoint_sha=checkpoint_sha,
        attempt=attempts,
        error=last_error,
    )
    print(json.dumps({"status": "WAITING_EXTERNAL_RETRYABLE", "attempts": attempts, "error": last_error}), flush=True)
    return 2


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-dir", type=Path, required=True)
    parser.add_argument("--repository", default="naibarn/SmartSpecPro")
    parser.add_argument("--branch", default="codex/mini-app-factory-runtime-20261007")
    parser.add_argument("--sha", required=True)
    parser.add_argument("--attempts", type=int, default=10)
    parser.add_argument("--base-seconds", type=int, default=5)
    parser.add_argument("--cap-seconds", type=int, default=300)
    parser.add_argument("--title", default="feat(mini-app): add Research Notes reference UI")
    parser.add_argument(
        "--body",
        default=(
            "## Summary\n"
            "- Add the Research Notes reference Mini App UI and authenticated App resolution.\n"
            "- Preserve program handoff and retryable GitHub integration state.\n\n"
            "## Verification\n"
            "- Focused UI/router/service tests passed.\n"
            "- Retry-policy regression and SPEC-302 migration contract tests passed.\n"
            "- `git diff --check` passed.\n\n"
            "## Status\n"
            "Partial implementation. Migration application, AI summary/background execution, package/deploy, and runtime acceptance remain open.\n"
        ),
    )
    args = parser.parse_args()
    return retry_checkpoint(
        repo_dir=args.repo_dir,
        repository=args.repository,
        remote_branch=args.branch,
        checkpoint_sha=args.sha,
        attempts=args.attempts,
        base_seconds=args.base_seconds,
        cap_seconds=args.cap_seconds,
        title=args.title,
        body=args.body,
    )


if __name__ == "__main__":
    raise SystemExit(main())
