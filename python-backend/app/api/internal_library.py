"""Internal library scope propagation API router.

Exposes endpoints for the Node.js backend to trigger scope recomputation
and vector store metadata propagation after permission changes:
  POST /api/internal/library/propagate-scopes  -- propagate scopes to vector stores
"""

from __future__ import annotations

import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
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


class PropagateScopesRequest(BaseModel):
    item_id: int
    tenant_id: str
    new_allowed_scopes: list[str]


class PropagateScopesResponse(BaseModel):
    success: bool
    providers_updated: dict[str, int]


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
