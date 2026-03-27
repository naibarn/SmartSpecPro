"""Internal provider-aware social publishing endpoint."""

from __future__ import annotations

import secrets
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.social.exceptions import MetaApiError, SocialProviderApiError, TikTokApiError, YouTubeApiError
from app.services.social.publish_service import publish_social_content

router = APIRouter(prefix="/api/internal/social", tags=["social-publish"])


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


class VideoMetadata(BaseModel):
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    duration_seconds: int | None = Field(default=None, gt=0)


class PublishSocialRequest(BaseModel):
    provider: Literal["meta", "tiktok", "youtube"]
    page_id: str = Field(min_length=1, max_length=255)
    access_token: str = Field(min_length=1)
    message: str | None = Field(default=None, max_length=2000)
    link: str | None = Field(default=None, max_length=2048)
    media_urls: list[str] = Field(default_factory=list)
    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    tags: list[str] = Field(default_factory=list)
    privacy_status: str | None = Field(default=None, max_length=50)
    scheduled_publish_time: int | None = Field(default=None, ge=0)
    publish_at: str | None = Field(default=None, max_length=64)
    video_metadata: VideoMetadata | None = None


def _map_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TikTokApiError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, YouTubeApiError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, MetaApiError):
        return HTTPException(status_code=502, detail=str(exc))
    if isinstance(exc, SocialProviderApiError):
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@router.post("/publish")
async def publish_social_post(
    request: PublishSocialRequest,
    _auth: None = Depends(_verify_internal_token),
) -> dict[str, object]:
    try:
        result = await publish_social_content(
            provider=request.provider,
            access_token=request.access_token,
            page_id=request.page_id,
            message=request.message,
            link=request.link,
            media_urls=request.media_urls or None,
            title=request.title,
            description=request.description,
            tags=request.tags or None,
            privacy_status=request.privacy_status,
            scheduled_publish_time=request.scheduled_publish_time,
            publish_at=request.publish_at,
            video_metadata=request.video_metadata.model_dump() if request.video_metadata else None,
        )
    except Exception as exc:  # pragma: no cover - mapped below for clarity
        raise _map_error(exc) from exc

    return {
        "provider": result.get("provider", request.provider),
        "status": result.get("status", "published"),
        "provider_post_id": result.get("provider_post_id"),
        "shorts_candidate": result.get("shorts_candidate"),
        "result": result.get("result"),
    }
