"""Celery compatibility shim for Feature 186.

Existing task families can register an executor one wave at a time. Celery
ack/retry settings remain transport controls; the control-plane client owns
business attempt and terminal semantics.
"""

import logging
import asyncio
import os
import re
from datetime import datetime, timedelta, timezone
import threading
from types import SimpleNamespace
from importlib import import_module
from collections.abc import Callable
from typing import Any

from app.services.job_control_plane import JobControlPlaneClient

_SAFE_TASK_IMPORT_PATH = re.compile(r"^app(?:\.[A-Za-z_][A-Za-z0-9_]*)+$")

Executor = Callable[[dict[str, Any], JobControlPlaneClient, Any], dict[str, Any] | None]
_executors: dict[str, Executor] = {}
logger = logging.getLogger(__name__)


class HardTaskRetryRequested(RuntimeError):
    """Convert a legacy task retry request into a control-plane retry."""

    def __init__(self, message: str = "LEGACY_TASK_RETRY_REQUESTED") -> None:
        super().__init__(message)


def _postgres_pull_enabled() -> bool:
    """Require the hard-cutover and worker flags as one atomic mode switch."""
    return (
        os.getenv("FEATURE_186_HARD_CUTOVER") == "true"
        and os.getenv("FEATURE_186_POSTGRES_PYTHON_WORKER") == "true"
    )


async def _execute_hard_media_task(task_name: str, args: list[Any]) -> dict[str, Any]:
    from app.tasks import media_tasks

    if task_name.endswith("generate_image_task"):
        return await media_tasks._generate_image_async(str(args[0]), args[1], args[2])
    if task_name.endswith("generate_video_task"):
        return await media_tasks._generate_video_async(str(args[0]), args[1], args[2])
    if task_name.endswith("generate_audio_task"):
        return await media_tasks._generate_audio_async(str(args[0]), args[1], args[2])
    raise ValueError("HARD_MEDIA_TASK_NOT_SUPPORTED")


def _start_heartbeat(client: JobControlPlaneClient, lease: Any) -> tuple[threading.Event, threading.Thread]:
    stop = threading.Event()
    configured = float(os.getenv("FEATURE_186_HEARTBEAT_SECONDS", "30"))
    interval = max(5.0, min(configured, 120.0))

    def loop() -> None:
        while not stop.wait(interval):
            try:
                client.heartbeat(lease)
            except Exception:
                # The fenced completion/report path remains authoritative. A
                # failed heartbeat must never mutate local state or renew a
                # lease without a durable PostgreSQL response.
                logger.warning("feature_186_heartbeat_failed", extra={"job_id": lease.job_id})

    thread = threading.Thread(target=loop, name=f"job-heartbeat-{lease.job_id}", daemon=True)
    thread.start()
    return stop, thread


def _execute_legacy_task(context: dict[str, Any], client: JobControlPlaneClient, lease: Any) -> dict[str, Any]:
    """Run a registered Python task without asking Celery to publish it.

    The task decorator remains a compatibility registration surface while the
    durable delivery and lifecycle boundary is PostgreSQL. The task request
    ID is scoped to the canonical job so existing task code that uses
    ``self.request.id`` remains deterministic during migration.
    """
    input_data = context.get("input") if isinstance(context.get("input"), dict) else {}
    task_name = input_data.get("taskName")
    if not isinstance(task_name, str) or not task_name:
        raise ValueError("LEGACY_TASK_NAME_MISSING")
    task_import_path = input_data.get("taskImportPath")
    if task_import_path is not None and (
        not isinstance(task_import_path, str)
        or not _SAFE_TASK_IMPORT_PATH.fullmatch(task_import_path)
    ):
        raise ValueError("LEGACY_TASK_IMPORT_PATH_INVALID")
    args = input_data.get("args") if isinstance(input_data.get("args"), list) else []
    kwargs = input_data.get("kwargs") if isinstance(input_data.get("kwargs"), dict) else {}
    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
        # Never replay a bearer credential that may have existed in an older
        # producer payload. Hard workers use the server-side gateway token and
        # the canonical requested user context instead.
        kwargs = {
            key: value
            for key, value in kwargs.items()
            if key.lower() not in {"user_token", "usertoken", "authorization", "access_token", "accesstoken"}
        }
    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true" and task_name.endswith(
        ("generate_image_task", "generate_video_task", "generate_audio_task")
    ):
        from app.services.job_execution_context import bind_job_execution, reset_job_execution

        execution_context_token = bind_job_execution(
            job_id=lease.job_id,
            task_ids={lease.job_id, *(value for value in args if isinstance(value, str) and value)},
            user_id=(
                int(context["requestedByUserId"])
                if str(context.get("requestedByUserId", "")).isdigit()
                else (
                    int(input_data["legacyUserId"])
                    if str(input_data.get("legacyUserId", "")).isdigit()
                    else None
                )
            ),
            client=client,
            lease=lease,
        )
        try:
            return asyncio.run(_execute_hard_media_task(task_name, args))
        finally:
            reset_job_execution(execution_context_token)

    postgres_pull_enabled = _postgres_pull_enabled()
    if postgres_pull_enabled:
        # PostgreSQL-pull execution must not consult the Celery registry. The
        # import path is the server-owned executor identity; the task object is
        # used only as a compatibility callable for business code that has not
        # yet been extracted into a plain function.
        import_name = task_import_path or task_name
        if not isinstance(import_name, str) or not _SAFE_TASK_IMPORT_PATH.fullmatch(import_name):
            raise ValueError("HARD_TASK_IMPORT_PATH_REQUIRED")
        module_name, attribute_name = import_name.rsplit(".", 1)
        module = import_module(module_name)
        task = getattr(module, attribute_name, None)
    else:
        from app.core.celery_app import celery_app

        task = celery_app.tasks.get(task_name)
        if task is None and "." in task_name:
            module_name = task_name.rsplit(".", 1)[0]
            import_module(module_name)
            task = celery_app.tasks.get(task_name)
    if task is None or not (callable(task) or callable(getattr(task, "run", None))):
        raise ValueError(f"LEGACY_TASK_NOT_REGISTERED:{task_name[:160]}")

    push_request = getattr(task, "push_request", None)
    pop_request = getattr(task, "pop_request", None)
    from app.services.job_execution_context import bind_job_execution, reset_job_execution

    legacy_task_ids: set[str] = {lease.job_id}
    for value in args:
        if isinstance(value, str) and value:
            legacy_task_ids.add(value)
    for key in ("task_id", "taskId", "job_id", "jobId"):
        value = kwargs.get(key)
        if isinstance(value, str) and value:
            legacy_task_ids.add(value)
    execution_context_token = bind_job_execution(
        job_id=lease.job_id,
        task_ids=legacy_task_ids,
        user_id=(
            int(context["requestedByUserId"])
            if str(context.get("requestedByUserId", "")).isdigit()
            else (
                int(input_data["legacyUserId"])
                if str(input_data.get("legacyUserId", "")).isdigit()
                else None
            )
        ),
        client=client,
        lease=lease,
    )
    if callable(push_request):
        push_request(id=lease.job_id, headers={"canonical_job_id": lease.job_id})
    try:
        if postgres_pull_enabled:
            # Celery's bound Task.run would route self.retry() back to the
            # broker. Invoke the wrapped business function with a tiny
            # request context whose retry signal is translated to the
            # canonical control-plane failure path.
            wrapped_task = getattr(task, "__wrapped__", None)

            class _HardTaskContext:
                request = SimpleNamespace(
                    id=lease.job_id,
                    headers={"canonical_job_id": lease.job_id},
                    retries=0,
                )
                max_retries = int(getattr(task, "max_retries", 0) or 0)

                def retry(self, *retry_args: Any, **retry_kwargs: Any) -> None:
                    raise HardTaskRetryRequested()

            if callable(wrapped_task):
                result = wrapped_task(_HardTaskContext(), *args, **kwargs)
            else:
                result = getattr(task, "run", task)(*args, **kwargs)
        else:
            callable_task = getattr(task, "run", task)
            result = callable_task(*args, **kwargs)
    finally:
        if callable(pop_request):
            pop_request()
        reset_job_execution(execution_context_token)
    if result is None:
        return {}
    if isinstance(result, dict):
        return result
    return {"value": result}


def register_unified_executor(job_type: str, executor: Executor) -> None:
    if not job_type or job_type in _executors:
        raise ValueError("JOB_EXECUTOR_REGISTRATION_CONFLICT")
    _executors[job_type] = executor


register_unified_executor("python.legacy_task", _execute_legacy_task)


def run_unified_job(
    job_id: str,
    runner_id: str | None = None,
    adapter: str = "postgres-pull",
    attempt_id: str | None = None,
) -> dict[str, Any]:
    client = JobControlPlaneClient()
    lease = client.claim(job_id, runner_id or os.getenv("HOSTNAME", "python-job-worker"), adapter, attempt_id)
    if lease is None:
        return {"job_id": job_id, "state": "ignored"}
    context = client.context(job_id)
    job_type = context["jobType"]
    executor = _executors.get(job_type)
    if executor is None:
        client.fail(lease, {"code": "UNSUPPORTED_JOB_TYPE", "message": job_type[:200], "class": "permanent"})
        return {"job_id": job_id, "state": "failed"}
    client.start(lease)
    heartbeat_stop, heartbeat_thread = _start_heartbeat(client, lease)
    try:
        client.assert_active(lease)
        result = executor(context, client, lease)
        result_status = str(result.get("status") or "").strip().lower() if isinstance(result, dict) else ""
        if result_status in {"failed", "error"}:
            error_message = str(result.get("error") or result.get("message") or "executor reported failure")
            client.fail(lease, {
                "code": str(result.get("error_code") or "EXECUTOR_REPORTED_FAILURE")[:100],
                "message": error_message[:2000],
                "class": "permanent",
            })
            return {"job_id": job_id, "state": "failed"}
        if result_status == "awaiting_answers":
            # Human input is an external wait, not a successful task result.
            # Keep the continuation projection under the current lease before
            # releasing it; the answer handler resumes this same canonical job
            # with a guarded, deterministic input update.
            client.report_legacy_status(lease, result)
            resume_after = datetime.now(timezone.utc) + timedelta(
                hours=max(1, min(int(os.getenv("FEATURE_186_EXTERNAL_WAIT_HOURS", "24")), 168))
            )
            client.wait_for_external(
                lease,
                {
                    "operationKey": f"human-input:{job_id}:{lease.attempt_id}",
                    "resumeAfter": resume_after.isoformat(),
                },
            )
            return {"job_id": job_id, "state": "waiting_external"}
        if result_status in {"submitted", "processing", "waiting_external"}:
            # Do not hold a Python worker lease while Kie.ai/WaveSpeedAI runs.
            # The provider task's durable poll record is reconciled separately;
            # the canonical operation key is stable across poller restarts.
            provider = str(result.get("provider") or context.get("input", {}).get("provider") or "media")
            provider_reference = result.get("external_task_id")
            operation_key = f"provider:{job_id}:{lease.attempt_id}:{provider}:generate"
            deadline_hours = max(1, min(int(os.getenv("FEATURE_186_PROVIDER_WAIT_HOURS", "2")), 48))
            resume_after = datetime.now(timezone.utc) + timedelta(hours=deadline_hours)
            client.wait_for_external(
                lease,
                {
                    "operationKey": operation_key,
                    "resumeAfter": resume_after.isoformat(),
                    **({"providerReference": str(provider_reference)[:255]} if provider_reference else {}),
                },
            )
            if provider_reference:
                registered = client.register_external_provider(
                    job_id=job_id,
                    operation_key=operation_key,
                    provider=provider,
                    provider_job_id=str(provider_reference)[:255],
                    next_poll_at=(datetime.now(timezone.utc) + timedelta(seconds=5)).isoformat(),
                    provider_deadline_at=resume_after.isoformat(),
                )
                if not registered:
                    # The canonical job is already waiting and the provider
                    # reference is still durable in the domain row. Do not
                    # call fail(lease) here: the lease was deliberately
                    # released by wait_for_external. Reconciliation/operator
                    # review handles a registration outage.
                    logger.error("feature_186_provider_poll_registration_failed", extra={"job_id": job_id})
            return {"job_id": job_id, "state": "waiting_external"}
        client.complete(lease, result or {})
        return {"job_id": job_id, "state": "completed"}
    except Exception as error:  # control-plane classification stays explicit
        error_name = type(error).__name__
        retryable = isinstance(error, (TimeoutError, ConnectionError, OSError)) or error_name in {
            "KieSubmissionDeferred",
            "HardTaskRetryRequested",
            "GatewayUnavailableError",
            "DocumentProviderUnavailableError",
            "TyphoonDocumentProviderUnavailableError",
        }
        permanent = isinstance(error, (ValueError, PermissionError))
        client.fail(lease, {
            "code": type(error).__name__,
            "message": str(error)[:2000],
            "class": "retryable" if retryable else ("permanent" if permanent else "unknown"),
            "operatorReviewRequired": not retryable and not permanent,
        })
        raise
    finally:
        heartbeat_stop.set()
        heartbeat_thread.join(timeout=2.0)


def execute_unified_job(
    job_id: str,
    runner_id: str | None = None,
    attempt_id: str | None = None,
) -> dict[str, Any]:
    """Shared execution entry point, optionally decorated for legacy Celery."""
    postgres_pull_enabled = _postgres_pull_enabled()
    adapter = "postgres-pull" if postgres_pull_enabled else "celery"
    return run_unified_job(job_id, runner_id, adapter, attempt_id)


if not _postgres_pull_enabled():
    from app.core.celery_app import celery_app

    execute_unified_job = celery_app.task(
        name="feature_186.execute_unified_job",
        bind=False,
        max_retries=0,
        acks_late=True,
    )(execute_unified_job)
