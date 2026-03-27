"""Internal Meta publishing endpoints for page posts."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError
from app.services.social.meta_graph_client import MetaGraphClient

router = APIRouter(prefix="/api/internal/meta/posts", tags=["meta-posts"])


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    expected = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None) or getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None)
    if not expected:
        raise HTTPException(status_code=500, detail="Internal token not configured")

    token = x_internal_token or x_proxy_token
    if not token:
        raise HTTPException(status_code=401, detail="Missing internal token")
    if not secrets.compare_digest(token, expected):
        raise HTTPException(status_code=401, detail="Invalid internal token")


class PublishPostRequest(BaseModel):
    page_id: str = Field(min_length=1, max_length=255)
    page_access_token: str = Field(min_length=1)
    message: str = Field(min_length=1, max_length=2000)
    link: Optional[str] = Field(default=None, max_length=2048)
    scheduled_publish_time: Optional[int] = Field(default=None, ge=0)


def _extract_provider_post_id(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None

    for key in ("provider_post_id", "providerPostId", "post_id", "postId", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, int):
            return str(value)

    nested = payload.get("result")
    if isinstance(nested, dict):
        return _extract_provider_post_id(nested)

    return None


async def _create_post(request: PublishPostRequest) -> dict[str, object]:
    try:
        client = MetaGraphClient(request.page_access_token, page_id=request.page_id)
        result = await client.create_post(
            request.message,
            request.link,
            scheduled_at=request.scheduled_publish_time,
        )
    except TokenExpiredError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except MetaApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    provider_post_id = _extract_provider_post_id(result)
    status = "scheduled" if request.scheduled_publish_time is not None else "published"
    return {
        "status": status,
        "page_id": request.page_id,
        "provider_post_id": provider_post_id,
        "result": result,
    }


@router.post("/publish")
async def publish_post(
    request: PublishPostRequest,
    _auth: None = Depends(_verify_internal_token),
):
    return await _create_post(request)


@router.post("/schedule")
async def schedule_post(
    request: PublishPostRequest,
    _auth: None = Depends(_verify_internal_token),
):
    if request.scheduled_publish_time is None:
        raise HTTPException(status_code=400, detail="scheduled_publish_time is required")
    return await _create_post(request)
