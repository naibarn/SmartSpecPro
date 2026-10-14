import unittest

from scripts.ci.candidate_gate import REQUIRED_JOBS, evaluate


SHA = "a" * 40


def passing_jobs():
    return [
        {"name": name, "status": "completed", "conclusion": "success", "head_sha": SHA}
        for name in REQUIRED_JOBS
    ]


class CandidateGateTests(unittest.TestCase):
    def test_accepts_all_required_checks_for_exact_candidate(self):
        self.assertEqual(evaluate(SHA, SHA, passing_jobs()), [])

    def test_rejects_missing_check(self):
        jobs = [job for job in passing_jobs() if job["name"] != "python"]
        self.assertTrue(any("JOB_MISSING_OR_DUPLICATE:python" in item for item in evaluate(SHA, SHA, jobs)))

    def test_rejects_failed_cancelled_and_skipped_checks(self):
        for conclusion in ("failure", "cancelled", "skipped"):
            jobs = passing_jobs()
            next(job for job in jobs if job["name"] == "python")["conclusion"] = conclusion
            self.assertTrue(any("JOB_NOT_SUCCESS:python" in item for item in evaluate(SHA, SHA, jobs)))

    def test_rejects_pending_check(self):
        jobs = passing_jobs()
        next(job for job in jobs if job["name"] == "python").update(status="in_progress", conclusion=None)
        self.assertTrue(any("JOB_NOT_COMPLETED:python" in item for item in evaluate(SHA, SHA, jobs)))

    def test_rejects_stale_run_sha_and_wrong_job_sha(self):
        self.assertIn("RUN_SHA_MISMATCH", evaluate(SHA, "b" * 40, passing_jobs()))
        jobs = passing_jobs()
        next(job for job in jobs if job["name"] == "python")["head_sha"] = "b" * 40
        self.assertTrue(any("JOB_SHA_MISMATCH:python" in item for item in evaluate(SHA, SHA, jobs)))

    def test_merge_group_must_match_its_candidate_sha(self):
        correct = {"merge_group": {"head_sha": SHA}}
        self.assertEqual(evaluate(SHA, SHA, passing_jobs(), "merge_group", correct), [])
        wrong = {"merge_group": {"head_sha": "b" * 40}}
        self.assertIn("MERGE_GROUP_SHA_MISMATCH", evaluate(SHA, SHA, passing_jobs(), "merge_group", wrong))

    def test_rejects_duplicate_required_check(self):
        jobs = passing_jobs()
        jobs.append(dict(jobs[0]))
        self.assertTrue(any("JOB_MISSING_OR_DUPLICATE:skill_pack" in item for item in evaluate(SHA, SHA, jobs)))


if __name__ == "__main__":
    unittest.main()
