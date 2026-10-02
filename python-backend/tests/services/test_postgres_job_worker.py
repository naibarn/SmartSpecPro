import pytest

from unittest.mock import Mock

from app.services.job_control_plane import ReadyJob
from app.workers import postgres_job_worker


@pytest.mark.parametrize(
    ("hard_cutover", "postgres_worker"),
    [("true", None), (None, "true"), (None, None)],
)
def test_postgres_worker_requires_both_hard_cutover_flags(monkeypatch, hard_cutover, postgres_worker):
    if hard_cutover is None:
        monkeypatch.delenv("FEATURE_186_HARD_CUTOVER", raising=False)
    else:
        monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", hard_cutover)
    if postgres_worker is None:
        monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)
    else:
        monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", postgres_worker)

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


def test_job_execution_transport_failure_propagates_to_worker_backoff(monkeypatch):
    client = Mock()
    client.ready.return_value = [ReadyJob(job_id="job-1", attempt=1, attempt_id="attempt-1")]
    monkeypatch.setattr(
        postgres_job_worker,
        "run_unified_job",
        Mock(side_effect=postgres_job_worker.JobControlPlaneError("JOB_CONTROL_PLANE_UNAVAILABLE", "offline")),
    )
    worker = postgres_job_worker.PostgresJobWorker(client=client, runner_id="runner-1")

    with pytest.raises(postgres_job_worker.JobControlPlaneError, match="offline"):
        worker.run_once()


def test_postgres_worker_starts_when_both_cutover_flags_are_enabled(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")
    worker = Mock()
    constructor = Mock(return_value=worker)
    monkeypatch.setattr(postgres_job_worker, "PostgresJobWorker", constructor)

    postgres_job_worker.main()

    constructor.assert_called_once()
    worker.run_forever.assert_called_once()


def test_worker_tick_reconciles_media_without_blocking_job_polling(monkeypatch):
    worker = postgres_job_worker.PostgresJobWorker(
        client=Mock(),
        runner_id="runner-1",
        poll_interval_seconds=1,
    )
    worker.reconcile_unclaimed_media_tasks = Mock(side_effect=RuntimeError("database unavailable"))
    worker.run_once = Mock(return_value=[])
    monkeypatch.setattr(postgres_job_worker.time, "monotonic", Mock(return_value=0))
    monkeypatch.setattr(
        postgres_job_worker.time,
        "sleep",
        Mock(side_effect=KeyboardInterrupt),
    )

    with pytest.raises(KeyboardInterrupt):
        worker.run_forever()

    worker.reconcile_unclaimed_media_tasks.assert_called_once()
    worker.run_once.assert_called_once()


def test_control_plane_outage_is_logged_and_uses_bounded_retry_backoff(monkeypatch, caplog):
    from app.services.job_control_plane import JobControlPlaneError

    worker = postgres_job_worker.PostgresJobWorker(
        client=Mock(),
        runner_id="runner-1",
        poll_interval_seconds=1,
    )
    worker.reconcile_unclaimed_media_tasks = Mock(return_value={"dispatch_failures": 0})
    worker.run_once = Mock(side_effect=JobControlPlaneError("CONTROL_PLANE_UNAVAILABLE", "offline"))
    sleep = Mock(side_effect=KeyboardInterrupt)
    monkeypatch.setattr(postgres_job_worker.time, "monotonic", Mock(return_value=0))
    monkeypatch.setattr(postgres_job_worker.time, "sleep", sleep)

    with pytest.raises(KeyboardInterrupt):
        worker.run_forever()

    assert sleep.call_args.args == (1,)
    assert worker._control_plane_unavailable_since == 0
    assert "postgres_job_control_plane_unavailable" in caplog.text


def test_worker_recovery_cursor_advances_to_later_users(monkeypatch):
    from app.tasks import media_tasks

    requested_cursors = []

    async def recover(*, after_user_id):
        requested_cursors.append(after_user_id)
        if after_user_id is None:
            return {"users_checked": 50, "dispatched": 50, "dispatch_failures": 0, "next_after_user_id": 50}
        return {"users_checked": 2, "dispatched": 2, "dispatch_failures": 0, "next_after_user_id": None}

    monkeypatch.setattr(media_tasks, "_recover_unclaimed_pending_image_tasks_async", recover)
    worker = postgres_job_worker.PostgresJobWorker(client=Mock(), runner_id="runner-1")

    assert worker.reconcile_unclaimed_media_tasks()["users_checked"] == 50
    assert worker.media_reconcile_after_user_id == 50
    assert worker.reconcile_unclaimed_media_tasks()["users_checked"] == 2
    assert worker.media_reconcile_after_user_id is None
    assert requested_cursors == [None, 50]


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
