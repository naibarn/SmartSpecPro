"""Internal Meta messaging endpoint for outbound reply sends."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.smartspecweb_crypto import decrypt_smartspecweb
from app.services.social.meta_graph_client import MetaGraphClient
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError

router = APIRouter(prefix="/api/internal/meta/messages", tags=["meta-messages"])


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


class SendMessageRequest(BaseModel):
    page_id: int = Field(ge=1)
    recipient_id: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=2000)


async def _load_page(db: AsyncSession, page_id: int) -> dict:
    result = await db.execute(
        text(
            """
            SELECT sp.id, sp."tenantId", sp."providerPageId", sp.status,
                   sp."encryptedPageAccessToken", sp."tokenExpiresAt", sp."pageName"
            FROM social_pages sp
            WHERE sp.id = :page_id
            LIMIT 1
            """
        ),
        {"page_id": page_id},
    )
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Page not found")
    return {
        "id": row[0],
        "tenantId": row[1],
        "providerPageId": row[2],
        "status": row[3],
        "encryptedPageAccessToken": row[4],
        "tokenExpiresAt": row[5],
        "pageName": row[6],
    }


@router.post("/send")
async def send_message(
    request: SendMessageRequest,
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(_verify_internal_token),
):
    page = await _load_page(db, request.page_id)
    if page["status"] != "active":
        raise HTTPException(status_code=409, detail="Page is not active")

    encrypted_page_token = page["encryptedPageAccessToken"]
    if not encrypted_page_token:
        raise HTTPException(status_code=409, detail="Page access token is missing")

    token_expires_at = page["tokenExpiresAt"]
    if token_expires_at and token_expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=409, detail="Page access token has expired")

    try:
        page_token = decrypt_smartspecweb(encrypted_page_token)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to decrypt page token: {exc}") from exc

    try:
        client = MetaGraphClient(page_token, page_id=str(page["providerPageId"]))
        result = await client.send_message(request.recipient_id, request.text)
    except TokenExpiredError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except RateLimitExceededError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except MetaApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    provider_message_id = result.get("id") if isinstance(result, dict) else None
    return {
        "status": "sent",
        "page_id": request.page_id,
        "recipient_id": request.recipient_id,
        "provider_message_id": provider_message_id,
        "result": result,
    }
