"""HTTP bridge for Node.js → canonical Python media-job dispatch."""

import os
import secrets

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

router = APIRouter()

MEDIA_JOB_INTERNAL_TOKEN = os.environ.get("MEDIA_JOB_INTERNAL_TOKEN", "")


class MediaJobRequest(BaseModel):
    spec_json: str
    user_id: str
    job_id: str
    tenant_id: str | None = None


@router.post("/media-jobs/execute")
async def execute_media_job_endpoint(
    request: MediaJobRequest,
    x_internal_token: str = Header("", alias="x-internal-token"),
):
    """Accept a media job spec and create one canonical Python job.

    Requires internal service token for authentication (node.js → python).
    """
    # Fail closed: this endpoint must never accept requests unless the shared
    # token is actually configured on the server side.
    if not MEDIA_JOB_INTERNAL_TOKEN:
        raise HTTPException(status_code=503, detail="Service not configured")

    if not secrets.compare_digest(x_internal_token, MEDIA_JOB_INTERNAL_TOKEN):
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        from app.tasks.media_job_worker import execute_media_job

        from app.services.job_control_plane import dispatch_python_task

        task = dispatch_python_task(
            execute_media_job.name,
            args=[request.spec_json, request.user_id, request.job_id],
            tenant_id=request.tenant_id or os.getenv("FEATURE_186_SYSTEM_TENANT_ID"),
            user_id=int(request.user_id) if request.user_id.isdigit() else None,
            correlation_id=f"media-job:{request.job_id}",
            idempotency_key=f"media-job:{request.job_id}",
            legacy_task=execute_media_job,
        )
        return {"taskId": task.id, "jobId": request.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Media job dispatch failed")
