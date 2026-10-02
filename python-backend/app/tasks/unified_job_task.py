"""Celery compatibility shim for Feature 186.

Existing task families can register an executor one wave at a time. Celery
ack/retry settings remain transport controls; the control-plane client owns
business attempt and terminal semantics.
"""

import logging
import asyncio
import math
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


def _feature_flag_enabled(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def _hard_cutover_enabled() -> bool:
    return _feature_flag_enabled("FEATURE_186_HARD_CUTOVER")


def _postgres_pull_enabled() -> bool:
    return _feature_flag_enabled("FEATURE_186_POSTGRES_PYTHON_WORKER")


def assert_postgres_pull_worker_enabled() -> None:
    if not _hard_cutover_enabled() or not _postgres_pull_enabled():
        raise RuntimeError("FEATURE_186_HARD_CUTOVER and FEATURE_186_POSTGRES_PYTHON_WORKER must both be enabled")


class HardTaskRetryRequested(RuntimeError):
    """Convert a legacy task retry request into a control-plane retry."""

    def __init__(self, message: str = "LEGACY_TASK_RETRY_REQUESTED") -> None:
        super().__init__(message)


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
    if True:
        # Never replay a bearer credential that may have existed in an older
        # producer payload. Hard workers use the server-side gateway token and
        # the canonical requested user context instead.
        kwargs = {
            key: value
            for key, value in kwargs.items()
            if key.lower() not in {"user_token", "usertoken", "authorization", "access_token", "accesstoken"}
        }
    if True and task_name.endswith(
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
            tenant_id=str(context.get("tenantId") or "").strip() or None,
            client=client,
            lease=lease,
        )
        try:
            # Keep async SQLAlchemy/asyncpg resources on the same event loop
            # across media recovery sweeps and successive jobs. asyncio.run()
            # creates and closes a fresh loop for every task, while the
            # process-wide AsyncEngine pool retains connections from the
            # persistent worker loop.
            from app.tasks.media_tasks import _run_async

            return _run_async(_execute_hard_media_task(task_name, args))
        finally:
            reset_job_execution(execution_context_token)

    # The import path is the server-owned executor identity. Task metadata is
    # registered locally; it has no broker or dispatch behavior.
    import_name = task_import_path or task_name
    if not isinstance(import_name, str) or not _SAFE_TASK_IMPORT_PATH.fullmatch(import_name):
        raise ValueError("HARD_TASK_IMPORT_PATH_REQUIRED")
    module_name, attribute_name = import_name.rsplit(".", 1)
    module = import_module(module_name)
    task = getattr(module, attribute_name, None)
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
        tenant_id=str(context.get("tenantId") or "").strip() or None,
        client=client,
        lease=lease,
    )
    if callable(push_request):
        push_request(id=lease.job_id, headers={"canonical_job_id": lease.job_id})
    try:
        class _HardTaskContext:
            request = SimpleNamespace(
                id=lease.job_id,
                headers={"canonical_job_id": lease.job_id},
                retries=0,
                delivery_info={},
            )
            max_retries = int(getattr(task, "max_retries", 0) or 0)

            def retry(self, *retry_args: Any, **retry_kwargs: Any) -> None:
                raise HardTaskRetryRequested()

            def update_state(self, *, state: str, meta: Any = None, **_: Any) -> None:
                if state != "PROGRESS" or not isinstance(meta, dict):
                    return
                percent = meta.get("percent", meta.get("progress"))
                if percent is None and isinstance(meta.get("processed"), (int, float)):
                    total = meta.get("total")
                    if isinstance(total, (int, float)) and total > 0:
                        percent = meta["processed"] / total * 100
                if isinstance(percent, bool) or not isinstance(percent, (int, float)):
                    return
                if not math.isfinite(percent):
                    return
                stage = str(meta.get("stage") or "running").strip()[:100] or "running"
                client.progress(lease, {
                    "progress": max(0.0, min(100.0, float(percent))),
                    "stage": stage,
                })

        if getattr(task, "_job_task_bind", False):
            result = task(_HardTaskContext(), *args, **kwargs)
        else:
            result = task(*args, **kwargs)
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
    if _hard_cutover_enabled() and not _postgres_pull_enabled():
        raise RuntimeError("HARD_CUTOVER_PYTHON_WORKER_REQUIRED")

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
        if isinstance(result, dict) and result.get("_controlPlaneAction") == "complete_attempt":
            # A provider poll is one bounded check. The media task owns its
            # own processing state and schedules the next durable poll job;
            # this individual worker_jobs attempt must release its slot now.
            completion = {key: value for key, value in result.items() if key != "_controlPlaneAction"}
            client.complete(lease, completion)
            return {"job_id": job_id, "state": "completed"}
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
            job_input = context.get("input") if isinstance(context.get("input"), dict) else {}
            api_config = job_input.get("api_config") if isinstance(job_input.get("api_config"), dict) else {}
            provider = str(result.get("provider") or job_input.get("provider") or api_config.get("provider") or "").strip()
            if not provider:
                raise ValueError("EXTERNAL_PROVIDER_IDENTITY_MISSING")
            provider_reference = result.get("external_task_id")
            operation_key = f"provider:{job_id}:{lease.attempt_id}:{provider}:generate"
            deadline_hours = max(1, min(int(os.getenv("FEATURE_186_PROVIDER_WAIT_HOURS", "2")), 48))
            now = datetime.now(timezone.utc)
            resume_after = now + timedelta(hours=deadline_hours)
            retry_policy = context.get("retryPolicy") if isinstance(context.get("retryPolicy"), dict) else {}
            created_at_raw = context.get("createdAt")
            deadline_ms = retry_policy.get("deadlineMs")
            if isinstance(created_at_raw, str) and type(deadline_ms) is int and deadline_ms > 0:
                try:
                    created_at = datetime.fromisoformat(created_at_raw.replace("Z", "+00:00"))
                    if created_at.tzinfo is None:
                        created_at = created_at.replace(tzinfo=timezone.utc)
                    resume_after = min(resume_after, created_at.astimezone(timezone.utc) + timedelta(milliseconds=deadline_ms))
                except ValueError:
                    logger.warning("feature_186_provider_deadline_context_invalid", extra={"job_id": job_id})
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
                    next_poll_at=(now + timedelta(seconds=5)).isoformat(),
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
    return run_unified_job(job_id, runner_id, "postgres-pull", attempt_id)
