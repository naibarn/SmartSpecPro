"""
FastAPI endpoint for vision analysis dispatch (Section 03: Vision Pipeline).

POST /api/v1/vision/analyze — receives dispatch request from Node.js backend,
queues a PostgreSQL worker job, and returns the job ID.
"""

from __future__ import annotations

import os
import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.job_control_plane import dispatch_python_task

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/vision", tags=["vision"])


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)) -> None:
    """Verify the internal proxy token for Node.js -> Python calls."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


class VisionAnalyzeRequest(BaseModel):
    asset_id: int
    image_url: str
    tenant_id: str
    user_id: int
    system_cost: bool = False


class VisionAnalyzeResponse(BaseModel):
    task_id: str
    status: str = "queued"


async def _check_multimodal_memory_flag(tenant_id: str, db: AsyncSession) -> bool:
    """Read the tenant/global multimodalMemory flag from PostgreSQL."""
    try:
        tenant_result = await db.execute(
            text('SELECT value FROM runtime_feature_flags WHERE "scopeKey" = :scope_key LIMIT 1'),
            {"scope_key": f"tenant:{tenant_id}:multimodalMemory"},
        )
        tenant_value = tenant_result.scalar_one_or_none()
        if tenant_value is not None:
            return tenant_value is True

        global_result = await db.execute(
            text('SELECT value FROM runtime_feature_flags WHERE "scopeKey" = :scope_key LIMIT 1'),
            {"scope_key": "global:multimodalMemory"},
        )
        global_value = global_result.scalar_one_or_none()
        if global_value is not None:
            return global_value is True

        env_value = os.getenv("MULTIMODALMEMORY")
        return env_value is not None and env_value.strip().lower() in {"1", "true", "yes", "on"}
    except Exception:
        return False


@router.post(
    "/analyze",
    response_model=VisionAnalyzeResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def analyze_image(
    request: VisionAnalyzeRequest,
    db: AsyncSession = Depends(get_db),
) -> VisionAnalyzeResponse:
    """Dispatch a vision analysis job for the given asset."""
    # Feature flag gate — check PostgreSQL before accepting the request
    flag_enabled = await _check_multimodal_memory_flag(request.tenant_id, db)
    if not flag_enabled:
        raise HTTPException(
            status_code=403,
            detail="Multimodal memory is not enabled for this tenant",
        )

    from app.tasks.vision_tasks import analyze_image_task

    logger.info(
        "Dispatching vision analysis",
        asset_id=request.asset_id,
        tenant_id=request.tenant_id,
    )

    result = dispatch_python_task(
        analyze_image_task.name,
        args=(request.asset_id, request.image_url, request.tenant_id, request.user_id),
        kwargs={"system_cost": request.system_cost},
        tenant_id=request.tenant_id,
        user_id=request.user_id,
        idempotency_key=f"vision:analyze:{request.tenant_id}:{request.asset_id}",
        legacy_task=analyze_image_task,
    )

    return VisionAnalyzeResponse(task_id=result.id, status="queued")
