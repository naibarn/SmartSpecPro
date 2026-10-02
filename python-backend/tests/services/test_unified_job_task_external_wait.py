from pathlib import Path
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.core.job_task_registry import JobTaskRegistry
from app.services.job_control_plane import LeaseContext
from app.tasks import unified_job_task


def test_provider_submission_releases_python_lease_for_durable_polling(monkeypatch):
    calls: list[tuple[str, object]] = []
    lease = LeaseContext("job-1", "attempt-1", "token", 4, "2026-09-14T00:05:00Z")
    created_at = datetime.now(timezone.utc) - timedelta(minutes=1)

    class FakeControlPlane:
        def claim(self, job_id, runner_id, adapter, attempt_id=None):
            calls.append(("claim", (job_id, runner_id, adapter, attempt_id)))
            return lease

        def context(self, job_id):
            return {
                "jobType": "test.provider",
                "input": {"provider": "wavespeed_ai"},
                "createdAt": created_at.isoformat(),
                "retryPolicy": {"deadlineMs": 10 * 60 * 1000},
            }

        def start(self, current_lease):
            calls.append(("start", current_lease))

        def assert_active(self, current_lease):
            calls.append(("assert_active", current_lease))

        def wait_for_external(self, current_lease, external_wait):
            calls.append(("wait_for_external", external_wait))

        def register_external_provider(self, **registration):
            calls.append(("register_external_provider", registration))
            return True

        def complete(self, current_lease, result):
            calls.append(("complete", result))

        def fail(self, current_lease, error):
            calls.append(("fail", error))

        def heartbeat(self, current_lease):
            calls.append(("heartbeat", current_lease))

    previous = unified_job_task._executors.get("test.provider")
    unified_job_task._executors["test.provider"] = lambda context, client, current_lease: {
        "status": "submitted",
        "provider": "wavespeed_ai",
        "external_task_id": "provider-task-1",
    }
    monkeypatch.setattr(unified_job_task, "JobControlPlaneClient", FakeControlPlane)
    monkeypatch.setenv("FEATURE_186_PROVIDER_WAIT_HOURS", "2")
    try:
        result = unified_job_task.run_unified_job("job-1", "runner-1", "postgres-pull", "attempt-1")
    finally:
        if previous is None:
            unified_job_task._executors.pop("test.provider", None)
        else:
            unified_job_task._executors["test.provider"] = previous

    assert result == {"job_id": "job-1", "state": "waiting_external"}
    wait_calls = [payload for name, payload in calls if name == "wait_for_external"]
    assert len(wait_calls) == 1
    assert wait_calls[0]["operationKey"] == "provider:job-1:attempt-1:wavespeed_ai:generate"
    assert wait_calls[0]["providerReference"] == "provider-task-1"
    resume_after = datetime.fromisoformat(wait_calls[0]["resumeAfter"])
    assert resume_after <= created_at + timedelta(minutes=10)
    assert resume_after > datetime.now(timezone.utc)
    register_calls = [payload for name, payload in calls if name == "register_external_provider"]
    assert register_calls[0]["provider_job_id"] == "provider-task-1"
    assert register_calls[0]["provider_deadline_at"]
    assert not [payload for name, payload in calls if name == "complete"]


def test_provider_wait_path_has_no_in_process_long_poll_loop():
    source = Path("app/tasks/unified_job_task.py").read_text(encoding="utf-8")
    assert "_drain_media_provider_polling" not in source
    assert "client.wait_for_external" in source


def test_one_shot_provider_poll_completes_its_worker_job(monkeypatch):
    calls: list[tuple[str, object]] = []
    lease = LeaseContext("poll-1", "attempt-1", "token", 4, "2026-09-14T00:05:00Z")

    class FakeControlPlane:
        def claim(self, *args, **kwargs): return lease
        def context(self, job_id): return {"jobType": "test.poll", "input": {}}
        def start(self, current_lease): pass
        def assert_active(self, current_lease): pass
        def complete(self, current_lease, result): calls.append(("complete", result))
        def fail(self, current_lease, error): calls.append(("fail", error))
        def heartbeat(self, current_lease): pass

    previous = unified_job_task._executors.get("test.poll")
    unified_job_task._executors["test.poll"] = lambda *_: {
        "status": "processing",
        "task_id": "media-1",
        "_controlPlaneAction": "complete_attempt",
    }
    monkeypatch.setattr(unified_job_task, "JobControlPlaneClient", FakeControlPlane)
    try:
        result = unified_job_task.run_unified_job("poll-1", "runner-1", "postgres-pull", "attempt-1")
    finally:
        if previous is None:
            unified_job_task._executors.pop("test.poll", None)
        else:
            unified_job_task._executors["test.poll"] = previous

    assert result["state"] == "completed"
    assert calls == [("complete", {"status": "processing", "task_id": "media-1"})]


def test_provider_wait_requires_explicit_provider_identity():
    source = Path("app/tasks/unified_job_task.py").read_text(encoding="utf-8")
    assert 'or "media"' not in source


def test_non_terminal_poll_result_is_completed_as_one_attempt():
    from app.tasks.media_tasks import _mark_one_shot_poll_complete

    marked = _mark_one_shot_poll_complete({"status": "processing", "task_id": "media-1"})
    assert marked == {
        "status": "processing",
        "task_id": "media-1",
        "_controlPlaneAction": "complete_attempt",
    }
    terminal = {"status": "completed", "task_id": "media-1"}
    assert _mark_one_shot_poll_complete(terminal) is terminal


def test_registered_bound_task_reports_progress_through_worker_jobs(monkeypatch):
    registry = JobTaskRegistry()

    @registry.task(name="sample.progress", bind=True)
    def progress_task(self):
        assert self.request.id == "job-1"
        assert self.request.delivery_info == {}
        self.update_state(state="PROGRESS", meta={"percent": 35, "stage": "Rendering"})
        return {"status": "complete"}

    monkeypatch.setattr(
        unified_job_task,
        "import_module",
        lambda name: SimpleNamespace(progress_task=progress_task),
    )
    updates = []

    class FakeControlPlane:
        def progress(self, lease, payload):
            updates.append((lease.job_id, payload))

    lease = LeaseContext("job-1", "attempt-1", "token", 1, "2026-09-14T00:05:00Z")
    result = unified_job_task._execute_legacy_task(
        {"input": {"taskName": "sample.progress", "taskImportPath": "app.tasks.sample.progress_task"}},
        FakeControlPlane(),
        lease,
    )

    assert result == {"status": "complete"}
    assert updates == [("job-1", {"progress": 35.0, "stage": "Rendering"})]
