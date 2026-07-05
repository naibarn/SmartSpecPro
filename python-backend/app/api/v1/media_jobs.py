"""HTTP bridge for Node.js → Celery media job dispatch."""

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


@router.post("/media-jobs/execute")
async def execute_media_job_endpoint(
    request: MediaJobRequest,
    x_internal_token: str = Header("", alias="x-internal-token"),
):
    """Accept a media job spec from the Node.js server and dispatch to Celery.

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

        task = execute_media_job.delay(
            request.spec_json,
            request.user_id,
            request.job_id,
        )
        return {"taskId": task.id, "jobId": request.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail="Media job dispatch failed")
