"""Internal provider-aware social publishing endpoint."""

from __future__ import annotations

import base64
import binascii
import secrets
from typing import Any, Literal, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, SocialProviderApiError, TikTokApiError, TokenExpiredError, YouTubeApiError
from app.services.social.publish_service import publish_social_content
from app.services.social.meta_graph_client import MetaGraphClient, PHOTO_CONTENT_TYPES, PHOTO_MAX_BYTES

router = APIRouter(prefix="/api/internal/social", tags=["social-publish"])
REELS_MAX_BYTES = 1024 * 1024 * 1024
PHOTO_MAX_UPLOAD_BYTES = PHOTO_MAX_BYTES


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
    x_proxy_token: Optional[str] = Header(None),
) -> None:
    expected = getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None) or getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
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


class ReelConnection(BaseModel):
    page_id: str = Field(min_length=1, max_length=255, pattern=r"^\d+$")
    access_token: str = Field(min_length=1, max_length=8192)


class ReelVideo(ReelConnection):
    video_id: str = Field(min_length=1, max_length=255, pattern=r"^\d+$")


class ReelFinish(ReelVideo):
    description: str = Field(max_length=5000)
    is_ai_generated: bool
    scheduled_publish_time: int | None = Field(default=None, ge=0)


class PhotoStatus(BaseModel):
    page_id: str = Field(min_length=1, max_length=255, pattern=r"^\d+$")
    access_token: str = Field(min_length=1, max_length=8192)
    photo_id: str = Field(min_length=1, max_length=255, pattern=r"^\d+$")


def _raise_reels_meta_error(exc: Exception, generic_message: str) -> HTTPException:
    if isinstance(exc, TokenExpiredError):
        return HTTPException(status_code=401, detail="META_TOKEN_INVALID")
    if isinstance(exc, PermissionDeniedError):
        return HTTPException(status_code=403, detail="META_PERMISSION_MISSING")
    return HTTPException(status_code=502, detail=generic_message)


@router.post("/reels/start")
async def start_reel(request: ReelConnection, _auth: None = Depends(_verify_internal_token)) -> dict[str, Any]:
    async with MetaGraphClient(request.access_token, page_id=request.page_id) as client:
        try:
            return await client.start_reel_upload()
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta Reels session could not be confirmed") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta Reels session could not be confirmed") from exc


@router.post("/reels/status")
async def reel_status(request: ReelVideo, _auth: None = Depends(_verify_internal_token)) -> dict[str, Any]:
    async with MetaGraphClient(request.access_token, page_id=request.page_id) as client:
        try:
            return await client.get_reel_status(request.video_id)
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta Reels status is unavailable") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta Reels status is unavailable") from exc


@router.post("/reels/finish")
async def finish_reel(request: ReelFinish, _auth: None = Depends(_verify_internal_token)) -> dict[str, Any]:
    async with MetaGraphClient(request.access_token, page_id=request.page_id) as client:
        try:
            finish_args: dict[str, Any] = {
                "video_id": request.video_id,
                "description": request.description,
                "is_ai_generated": request.is_ai_generated,
            }
            if request.scheduled_publish_time is not None:
                finish_args["scheduled_publish_time"] = request.scheduled_publish_time
            return await client.finish_reel_upload(**finish_args)
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta Reels publication could not be confirmed; reconcile status before retry") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta Reels publication could not be confirmed; reconcile status before retry") from exc


@router.post("/reels/upload")
async def upload_reel(
    request: Request,
    x_meta_access_token: str = Header(..., min_length=1, max_length=8192),
    x_meta_video_id: str = Header(..., pattern=r"^\d+$", max_length=255),
    x_meta_upload_url: str = Header(..., max_length=2048),
    x_meta_file_size: int = Header(..., gt=0, le=REELS_MAX_BYTES),
    x_meta_offset: int = Header(..., ge=0),
    content_length: int = Header(..., gt=0, le=REELS_MAX_BYTES),
    _auth: None = Depends(_verify_internal_token),
) -> dict[str, Any]:
    if x_meta_offset >= x_meta_file_size or content_length != x_meta_file_size - x_meta_offset:
        raise HTTPException(status_code=400, detail="Invalid upload length or offset")
    try:
        MetaGraphClient._validate_reel_upload_url(x_meta_upload_url, x_meta_video_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="Invalid Meta upload session") from exc

    async def bounded_body():
        total = 0
        async for chunk in request.stream():
            total += len(chunk)
            if total > content_length:
                raise ValueError("Upload exceeds declared length")
            if chunk:
                yield chunk
        if total != content_length:
            raise ValueError("Upload is shorter than declared length")

    async with MetaGraphClient(x_meta_access_token) as client:
        try:
            return await client.upload_reel_binary(video_id=x_meta_video_id, upload_url=x_meta_upload_url,
                                                   content=bounded_body(), file_size=x_meta_file_size, offset=x_meta_offset)
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta Reels upload could not be confirmed; reconcile status before retry") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta Reels upload could not be confirmed; reconcile status before retry") from exc


@router.post("/photos/publish")
async def publish_page_photo(
    request: Request,
    x_meta_access_token: str = Header(..., min_length=1, max_length=8192),
    x_meta_page_id: str = Header(..., pattern=r"^\d+$", max_length=255),
    x_meta_file_name: str = Header(..., min_length=1, max_length=255),
    x_meta_content_type: str = Header(..., min_length=1, max_length=100),
    x_meta_file_size: int = Header(..., gt=0, le=PHOTO_MAX_UPLOAD_BYTES),
    x_meta_caption_base64: str = Header(..., min_length=1, max_length=11000),
    content_length: int = Header(..., gt=0, le=PHOTO_MAX_UPLOAD_BYTES),
    _auth: None = Depends(_verify_internal_token),
) -> dict[str, Any]:
    if content_length != x_meta_file_size:
        raise HTTPException(status_code=400, detail="Invalid photo upload length")
    if x_meta_content_type not in PHOTO_CONTENT_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported photo content type")
    try:
        caption = base64.b64decode(x_meta_caption_base64, validate=True).decode("utf-8")
    except (binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid photo caption encoding") from exc
    if len(caption) > 2000:
        raise HTTPException(status_code=400, detail="Photo caption is too long")
    content = bytearray()
    async for chunk in request.stream():
        content.extend(chunk)
        if len(content) > content_length or len(content) > PHOTO_MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail="Photo upload exceeds declared size")
    if len(content) != content_length:
        raise HTTPException(status_code=400, detail="Photo upload is shorter than declared size")

    async with MetaGraphClient(x_meta_access_token, page_id=x_meta_page_id) as client:
        try:
            return await client.publish_page_photo(
                message=caption,
                content=bytes(content),
                filename=x_meta_file_name,
                content_type=x_meta_content_type,
            )
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta photo publication could not be confirmed; check the Page before retry") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta photo publication could not be confirmed; check the Page before retry") from exc


@router.post("/photos/status")
async def get_page_photo_status(request: PhotoStatus, _auth: None = Depends(_verify_internal_token)) -> dict[str, Any]:
    async with MetaGraphClient(request.access_token, page_id=request.page_id) as client:
        try:
            return await client.get_page_photo_status(request.photo_id)
        except (TokenExpiredError, PermissionDeniedError) as exc:
            raise _raise_reels_meta_error(exc, "Meta photo status could not be verified") from exc
        except (MetaApiError, ValueError) as exc:
            raise HTTPException(status_code=502, detail="Meta photo status could not be verified") from exc


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
