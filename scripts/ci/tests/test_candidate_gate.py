import copy
import unittest

from scripts.ci.candidate_gate import REQUIRED_JOBS, evaluate

SHA = "a" * 40
SOURCE_SHA = "b" * 40
REPO = "naibarn/SmartSpecPro"


def evidence(event="push"):
    jobs = [
        {"name": name, "status": "completed", "conclusion": "success", "head_sha": SHA,
         "run_id": 123, "run_attempt": 1}
        for name in REQUIRED_JOBS
    ]
    run = {"id": 123, "run_attempt": 1, "event": event, "repository": REPO, "head_sha": SHA}
    data = {}
    if event == "pull_request":
        data = {"pull_request": {"head": {"sha": SOURCE_SHA}}}
        run["head_sha"] = SOURCE_SHA
        for job in jobs:
            job["head_sha"] = SOURCE_SHA
    if event == "merge_group":
        data = {"merge_group": {"head_sha": SHA}}
    return dict(candidate_sha=SHA, run=run, jobs=jobs, event_name=event,
                event_data=data, run_id=123, run_attempt=1, repository=REPO)


class CandidateGateTests(unittest.TestCase):
    def test_push_success(self):
        self.assertEqual(evaluate(**evidence()), [])

    def test_pr_source_and_tested_merge_distinct(self):
        self.assertEqual(evaluate(**evidence("pull_request")), [])
        args = evidence("pull_request")
        args["jobs"][0]["head_sha"] = SHA
        self.assertEqual(evaluate(**args), [])

    def test_merge_group_success(self):
        self.assertEqual(evaluate(**evidence("merge_group")), [])

    def test_merge_group_mismatch(self):
        args = evidence("merge_group")
        args["event_data"]["merge_group"]["head_sha"] = SOURCE_SHA
        self.assertIn("MERGE_GROUP_SHA_MISMATCH", evaluate(**args))

    def test_missing_pr_source(self):
        args = evidence("pull_request")
        args["event_data"] = {}
        self.assertIn("PR_SOURCE_SHA_MISSING", evaluate(**args))

    def test_pr_run_source_mismatch(self):
        args = evidence("pull_request")
        args["run"]["head_sha"] = "c" * 40
        self.assertIn("RUN_SHA_MISMATCH", evaluate(**args))

    def test_invalid_candidate(self):
        args = evidence()
        args["candidate_sha"] = "not-a-sha"
        self.assertEqual(evaluate(**args), ["CANDIDATE_SHA_INVALID"])

    def test_missing_job_head_rejected(self):
        args = evidence()
        args["jobs"][0].pop("head_sha")
        self.assertIn("JOB_SHA_MISMATCH:skill_pack", evaluate(**args))

    def test_duplicate_and_missing_job(self):
        args = evidence()
        args["jobs"].append(copy.copy(args["jobs"][0]))
        args["jobs"] = [j for j in args["jobs"] if j["name"] != "python"]
        result = evaluate(**args)
        self.assertIn("JOB_MISSING_OR_DUPLICATE:python", result)
        self.assertIn("JOB_MISSING_OR_DUPLICATE:skill_pack", result)

    def test_failure_skip_cancelled_and_pending(self):
        for conclusion in ("failure", "cancelled", "skipped", "timed_out", None):
            args = evidence()
            args["jobs"][0]["conclusion"] = conclusion
            self.assertIn(f"JOB_NOT_SUCCESS:skill_pack:{conclusion}", evaluate(**args))
        args = evidence()
        args["jobs"][0].update(status="in_progress", conclusion=None)
        self.assertIn("JOB_NOT_COMPLETED:skill_pack:in_progress", evaluate(**args))

    def test_job_cross_run_or_stale_attempt(self):
        args = evidence()
        args["jobs"][0]["run_id"] = 124
        self.assertIn("JOB_RUN_IDENTITY_MISMATCH:skill_pack", evaluate(**args))
        args = evidence()
        args["jobs"][0]["run_attempt"] = 2
        self.assertIn("JOB_RUN_IDENTITY_MISMATCH:skill_pack", evaluate(**args))

    def test_run_identity_and_repo(self):
        args = evidence()
        args["run"]["id"] = 999
        args["run"]["repository"] = "other/repo"
        result = evaluate(**args)
        self.assertIn("RUN_ID_MISMATCH", result)
        self.assertIn("REPOSITORY_MISMATCH", result)

    def test_unknown_event(self):
        args = evidence()
        args["event_name"] = "workflow_run"
        self.assertIn("UNSUPPORTED_EVENT", evaluate(**args))

    def test_wrong_job_sha(self):
        args = evidence()
        args["jobs"][0]["head_sha"] = SOURCE_SHA
        self.assertIn("JOB_SHA_MISMATCH:skill_pack", evaluate(**args))

    def test_malformed_payload(self):
        args = evidence()
        args["jobs"] = None
        self.assertEqual(evaluate(**args), ["EVIDENCE_SHAPE_INVALID"])


if __name__ == "__main__":
    unittest.main()
