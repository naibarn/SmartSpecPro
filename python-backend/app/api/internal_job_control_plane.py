"""Internal transport adapter for Feature 186 Python execution."""

from __future__ import annotations

import secrets
import os
from typing import Any

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(prefix="/api/internal/job-control-plane", tags=["Internal Job Control Plane"])


def _verify_token(token: str) -> None:
    expected_tokens = {
        str(getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", "") or "").strip(),
        str(getattr(settings, "SMARTSPEC_PROXY_TOKEN", "") or "").strip(),
    }
    expected_tokens.discard("")
    if not expected_tokens:
        raise HTTPException(status_code=503, detail="Internal token is not configured")
    if not token or not any(secrets.compare_digest(token, expected) for expected in expected_tokens):
        raise HTTPException(status_code=401, detail="Invalid internal token")


class PublishRequest(BaseModel):
    job_id: str = Field(min_length=1, max_length=80)
    task_id: str = Field(min_length=1, max_length=200)
    attempt_id: str | None = Field(default=None, max_length=80)
    queue: str | None = Field(default=None, max_length=80)


@router.post("/publish")
def publish_unified_job(
    request: PublishRequest,
    x_internal_token: str = Header("", alias="x-internal-token"),
) -> dict[str, Any]:
    """Publish one canonical job through the legacy Celery compatibility adapter.

    The task ID is the outbox dedupe key. It is not used by PostgreSQL-pull
    mode; that mode claims the durable outbox publication directly.
    """
    _verify_token(x_internal_token)

    # Hard cutover has one accepted Python execution path.  A deployment that
    # enables the cutover flag without the PostgreSQL-pull worker must fail
    # closed instead of falling back to Celery for an already-created job.
    # This keeps the local compatibility endpoint from becoming an accidental
    # production runtime target while the Cloudflare account is being prepared.
    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true" and os.getenv("FEATURE_186_POSTGRES_PYTHON_WORKER") != "true":
        raise HTTPException(status_code=503, detail="POSTGRES_PULL_REQUIRED")

    from app.tasks.unified_job_task import execute_unified_job, run_unified_job

    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true" and os.getenv("FEATURE_186_POSTGRES_PYTHON_WORKER") == "true":
        return {
            "taskId": request.task_id,
            "jobId": request.job_id,
            "transport": "postgres-pull",
            "state": run_unified_job(request.job_id, "internal-postgres-pull", "postgres-pull", request.attempt_id)["state"],
        }

    # This is the Celery compatibility adapter for an already-created
    # canonical job. Calling dispatch_python_task here would create a second
    # worker_jobs row while publishing the first one, defeating the outbox
    # dedupe key and potentially recursing back into this route.
    task_args: list[Any] = [request.job_id]
    if request.attempt_id:
        task_args.extend([None, request.attempt_id])
    options: dict[str, Any] = {"task_id": request.task_id}
    if request.queue:
        options["queue"] = request.queue
    result = execute_unified_job.apply_async(args=task_args, **options)
    return {"taskId": result.id}
