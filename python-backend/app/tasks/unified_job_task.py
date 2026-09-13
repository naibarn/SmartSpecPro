"""Celery compatibility shim for Feature 186.

Existing task families can register an executor one wave at a time. Celery
ack/retry settings remain transport controls; the control-plane client owns
business attempt and terminal semantics.
"""

import os
from collections.abc import Callable
from typing import Any

from app.core.celery_app import celery_app
from app.services.job_control_plane import JobControlPlaneClient

Executor = Callable[[dict[str, Any], JobControlPlaneClient, Any], dict[str, Any] | None]
_executors: dict[str, Executor] = {}


def register_unified_executor(job_type: str, executor: Executor) -> None:
    if not job_type or job_type in _executors:
        raise ValueError("JOB_EXECUTOR_REGISTRATION_CONFLICT")
    _executors[job_type] = executor


@celery_app.task(name="feature_186.execute_unified_job", bind=True, max_retries=0, acks_late=True)
def execute_unified_job(self, job_id: str, runner_id: str | None = None) -> dict[str, Any]:
    client = JobControlPlaneClient()
    lease = client.claim(job_id, runner_id or os.getenv("HOSTNAME", "celery-runner"), "celery")
    if lease is None:
        return {"job_id": job_id, "state": "ignored"}
    context = client.context(job_id)
    job_type = context["jobType"]
    executor = _executors.get(job_type)
    if executor is None:
        client.fail(lease, {"code": "UNSUPPORTED_JOB_TYPE", "message": job_type[:200], "class": "permanent"})
        return {"job_id": job_id, "state": "failed"}
    client.start(lease)
    try:
        client.assert_active(lease)
        result = executor(context, client, lease)
        client.complete(lease, result or {})
        return {"job_id": job_id, "state": "completed"}
    except Exception as error:  # control-plane classification stays explicit
        retryable = isinstance(error, (TimeoutError, ConnectionError, OSError))
        client.fail(lease, {
            "code": type(error).__name__,
            "message": str(error)[:2000],
            "class": "retryable" if retryable else "unknown",
            "operatorReviewRequired": not retryable,
        })
        raise
