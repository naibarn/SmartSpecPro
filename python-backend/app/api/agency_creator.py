"""FastAPI endpoints for the AI Agency Creator (Phase F).

Endpoints:
  POST /api/v1/agency-creator/start   → enqueue discover task, return task_id
  GET  /api/v1/agency-creator/status/{task_id} → poll status
  POST /api/v1/agency-creator/answer  → submit interview answers, dispatch design task
"""

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.core.auth import get_current_user
from app.models.user import User

router = APIRouter()
logger = structlog.get_logger(__name__)


class AgencyCreatorStartRequest(BaseModel):
    requirement: str = Field(..., min_length=10, max_length=10000)
    spec_file_base64: str | None = Field(default=None, max_length=10_000_000)
    model: str = Field(default="gpt-4o", max_length=100)
    skip_interview: bool = Field(default=False)
    user_id: int | None = Field(default=None)  # forwarded by tRPC layer
    tenant_id: str | None = Field(default=None, max_length=100)  # tenant context from tRPC


class AgencyCreatorAnswerRequest(BaseModel):
    task_id: str = Field(..., pattern=r"^agcreate-[a-f0-9]{12}$")
    answers: dict[str, str] = Field(default_factory=dict)


@router.post("/start")
async def start_agency_creator(
    body: AgencyCreatorStartRequest,
    current_user: User = Depends(get_current_user),
):
    """Submit agency creation to Celery queue. Returns task_id immediately."""
    from app.tasks.agency_creator_task import (
        _set_status,
        create_agency_discover_task,
        create_task_id,
    )

    task_id = create_task_id()

    _set_status(task_id, {
        "status": "queued",
        "phase": "discover",
        "message": "Waiting in queue...",
        "_user_id": current_user.id,
    })

    payload = {
        "requirement": body.requirement,
        "model": body.model,
        "skipInterview": body.skip_interview,
        "tenantId": body.tenant_id or "",
    }
    if body.spec_file_base64:
        payload["specFileBase64"] = body.spec_file_base64

    try:
        create_agency_discover_task.delay(
            task_id=task_id,
            user_id=current_user.id,
            payload=payload,
        )
        logger.info("agency_creator_queued", task_id=task_id, user_id=current_user.id)
    except Exception as exc:
        logger.error("agency_creator_queue_failed", error=str(exc)[:200])
        # Fallback: run synchronously (for development without Celery)
        from app.tasks.agency_creator_task import _discover_async, _run_async
        _set_status(task_id, {
            "status": "processing",
            "phase": "discover",
            "message": "Running synchronously (no Celery)...",
            "_user_id": current_user.id,
        })
        import threading
        t = threading.Thread(
            target=lambda: _run_async(_discover_async(task_id, current_user.id, payload)),
            daemon=True,
        )
        t.start()

    return {"task_id": task_id, "status": "queued"}


@router.get("/status/{task_id}")
async def get_agency_creator_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
):
    """Poll agency creator task status."""
    import re
    if not re.match(r"^agcreate-[a-f0-9]{12}$", task_id):
        raise HTTPException(status_code=400, detail="Invalid task_id format")

    from app.tasks.agency_creator_task import get_status

    data = get_status(task_id, user_id=current_user.id)
    if data is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Strip internal fields before returning to client
    return {k: v for k, v in data.items() if not k.startswith("_")}


@router.post("/answer")
async def submit_agency_creator_answers(
    body: AgencyCreatorAnswerRequest,
    current_user: User = Depends(get_current_user),
):
    """Store interview answers and dispatch the design task."""
    from app.tasks.agency_creator_task import (
        _set_status,
        create_agency_design_task,
        get_status,
        store_answers,
    )

    status = get_status(body.task_id, user_id=current_user.id)
    if status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    if status.get("status") != "awaiting_answers":
        raise HTTPException(status_code=400, detail="Task is not awaiting answers")

    store_answers(body.task_id, body.answers)

    # Retrieve stored payload + intent + discover_analysis, dispatch design task
    payload = status.get("_payload", {})
    intent = status.get("_intent", {})
    model = status.get("_model", "gpt-4o")
    discover_analysis = status.get("_discover_analysis", {})
    design_payload = {
        **payload, "intent": intent, "answers": body.answers,
        "model": model, "discover_analysis": discover_analysis,
    }

    _set_status(body.task_id, {
        "status": "processing",
        "phase": "design",
        "message": "Designing agency architecture...",
        "_user_id": current_user.id,
    })

    try:
        create_agency_design_task.delay(
            task_id=body.task_id,
            user_id=current_user.id,
            payload=design_payload,
        )
    except Exception as exc:
        logger.error("agency_creator_design_dispatch_failed", error=str(exc)[:200])
        # Fallback sync
        import threading

        from app.tasks.agency_creator_task import _design_async, _run_async
        t = threading.Thread(
            target=lambda: _run_async(_design_async(body.task_id, current_user.id, design_payload)),
            daemon=True,
        )
        t.start()

    return {"ok": True}
