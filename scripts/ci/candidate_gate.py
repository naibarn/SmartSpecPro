#!/usr/bin/env python3
"""Fail-closed evaluator for required CI job evidence bound to one candidate SHA."""

import json
import os
import sys

REQUIRED_JOBS = (
    "skill_pack",
    "python",
    "api_generator",
    "control_plane",
    "desktop_app",
    "marketplace_extension",
    "smartspecweb",
    "local_ai_runtime",
    "turbo_build",
)


def evaluate(candidate_sha, run_sha, jobs, event_name=None, event_data=None):
    failures = []
    if not candidate_sha or run_sha != candidate_sha:
        failures.append("RUN_SHA_MISMATCH")
    if event_name == "merge_group":
        merge_group_sha = (event_data or {}).get("merge_group", {}).get("head_sha")
        if merge_group_sha != candidate_sha:
            failures.append("MERGE_GROUP_SHA_MISMATCH")
    by_name = {}
    for job in jobs:
        by_name.setdefault(job.get("name"), []).append(job)
    for name in REQUIRED_JOBS:
        matches = by_name.get(name, [])
        if len(matches) != 1:
            failures.append(f"JOB_MISSING_OR_DUPLICATE:{name}")
            continue
        job = matches[0]
        if job.get("head_sha") != candidate_sha:
            failures.append(f"JOB_SHA_MISMATCH:{name}")
        if job.get("status") != "completed":
            failures.append(f"JOB_NOT_COMPLETED:{name}:{job.get('status')}")
        elif job.get("conclusion") != "success":
            failures.append(f"JOB_NOT_SUCCESS:{name}:{job.get('conclusion')}")
    return failures


def main():
    try:
        jobs = json.loads(os.environ["JOBS_JSON"])
        event_path = os.environ.get("GITHUB_EVENT_PATH")
        event_data = json.loads(open(event_path, encoding="utf-8").read()) if event_path else {}
        failures = evaluate(
            os.environ.get("CANDIDATE_SHA"),
            os.environ.get("RUN_SHA"),
            jobs,
            os.environ.get("GITHUB_EVENT_NAME"),
            event_data,
        )
    except (KeyError, TypeError, json.JSONDecodeError) as exc:
        print(f"CANDIDATE_EVIDENCE_INVALID:{type(exc).__name__}", file=sys.stderr)
        return 2
    if failures:
        print("CI_CANDIDATE_GATE_FAILED")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print(f"CI_CANDIDATE_GATE_PASSED sha={os.environ['CANDIDATE_SHA']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
