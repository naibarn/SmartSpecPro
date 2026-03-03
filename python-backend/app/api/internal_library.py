"""Internal library scope propagation API router.

Exposes endpoints for the Node.js backend to trigger scope recomputation
and vector store metadata propagation after permission changes:
  POST /api/internal/library/propagate-scopes  -- propagate scopes to vector stores
  POST /api/internal/library/reindex           -- trigger full library reindex
  GET  /api/internal/library/reindex/status    -- get reindex job status
"""

from __future__ import annotations

import secrets
from typing import Optional, Any, Dict

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import verify_token
from app.core.config import settings
from app.core.database import get_db
from app.models.user import User
from app.orchestrator.rag.scope_engine import propagate_scopes_to_vector_stores

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal/library", tags=["Internal Library"])


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)):
    """Verify the internal proxy token for Node.js -> Python calls."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


async def _verify_reindex_auth(
    x_proxy_token: Optional[str] = Header(None),
    authorization: Optional[str] = Header(None),
    session: AsyncSession = Depends(get_db),
):
    """
    Verify auth for reindex internal endpoints.

    Accept either:
    1) x-proxy-token (server-to-server), or
    2) Authorization: Bearer <access-token> of an active admin user.
    """
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if x_proxy_token and proxy_token and secrets.compare_digest(x_proxy_token, proxy_token):
        return

    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:]
        payload = verify_token(token, expected_type="access")
        if payload:
            user_id = payload.get("sub") or payload.get("user_id")
            try:
                user_id_int = int(user_id)
            except (TypeError, ValueError):
                user_id_int = None
            if user_id_int is not None:
                result = await session.execute(select(User).where(User.id == user_id_int))
                user = result.scalar_one_or_none()
                if user and user.is_active and user.is_admin:
                    return

    raise HTTPException(status_code=401, detail="Missing or invalid internal credentials")


class PropagateScopesRequest(BaseModel):
    item_id: int
    tenant_id: str
    new_allowed_scopes: list[str]


class PropagateScopesResponse(BaseModel):
    success: bool
    providers_updated: dict[str, int]


class ReindexResponse(BaseModel):
    task_id: str
    status: str
    message: str


class ReindexStatusResponse(BaseModel):
    task_id: Optional[str]
    status: str
    result: Optional[Dict[str, Any]]


@router.post(
    "/propagate-scopes",
    response_model=PropagateScopesResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def propagate_scopes_endpoint(
    request: PropagateScopesRequest,
    session: AsyncSession = Depends(get_db),
):
    """
    Internal endpoint called by Node.js after permission changes.
    Propagates allowed_scopes to vector store metadata (pgvector, ChromaDB,
    Cloudflare Vectorize).

    The Node.js side has already updated the PostgreSQL allowed_scopes columns.
    This endpoint handles the vector store metadata sync.
    """
    try:
        result = await propagate_scopes_to_vector_stores(
            item_id=request.item_id,
            new_allowed_scopes=request.new_allowed_scopes,
            tenant_id=request.tenant_id,
            session=session,
        )

        logger.info(
            "propagate_scopes_api_success",
            item_id=request.item_id,
            tenant_id=request.tenant_id,
            providers=result,
        )

        return PropagateScopesResponse(
            success=True,
            providers_updated=result,
        )
    except Exception as e:
        logger.error(
            "propagate_scopes_api_error",
            item_id=request.item_id,
            tenant_id=request.tenant_id,
            error=str(e),
        )
        raise HTTPException(status_code=500, detail="Scope propagation failed")


@router.post(
    "/reindex",
    response_model=ReindexResponse,
    dependencies=[Depends(_verify_reindex_auth)],
)
async def trigger_library_reindex_internal():
    """Trigger a full reindex of all library items via Celery (internal)."""
    import redis
    from celery.result import AsyncResult
    from app.tasks.media_tasks import reindex_all_library_task

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    existing_task_id = r.get("vectordb:reindex:task_id")
    if existing_task_id:
        existing_task_id = (
            existing_task_id.decode()
            if isinstance(existing_task_id, bytes)
            else existing_task_id
        )
        result = AsyncResult(existing_task_id)
        if result.state in ("PENDING", "STARTED", "RETRY"):
            return ReindexResponse(
                task_id=existing_task_id,
                status="already_running",
                message="A reindex job is already in progress",
            )

    task = reindex_all_library_task.delay(tenant_id=None)
    r.set("vectordb:reindex:task_id", task.id, ex=3600)  # TTL 1 hour
    return ReindexResponse(
        task_id=task.id,
        status="started",
        message="Reindex job has been queued",
    )


@router.get(
    "/reindex/status",
    response_model=ReindexStatusResponse,
    dependencies=[Depends(_verify_reindex_auth)],
)
async def get_library_reindex_status_internal():
    """Check the status of the current reindex job (internal)."""
    import redis
    from celery.result import AsyncResult

    redis_url = settings.REDIS_URL or "redis://localhost:6379/0"
    r = redis.from_url(redis_url)
    task_id = r.get("vectordb:reindex:task_id")

    if not task_id:
        return ReindexStatusResponse(status="idle", task_id=None, result=None)

    task_id_str = task_id.decode() if isinstance(task_id, bytes) else str(task_id)
    result = AsyncResult(task_id_str)
    payload: Dict[str, Any] = {
        "task_id": task_id_str,
        "status": result.state.lower(),
        "result": None,
    }

    if result.state == "SUCCESS":
        payload["result"] = result.result
        payload["status"] = "completed"
    elif result.state == "FAILURE":
        payload["status"] = "failed"
        payload["result"] = {"error": str(result.result)}

    return ReindexStatusResponse(**payload)
