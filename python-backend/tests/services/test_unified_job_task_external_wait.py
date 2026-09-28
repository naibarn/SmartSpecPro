from pathlib import Path

from app.services.job_control_plane import LeaseContext
from app.tasks import unified_job_task


def test_provider_submission_releases_python_lease_for_durable_polling(monkeypatch):
    calls: list[tuple[str, object]] = []
    lease = LeaseContext("job-1", "attempt-1", "token", 4, "2026-09-14T00:05:00Z")

    class FakeControlPlane:
        def claim(self, job_id, runner_id, adapter, attempt_id=None):
            calls.append(("claim", (job_id, runner_id, adapter, attempt_id)))
            return lease

        def context(self, job_id):
            return {"jobType": "test.provider", "input": {"provider": "wavespeed_ai"}}

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
    register_calls = [payload for name, payload in calls if name == "register_external_provider"]
    assert register_calls[0]["provider_job_id"] == "provider-task-1"
    assert register_calls[0]["provider_deadline_at"]
    assert not [payload for name, payload in calls if name == "complete"]


def test_provider_wait_path_has_no_in_process_long_poll_loop():
    source = Path("app/tasks/unified_job_task.py").read_text(encoding="utf-8")
    assert "_drain_media_provider_polling" not in source
    assert "client.wait_for_external" in source
