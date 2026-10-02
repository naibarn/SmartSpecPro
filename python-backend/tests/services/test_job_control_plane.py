import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import httpx
import pytest

from app.services.job_control_plane import JobControlPlaneClient, JobControlPlaneError, LeaseContext, ReadyJob, dispatch_python_task


def test_retired_publisher_endpoint_rejects_legacy_publish(monkeypatch):
    from fastapi import HTTPException

    from app.api import internal_job_control_plane

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)
    monkeypatch.setattr(internal_job_control_plane, "_verify_token", lambda token: None)

    with pytest.raises(HTTPException) as error:
        internal_job_control_plane.publish_unified_job(
            internal_job_control_plane.PublishRequest(job_id="job-1", task_id="outbox-1"),
            "token",
        )

    assert error.value.status_code == 410
    assert error.value.detail == "LEGACY_JOB_PUBLISHER_RETIRED"


def test_hard_cutover_media_recovery_requeues_only_unclaimed_images(monkeypatch):
    from app.tasks import media_tasks

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)

    assert asyncio.run(media_tasks._recover_stuck_tasks_async()) == {
        "status": "skipped",
        "reason": "feature_186_hard_cutover",
    }
    assert asyncio.run(media_tasks._recover_stuck_pending_tasks_async()) == {
        "status": "delegated",
        "owner": "worker_jobs",
    }
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=False)
    session.execute = AsyncMock(return_value=Mock(scalars=Mock(return_value=Mock(all=Mock(return_value=[])))))
    monkeypatch.setattr(media_tasks, "AsyncSessionLocal", lambda: session)
    assert asyncio.run(media_tasks._recover_unclaimed_pending_image_tasks_async()) == {
        "users_checked": 0,
        "dispatched": 0,
        "dispatch_failures": 0,
        "next_after_user_id": None,
    }

    # Hard cutover recovery scans only unclaimed image rows; stale/claimed work
    # remains owned by worker_jobs and cannot be raced by the legacy janitor.
    monkeypatch.setattr(
        media_tasks,
        "_run_async",
        lambda coroutine: (
            coroutine.close(),
            {
                "users_checked": 0,
                "dispatched": 0,
                "dispatch_failures": 0,
                "next_after_user_id": None,
            },
        )[1],
    )
    monkeypatch.setattr(media_tasks, "_recover_stuck_tasks_async", Mock(side_effect=AssertionError("legacy sweep called")))
    result = media_tasks.recover_stuck_tasks.run()
    assert result == {
        "status": "success",
        "pending_dispatched": 0,
        "dispatch_failures": 0,
    }


def test_hard_cutover_direct_execution_fails_before_claim(monkeypatch):
    from app.tasks import unified_job_task

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)

    client = Mock()
    monkeypatch.setattr(unified_job_task, "JobControlPlaneClient", lambda: client)

    with pytest.raises(RuntimeError, match="HARD_CUTOVER_PYTHON_WORKER_REQUIRED"):
        unified_job_task.run_unified_job("job-1")

    client.claim.assert_not_called()


def test_hard_cutover_recovery_reports_partial_when_requeue_fails(monkeypatch):
    from app.tasks import media_tasks

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")

    def recovery_result(coroutine):
        coroutine.close()
        return {"users_checked": 1, "dispatched": 0, "dispatch_failures": 1}

    monkeypatch.setattr(media_tasks, "_run_async", recovery_result)

    assert media_tasks.recover_stuck_tasks.run() == {
        "status": "partial",
        "pending_dispatched": 0,
        "dispatch_failures": 1,
    }


def test_python_port_sends_only_canonical_identity_and_fence():
    client = Mock()
    client.post.return_value.json.return_value = {
        "lease": {
            "jobId": "job-1",
            "attemptId": "attempt-1",
            "leaseToken": "secret-token",
            "fencingVersion": 3,
            "expiresAt": "2026-09-12T00:00:00Z",
        }
    }
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    lease = control.claim("job-1", "runner-1", "celery")
    assert lease == LeaseContext("job-1", "attempt-1", "secret-token", 3, "2026-09-12T00:00:00Z")
    assert client.post.call_args.kwargs["json"] == {"jobId": "job-1", "runnerId": "runner-1", "adapter": "celery"}


def test_python_port_can_pin_claim_to_a_published_attempt():
    client = Mock()
    client.post.return_value.json.return_value = {"lease": None}
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.claim("job-1", "runner-1", "postgres-pull", "attempt-1") is None
    assert client.post.call_args.kwargs["json"] == {
        "jobId": "job-1",
        "runnerId": "runner-1",
        "adapter": "postgres-pull",
        "attemptId": "attempt-1",
    }


def test_python_port_reads_ready_canonical_jobs():
    client = Mock()
    client.post.return_value.json.return_value = {"jobs": [{"jobId": "job-1", "attempt": 1, "attemptId": "attempt-1"}]}
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.ready(2) == [ReadyJob(job_id="job-1", attempt=1, attempt_id="attempt-1")]
    assert client.post.call_args.kwargs["json"] == {"runtimeType": "python_job_worker", "limit": 2}


def test_python_port_accepts_initial_unpinned_ready_candidate():
    client = Mock()
    client.post.return_value.json.return_value = {
        "jobs": [
            {"jobId": "job-without-attempt", "attempt": 1, "attemptId": None},
            {"jobId": "job-1", "attempt": 2, "attemptId": "attempt-2"},
        ]
    }
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.ready(2) == [
        ReadyJob(job_id="job-without-attempt", attempt=1, attempt_id=None),
        ReadyJob(job_id="job-1", attempt=2, attempt_id="attempt-2"),
    ]


def test_python_port_loads_server_owned_executor_context():
    client = Mock()
    client.post.return_value.json.return_value = {
        "context": {"jobId": "job-1", "jobType": "media_render", "executionClass": "cpu"}
    }
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.context("job-1")["jobType"] == "media_render"
    assert client.post.call_args.kwargs["json"] == {"jobId": "job-1"}


def test_python_port_passes_durable_queue_admission_to_control_plane():
    client = Mock()
    client.post.return_value.json.return_value = {"jobId": "job-1", "created": True}
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    control.create({"jobType": "python.legacy_task"}, tenant_id="tenant-a", admission_mode="durable_queue")

    assert client.post.call_args.args == ("http://control-plane/create",)
    assert client.post.call_args.kwargs["json"]["admissionMode"] == "durable_queue"


def test_python_port_maps_control_plane_domain_errors_to_stable_codes():
    client = Mock()
    response = httpx.Response(409, json={"error": "JOB_LEASE_STALE"}, request=httpx.Request("POST", "http://control-plane/heartbeat"))
    client.post.side_effect = httpx.HTTPStatusError("conflict", request=response.request, response=response)
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    with pytest.raises(JobControlPlaneError) as error:
        control.heartbeat(LeaseContext("job-1", "attempt-1", "token", 2, ""))
    assert error.value.code == "JOB_LEASE_STALE"


def test_python_port_assert_active_uses_read_only_lease_action():
    client = Mock()
    client.post.return_value.json.return_value = {"ok": True}
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)
    lease = LeaseContext("job-1", "attempt-1", "token", 2, "")

    control.assert_active(lease)

    assert client.post.call_args.args == ("http://control-plane/assert-active",)
    assert client.post.call_args.kwargs["json"] == {
        "jobId": "job-1",
        "attemptId": "attempt-1",
        "leaseToken": "token",
        "fencingVersion": 2,
    }


def test_python_port_external_wait_resume_and_callback_keep_canonical_boundary():
    client = Mock()
    client.post.return_value.json.side_effect = [
        {"ok": True},
        {"resumed": True},
        {"disposition": "accepted", "callbackIdempotencyKey": "provider:event-1"},
    ]
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)
    lease = LeaseContext("job-1", "attempt-1", "token", 2, "")

    control.wait_for_external(lease, {"operationKey": "op-1", "resumeAfter": "2026-09-13T00:00:00Z"})
    assert control.resume_external("job-1", "runner-1", "celery") is True
    callback_result = control.record_callback({
        "adapterNamespace": "provider",
        "providerEventId": "event-1",
        "occurredAt": "2026-09-13T00:00:00Z",
        "jobId": "job-1",
        "tenantId": "tenant-1",
        "payload": {"state": "completed"},
    })

    assert callback_result["disposition"] == "accepted"
    assert client.post.call_args_list[0].kwargs["json"]["externalWait"]["operationKey"] == "op-1"
    assert client.post.call_args_list[2].kwargs["json"]["providerEventId"] == "event-1"


def test_python_port_can_settle_callback_free_provider_wait():
    client = Mock()
    client.post.return_value.json.side_effect = [{"completed": True}, {"registered": True}, {"failed": True}]
    client.post.return_value.raise_for_status.return_value = None
    control = JobControlPlaneClient(base_url="http://control-plane", client=client)

    assert control.complete_external("job-1", "media-task:task-1", "operation-1") is True
    assert control.register_external_provider(
        job_id="job-1",
        operation_key="operation-1",
        provider="wavespeed_ai",
        provider_job_id="provider-task-1",
        next_poll_at="2026-09-14T00:00:05Z",
        provider_deadline_at="2026-09-14T02:00:00Z",
    ) is True
    assert control.fail_external_wait("job-2", "provider terminal failure", operator_review_required=False, operation_key="operation-2") is True
    assert client.post.call_args_list[0].args == ("http://control-plane/complete-external",)
    assert client.post.call_args_list[0].kwargs["json"] == {
        "jobId": "job-1",
        "resultRef": "media-task:task-1",
        "operationKey": "operation-1",
    }
    assert client.post.call_args_list[1].kwargs["json"] == {
        "jobId": "job-1",
        "operationKey": "operation-1",
        "provider": "wavespeed_ai",
        "providerJobId": "provider-task-1",
        "nextPollAt": "2026-09-14T00:00:05Z",
        "providerDeadlineAt": "2026-09-14T02:00:00Z",
    }
    assert client.post.call_args_list[2].kwargs["json"] == {
        "jobId": "job-2",
        "reason": "provider terminal failure",
        "operatorReviewRequired": False,
        "operationKey": "operation-2",
    }


def test_hard_python_dispatch_resolves_celery_alias_to_safe_import_path(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")

    def task_function():
        return None

    task_function.__module__ = "app.tasks.google_drive_tasks"
    task_function.__name__ = "initial_drive_sync"
    task_function._job_task_retry_policy = {
        "maxAttempts": 3,
        "baseDelayMs": 60000,
        "maxDelayMs": 900000,
        "jitter": "none",
        "deadlineMs": 2 * 60 * 60 * 1000,
        "allowedErrorClasses": ["retryable", "timeout", "unavailable"],
    }
    legacy_task = SimpleNamespace(name="initial_drive_sync", run=task_function, _job_task_retry_policy=task_function._job_task_retry_policy)
    captured: dict = {}

    def fake_create(self, definition, **kwargs):
        captured["definition"] = definition
        return type("Ref", (), {"job_id": "job-1", "created": True})()

    monkeypatch.setattr(JobControlPlaneClient, "create", fake_create)
    dispatch_python_task(
        legacy_task.name,
        args=[1, "tenant-a"],
        tenant_id="tenant-a",
        user_id=1,
        idempotency_key="gdrive:initial:tenant-a:1",
        legacy_task=legacy_task,
    )

    assert captured["definition"]["input"]["taskName"] == "initial_drive_sync"
    assert captured["definition"]["input"]["taskImportPath"] == "app.tasks.google_drive_tasks.initial_drive_sync"
    assert captured["definition"]["retryPolicy"]["maxAttempts"] == 3
    assert captured["definition"]["retryPolicy"]["baseDelayMs"] == 60000
    assert captured["definition"]["retryPolicy"]["jitter"] == "none"
    assert captured["definition"]["retryPolicy"]["deadlineMs"] == 2 * 60 * 60 * 1000
    assert captured["definition"]["retryPolicy"]["deadlineMode"] == "fixed"


def test_job_task_registry_retry_policy_uses_worker_jobs_contract():
    from app.core.job_task_registry import JobTaskRegistry

    registry = JobTaskRegistry()

    @registry.task(max_retries=2, default_retry_delay=30)
    def sample_task():
        return None

    assert sample_task._job_task_retry_policy == {
        "maxAttempts": 3,
        "baseDelayMs": 30000,
        "maxDelayMs": 900000,
        "jitter": "none",
        "deadlineMs": 10 * 60 * 1000,
        "allowedErrorClasses": ["retryable", "timeout", "unavailable"],
    }


def test_job_task_registry_rejects_retry_deadlines_over_two_hours():
    from app.core.job_task_registry import JobTaskRegistry

    registry = JobTaskRegistry()
    with pytest.raises(ValueError, match="JOB_TASK_RETRY_DEADLINE_OUT_OF_RANGE"):
        @registry.task(max_retries=2, retry_deadline_seconds=86400)
        def invalid_long_task():
            return None


def test_python_dispatch_uses_bounded_retry_windows_by_queue(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")
    captured = []

    def fake_create(self, definition, **kwargs):
        captured.append((definition, kwargs))
        return type("Ref", (), {"job_id": f"job-{len(captured)}", "created": True})()

    monkeypatch.setattr(JobControlPlaneClient, "create", fake_create)
    from app.core.job_task_registry import JobTaskRegistry

    registry = JobTaskRegistry()

    @registry.task(max_retries=2)
    def ordinary_task():
        return None
    ordinary_task.__module__ = "app.tasks.example"

    @registry.task(max_retries=2)
    def long_task():
        return None
    long_task.__module__ = "app.tasks.example"

    dispatch_python_task(
        ordinary_task.name,
        tenant_id="tenant-a",
        idempotency_key="ordinary:1",
        legacy_task=ordinary_task,
    )
    dispatch_python_task(
        long_task.name,
        tenant_id="tenant-a",
        idempotency_key="long:1",
        queue="video",
        legacy_task=long_task,
        admission_mode="durable_queue",
    )

    assert captured[0][0]["retryPolicy"]["deadlineMs"] == 10 * 60 * 1000
    assert captured[1][0]["retryPolicy"]["deadlineMs"] == 60 * 60 * 1000
    assert captured[0][0]["retryPolicy"]["deadlineMode"] == "adaptive"
    assert captured[1][0]["retryPolicy"]["deadlineMode"] == "adaptive"
    assert captured[0][1]["admission_mode"] == "strict"
    assert captured[1][1]["admission_mode"] == "durable_queue"


def test_python_dispatch_rejects_legacy_24_hour_retry_policy(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")

    def task_function():
        return None

    task_function.__module__ = "app.tasks.example"
    task_function.__name__ = "run"
    legacy_task = SimpleNamespace(
        name="app.tasks.example.run",
        run=task_function,
        _job_task_retry_policy={
            "maxAttempts": 3,
            "baseDelayMs": 1000,
            "maxDelayMs": 900000,
            "jitter": "bounded",
            "deadlineMs": 86400000,
            "allowedErrorClasses": ["retryable", "timeout", "unavailable"],
        },
    )
    create = Mock()
    monkeypatch.setattr(JobControlPlaneClient, "create", create)

    with pytest.raises(JobControlPlaneError) as error:
        dispatch_python_task(
            legacy_task.name,
            tenant_id="tenant-a",
            idempotency_key="example:24h",
            legacy_task=legacy_task,
        )

    assert error.value.code == "JOB_RETRY_DEADLINE_INVALID"
    create.assert_not_called()


def test_hard_python_dispatch_requires_idempotency_and_redacts_args(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")
    monkeypatch.setenv("FEATURE_186_SYSTEM_TENANT_ID", "tenant-system")

    with pytest.raises(JobControlPlaneError) as missing_key:
        dispatch_python_task("app.tasks.example.run", args=[{"access_token": "secret"}])
    assert missing_key.value.code == "JOB_IDEMPOTENCY_REQUIRED"

    captured: dict = {}

    def fake_create(self, definition, **kwargs):
        captured["definition"] = definition
        captured["kwargs"] = kwargs
        return type("Ref", (), {"job_id": "job-1", "created": True})()

    monkeypatch.setattr(JobControlPlaneClient, "create", fake_create)
    result = dispatch_python_task(
        "app.tasks.example.run",
        args=[{"access_token": "secret", "value": "kept"}],
        tenant_id="tenant-a",
        idempotency_key="example:job-1",
    )

    assert result.id == "job-1"
    assert captured["definition"]["input"]["args"] == [{"value": "kept"}]
    assert captured["kwargs"]["idempotency_key"] == "example:job-1"


def test_hard_cutover_rejects_python_job_before_persisting_when_worker_disabled(monkeypatch):
    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.delenv("FEATURE_186_POSTGRES_PYTHON_WORKER", raising=False)
    create = Mock()
    monkeypatch.setattr(JobControlPlaneClient, "create", create)

    with pytest.raises(JobControlPlaneError) as error:
        dispatch_python_task(
            "app.tasks.example.run",
            tenant_id="tenant-a",
            idempotency_key="example:job-1",
        )

    assert error.value.code == "HARD_CUTOVER_PYTHON_WORKER_REQUIRED"
    create.assert_not_called()


def test_python_dispatch_rejects_jobs_when_hard_cutover_is_disabled(monkeypatch):
    monkeypatch.delenv("FEATURE_186_HARD_CUTOVER", raising=False)
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")
    create = Mock()
    monkeypatch.setattr(JobControlPlaneClient, "create", create)

    with pytest.raises(JobControlPlaneError) as error:
        dispatch_python_task(
            "app.tasks.example.run",
            tenant_id="tenant-a",
            idempotency_key="example:job-1",
        )

    assert error.value.code == "FEATURE_186_HARD_CUTOVER_REQUIRED"
    create.assert_not_called()


def test_python_dispatch_uses_canonical_create_endpoint(monkeypatch):
    from app.services import job_control_plane

    monkeypatch.setenv("FEATURE_186_HARD_CUTOVER", "true")
    monkeypatch.setenv("FEATURE_186_POSTGRES_PYTHON_WORKER", "true")
    requests = []

    def handle(request):
        requests.append(request)
        return httpx.Response(200, json={"jobId": "job-canonical", "created": True})

    control = JobControlPlaneClient(
        base_url="https://control.example/api/internal/job-control-plane",
        client=httpx.Client(transport=httpx.MockTransport(handle)),
    )
    monkeypatch.setattr(job_control_plane, "JobControlPlaneClient", lambda: control)

    result = dispatch_python_task(
        "app.tasks.example.run",
        args=[{"input": "safe"}],
        tenant_id="tenant-a",
        idempotency_key="example:job-canonical",
        correlation_id="example-correlation",
    )

    assert result.id == "job-canonical"
    assert len(requests) == 1
    assert requests[0].url.path.endswith("/create")
    payload = json.loads(requests[0].content)
    assert payload["runtimeType"] == "python_job_worker"
    assert payload["context"] == {
        "tenantId": "tenant-a",
        "actorType": "system",
        "authorizationScope": "python.job-dispatch",
        "correlationId": "example-correlation",
        "idempotencyKey": "example:job-canonical",
    }
    assert payload["definition"]["input"]["taskImportPath"] == "app.tasks.example.run"
    control.client.close()
