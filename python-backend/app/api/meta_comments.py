"""Internal Meta comment moderation endpoints."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError
from app.services.social.meta_graph_client import MetaGraphClient

router = APIRouter(prefix="/api/internal/meta/comments", tags=["meta-comments"])


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


class ReplyCommentRequest(BaseModel):
    object_id: str = Field(min_length=1, max_length=255)
    message: str = Field(min_length=1, max_length=2000)
    page_access_token: str = Field(min_length=1)
    page_id: str = Field(min_length=1, max_length=255)


class HideCommentRequest(BaseModel):
    comment_id: str = Field(min_length=1, max_length=255)
    page_access_token: str = Field(min_length=1)
    page_id: str = Field(min_length=1, max_length=255)


class DeleteCommentRequest(BaseModel):
    comment_id: str = Field(min_length=1, max_length=255)
    page_access_token: str = Field(min_length=1)
    page_id: str = Field(min_length=1, max_length=255)


def _extract_provider_comment_id(payload: object) -> str | None:
    if not isinstance(payload, dict):
        return None

    for key in ("provider_comment_id", "providerCommentId", "comment_id", "commentId", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, int):
            return str(value)

    nested = payload.get("result")
    if isinstance(nested, dict):
        return _extract_provider_comment_id(nested)

    return None


async def _call_comment_api(
    request: ReplyCommentRequest | HideCommentRequest | DeleteCommentRequest,
    action: str,
):
    try:
        client = MetaGraphClient(request.page_access_token, page_id=request.page_id)
        if action == "reply":
            result = await client.reply_to_comment(request.object_id, request.message)  # type: ignore[attr-defined]
        elif action == "hide":
            result = await client.hide_comment(request.comment_id)  # type: ignore[attr-defined]
        elif action == "delete":
            result = await client.delete_comment(request.comment_id)  # type: ignore[attr-defined]
        else:
            raise HTTPException(status_code=400, detail="Unsupported action")
    except TokenExpiredError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except MetaApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    provider_comment_id = _extract_provider_comment_id(result)
    status_map = {
        "reply": "replied",
        "hide": "hidden",
        "delete": "deleted",
    }
    return {
        "status": status_map[action],
        "page_id": request.page_id,
        "provider_comment_id": provider_comment_id,
        "result": result,
    }


@router.post("/reply")
async def reply_to_comment(
    request: ReplyCommentRequest,
    _auth: None = Depends(_verify_internal_token),
):
    return await _call_comment_api(request, "reply")


@router.post("/hide")
async def hide_comment(
    request: HideCommentRequest,
    _auth: None = Depends(_verify_internal_token),
):
    return await _call_comment_api(request, "hide")


@router.post("/delete")
async def delete_comment(
    request: DeleteCommentRequest,
    _auth: None = Depends(_verify_internal_token),
):
    return await _call_comment_api(request, "delete")
