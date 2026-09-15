import pytest

from unittest.mock import Mock

from app.services.job_control_plane import ReadyJob
from app.workers import postgres_job_worker


def test_postgres_worker_requires_both_hard_cutover_flags(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)

    with pytest.raises(RuntimeError, match="FEATURE_186_HARD_CUTOVER and FEATURE_186_POSTGRES_PYTHON_WORKER"):
        postgres_job_worker.main()


def test_postgres_worker_claims_the_ready_attempt(monkeypatch):
    client = Mock()
    client.ready.return_value = [ReadyJob(job_id="job-1", attempt=2, attempt_id="attempt-2")]
    executed = []

    def fake_run(job_id, runner_id, adapter, attempt_id):
        executed.append((job_id, runner_id, adapter, attempt_id))
        return {"job_id": job_id, "state": "completed"}

    monkeypatch.setattr(postgres_job_worker, "run_unified_job", fake_run)

    worker = postgres_job_worker.PostgresJobWorker(
        client=client,
        runner_id="runner-1",
        batch_size=10,
        poll_interval_seconds=1,
    )

    assert worker.run_once() == [{"job_id": "job-1", "state": "completed"}]
    assert executed == [("job-1", "runner-1", "postgres-pull", "attempt-2")]


def test_postgres_worker_claims_initial_unpinned_job(monkeypatch):
    client = Mock()
    client.ready.return_value = [ReadyJob(job_id="job-1", attempt=1, attempt_id=None)]
    executed = []

    def fake_run(job_id, runner_id, adapter, attempt_id):
        executed.append((job_id, runner_id, adapter, attempt_id))
        return {"job_id": job_id, "state": "completed"}

    monkeypatch.setattr(postgres_job_worker, "run_unified_job", fake_run)

    worker = postgres_job_worker.PostgresJobWorker(
        client=client,
        runner_id="runner-1",
        batch_size=10,
        poll_interval_seconds=1,
    )

    assert worker.run_once() == [{"job_id": "job-1", "state": "completed"}]
    assert executed == [("job-1", "runner-1", "postgres-pull", None)]
