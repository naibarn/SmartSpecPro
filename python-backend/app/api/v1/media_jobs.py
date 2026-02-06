"""HTTP bridge for Node.js → Celery media job dispatch."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class MediaJobRequest(BaseModel):
    spec_json: str
    user_id: str
    job_id: str


@router.post("/media-jobs/execute")
async def execute_media_job_endpoint(request: MediaJobRequest):
    """Accept a media job spec from the Node.js server and dispatch to Celery."""
    try:
        from app.tasks.media_job_worker import execute_media_job

        task = execute_media_job.delay(
            request.spec_json,
            request.user_id,
            request.job_id,
        )
        return {"taskId": task.id, "jobId": request.job_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
