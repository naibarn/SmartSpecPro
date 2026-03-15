"""
FastAPI endpoint for vision analysis dispatch (Section 03: Vision Pipeline).

POST /api/v1/vision/analyze — receives dispatch request from Node.js backend,
queues a Celery task, and returns the task ID.
"""

from __future__ import annotations

import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel

from app.core.config import settings

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


async def _check_multimodal_memory_flag(tenant_id: str) -> bool:
    """Check if the multimodalMemory feature flag is enabled for the tenant via Redis."""
    try:
        from app.services.redis_service import get_redis_client
        redis = await get_redis_client()
        if redis is None:
            # Redis unavailable → treat as flag off (safe default)
            return False
        flag_key = f"feature_flag:multimodalMemory:{tenant_id}"
        flag_value = await redis.get(flag_key)
        return flag_value == "true"
    except Exception:
        return False


@router.post(
    "/analyze",
    response_model=VisionAnalyzeResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def analyze_image(request: VisionAnalyzeRequest) -> VisionAnalyzeResponse:
    """Dispatch a vision analysis Celery task for the given asset."""
    # Feature flag gate — check Redis before accepting the request
    flag_enabled = await _check_multimodal_memory_flag(request.tenant_id)
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

    result = analyze_image_task.delay(
        request.asset_id,
        request.image_url,
        request.tenant_id,
        request.user_id,
        system_cost=request.system_cost,
    )

    return VisionAnalyzeResponse(task_id=result.id, status="queued")
