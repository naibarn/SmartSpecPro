"""FastAPI endpoints for the AI Agency Creator (Phase F).

Endpoints:
  POST /api/v1/agency-creator/start   → enqueue discover task, return task_id
  GET  /api/v1/agency-creator/status/{task_id} → poll status
  POST /api/v1/agency-creator/answer  → submit interview answers, dispatch design task
"""

import asyncio
import hashlib
import json
import os
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.core.auth import get_current_user
from app.models.user import User
from app.services.job_control_plane import dispatch_python_task

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
    answers: dict[str, str] = Field(default_factory=dict, max_length=20)

    @field_validator("answers")
    @classmethod
    def validate_answer_size(cls, value: dict[str, str]) -> dict[str, str]:
        if any(len(key) > 100 or len(answer) > 4000 for key, answer in value.items()):
            raise ValueError("Interview answers are too large")
        return value


@router.post("/start")
async def start_agency_creator(
    body: AgencyCreatorStartRequest,
    current_user: User = Depends(get_current_user),
):
    """Submit agency creation to Celery queue. Returns task_id immediately."""
    resolved_tenant_id = str(current_user.currentTenantId or "").strip()
    if body.tenant_id and body.tenant_id != resolved_tenant_id:
        raise HTTPException(status_code=403, detail="tenant_id must match the authenticated session")
    if not resolved_tenant_id:
        raise HTTPException(status_code=403, detail="Authenticated tenant is required")
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
        "tenantId": resolved_tenant_id,
    }
    if body.spec_file_base64:
        payload["specFileBase64"] = body.spec_file_base64

    try:
        dispatch_python_task(
            create_agency_discover_task.name,
            kwargs={"task_id": task_id, "user_id": current_user.id, "payload": payload},
            tenant_id=resolved_tenant_id,
            user_id=current_user.id,
            idempotency_key=f"agency-creator:discover:{resolved_tenant_id}:{task_id}",
            legacy_task=create_agency_discover_task,
        )
        logger.info("agency_creator_queued", task_id=task_id, user_id=current_user.id)
    except Exception as exc:
        logger.error("agency_creator_queue_failed", error=str(exc)[:200])
        if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
            raise HTTPException(
                status_code=503,
                detail="Job control plane unavailable; agency creation was not executed.",
            ) from exc
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

    from app.tasks.agency_creator_task import get_status, get_suggestions

    data = get_status(
        task_id,
        user_id=current_user.id,
        tenant_id=current_user.currentTenantId,
    )
    if data is None:
        raise HTTPException(status_code=404, detail="Task not found")

    # Strip internal fields before returning to client
    result = {k: v for k, v in data.items() if not k.startswith("_")}

    # Merge suggestions into completed status response
    # Strip raw 'change' dict (F03 security) but extract the primary value as 'suggestedValue'
    if result.get("status") == "completed" and result.get("hasSuggestions"):
        _CHANGE_KEYS = {"add_capability": "capability", "add_tool": "toolId", "upgrade_mode": "executionMode"}
        raw_suggestions = get_suggestions(task_id, tenant_id=current_user.currentTenantId)
        safe_suggestions = []
        for s in raw_suggestions:
            if not isinstance(s, dict):
                continue
            change = s.get("change", {}) if isinstance(s.get("change"), dict) else {}
            primary_key = _CHANGE_KEYS.get(s.get("category", ""))
            suggested_value = str(change.get(primary_key, ""))[:100] if primary_key else ""
            safe = {k: v for k, v in s.items() if k != "change"}
            if suggested_value:
                safe["suggestedValue"] = suggested_value
            safe_suggestions.append(safe)
        result["suggestions"] = safe_suggestions

    return result


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

    status = get_status(
        body.task_id,
        user_id=current_user.id,
        tenant_id=current_user.currentTenantId,
    )
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

    if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
        # Interview continuation is a resume of the same canonical job. Do
        # not create a second job for the design phase: that would split the
        # lease, cancellation, settlement, and audit history across ledgers.
        canonical_job_id = status.get("canonical_job_id")
        if not isinstance(canonical_job_id, str) or not canonical_job_id:
            raise HTTPException(status_code=409, detail="Canonical job binding is unavailable")
        answer_digest = hashlib.sha256(
            json.dumps(body.answers, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest()
        resume_input = {
            "taskName": create_agency_design_task.name,
            "args": [body.task_id, current_user.id, design_payload],
            "kwargs": {},
            "queue": None,
            "legacyUserId": str(current_user.id),
        }
        from app.services.job_control_plane import JobControlPlaneClient

        resumed = await asyncio.to_thread(
            JobControlPlaneClient().resume_external,
            canonical_job_id,
            f"python-agency:{current_user.id}",
            "postgres-pull",
            input_json=resume_input,
            resume_key=f"agency-answer:{body.task_id}:{answer_digest}",
        )
        if not resumed:
            raise HTTPException(status_code=409, detail="Task is no longer awaiting answers")
        return {"ok": True}

    _set_status(body.task_id, {
        "status": "processing",
        "phase": "design",
        "message": "Designing agency architecture...",
        "_user_id": current_user.id,
    })

    try:
        dispatch_python_task(
            create_agency_design_task.name,
            kwargs={"task_id": body.task_id, "user_id": current_user.id, "payload": design_payload},
            tenant_id=current_user.currentTenantId,
            user_id=current_user.id,
            idempotency_key=f"agency-creator:design:{current_user.currentTenantId}:{body.task_id}",
            legacy_task=create_agency_design_task,
        )
    except Exception as exc:
        logger.error("agency_creator_design_dispatch_failed", error=str(exc)[:200])
        if os.getenv("FEATURE_186_HARD_CUTOVER") == "true":
            raise HTTPException(
                status_code=503,
                detail="Job control plane unavailable; agency design was not executed.",
            ) from exc
        # Fallback sync
        import threading

        from app.tasks.agency_creator_task import _design_async, _run_async
        t = threading.Thread(
            target=lambda: _run_async(_design_async(body.task_id, current_user.id, design_payload)),
            daemon=True,
        )
        t.start()

    return {"ok": True}
