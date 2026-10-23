#!/usr/bin/env python3
"""Verify critical GitHub Actions job evidence for the tested candidate revision.

Every required CI job separately verifies git rev-parse HEAD == GITHUB_SHA.
PR workflow job metadata may report the source SHA instead of the synthetic
merge SHA. Never fill in missing job SHA evidence from the workflow run.
"""

import json
import os
import re
import sys

REQUIRED_JOBS = (
    "skill_pack", "python", "api_generator", "control_plane", "desktop_app",
    "marketplace_extension", "smartspecweb", "local_ai_runtime", "turbo_build",
)
SHA_PATTERN = re.compile(r"^[0-9a-f]{40}$")


def evaluate(*, candidate_sha, run, jobs, event_name, event_data, run_id, run_attempt, repository):
    failures = []
    if not isinstance(candidate_sha, str) or not SHA_PATTERN.fullmatch(candidate_sha):
        return ["CANDIDATE_SHA_INVALID"]
    if not isinstance(run, dict) or not isinstance(jobs, list) or not isinstance(event_data, dict):
        return ["EVIDENCE_SHAPE_INVALID"]
    if event_name not in ("push", "pull_request", "merge_group", "workflow_dispatch"):
        failures.append("UNSUPPORTED_EVENT")

    source_sha = candidate_sha
    if event_name == "pull_request":
        pr = event_data.get("pull_request")
        pr_head = pr.get("head") if isinstance(pr, dict) else None
        source_sha = pr_head.get("sha") if isinstance(pr_head, dict) else None
        if not isinstance(source_sha, str) or not SHA_PATTERN.fullmatch(source_sha):
            failures.append("PR_SOURCE_SHA_MISSING")
            source_sha = None
    elif event_name == "merge_group":
        mg = event_data.get("merge_group")
        if not isinstance(mg, dict) or mg.get("head_sha") != candidate_sha:
            failures.append("MERGE_GROUP_SHA_MISMATCH")

    if run.get("id") != run_id:
        failures.append("RUN_ID_MISMATCH")
    if run.get("run_attempt") != run_attempt:
        failures.append("RUN_ATTEMPT_MISMATCH")
    if run.get("repository") != repository:
        failures.append("REPOSITORY_MISMATCH")
    if run.get("event") != event_name:
        failures.append("RUN_EVENT_MISMATCH")

    # On pull_request the API run head can be source SHA, but the per-job
    # checkout preflight is responsible for proving the tested synthetic merge.
    allowed_run_shas = {candidate_sha}
    if event_name == "pull_request" and source_sha:
        allowed_run_shas.add(source_sha)
    if run.get("head_sha") not in allowed_run_shas:
        failures.append("RUN_SHA_MISMATCH")

    by_name = {}
    for job in jobs:
        if not isinstance(job, dict):
            failures.append("JOB_EVIDENCE_INVALID")
            continue
        by_name.setdefault(job.get("name"), []).append(job)
    for name in REQUIRED_JOBS:
        matches = by_name.get(name, [])
        if len(matches) != 1:
            failures.append(f"JOB_MISSING_OR_DUPLICATE:{name}")
            continue
        job = matches[0]
        if job.get("run_id") != run_id or job.get("run_attempt") != run_attempt:
            failures.append(f"JOB_RUN_IDENTITY_MISMATCH:{name}")
        # No job_sha || run_sha fallback. A missing value is a failed proof.
        if job.get("head_sha") not in allowed_run_shas:
            failures.append(f"JOB_SHA_MISMATCH:{name}")
        if job.get("status") != "completed":
            failures.append(f"JOB_NOT_COMPLETED:{name}:{job.get('status')}")
        elif job.get("conclusion") != "success":
            failures.append(f"JOB_NOT_SUCCESS:{name}:{job.get('conclusion')}")
    return failures


def main():
    try:
        with open(os.environ["GITHUB_EVENT_PATH"], encoding="utf-8") as handle:
            event_data = json.load(handle)
        envelope = json.loads(os.environ["JOB_EVIDENCE_JSON"])
        failures = evaluate(
            candidate_sha=os.environ["GITHUB_SHA"],
            run=envelope["run"], jobs=envelope["jobs"],
            event_name=os.environ["GITHUB_EVENT_NAME"], event_data=event_data,
            run_id=int(os.environ["GITHUB_RUN_ID"]),
            run_attempt=int(os.environ["GITHUB_RUN_ATTEMPT"]),
            repository=os.environ["GITHUB_REPOSITORY"],
        )
    except (KeyError, TypeError, ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"CANDIDATE_EVIDENCE_INVALID:{type(exc).__name__}", file=sys.stderr)
        return 2
    if failures:
        print("CI_CANDIDATE_GATE_FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"CI_CANDIDATE_GATE_PASSED sha={os.environ['GITHUB_SHA']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
