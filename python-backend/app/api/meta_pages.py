"""Internal Meta page connection endpoints."""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.services.social.meta_graph_client import MetaGraphClient
from app.core.smartspecweb_crypto import decrypt_smartspecweb

router = APIRouter(prefix="/api/internal/meta/pages", tags=["meta-pages"])


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


class ConnectPageRequest(BaseModel):
    page_id: int = Field(ge=1)
    subscribed_fields: list[str] | None = None


class DisconnectPageRequest(BaseModel):
    page_id: int = Field(ge=1)


async def _load_page(db: AsyncSession, page_id: int) -> dict:
    result = await db.execute(
        text(
            """
            SELECT sp.id, sp."tenantId", sp."connectionId", sp."providerPageId", sp."pageName",
                   sp.status, sp."encryptedPageAccessToken", sp."tokenExpiresAt",
                   sp."selectedForInbox", sp."selectedForPublishing", sp."selectedForModeration",
                   sp."aiActionMode", sp."autoSendConfidenceThreshold",
                   pc."providerUserId", pc."encryptedAccessToken"
            FROM social_pages sp
            JOIN social_provider_connections pc ON pc.id = sp."connectionId"
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
        "connectionId": row[2],
        "providerPageId": row[3],
        "pageName": row[4],
        "status": row[5],
        "encryptedPageAccessToken": row[6],
        "tokenExpiresAt": row[7],
        "selectedForInbox": row[8],
        "selectedForPublishing": row[9],
        "selectedForModeration": row[10],
        "aiActionMode": row[11],
        "autoSendConfidenceThreshold": row[12],
        "providerUserId": row[13],
        "encryptedAccessToken": row[14],
    }


@router.post("/connect")
async def connect_page(request: ConnectPageRequest, db: AsyncSession = Depends(get_db), _auth: None = Depends(_verify_internal_token)):
    page = await _load_page(db, request.page_id)
    if page["status"] != "active":
        raise HTTPException(status_code=409, detail="Page is not active")
    encrypted_page_token = page["encryptedPageAccessToken"]
    if not encrypted_page_token:
        raise HTTPException(status_code=409, detail="Page access token is missing")

    token = decrypt_smartspecweb(encrypted_page_token)
    client = MetaGraphClient(token, page_id=str(page["providerPageId"]))
    subscribed_fields = request.subscribed_fields or ["messages", "feed", "comments"]
    result = await client.subscribe_webhooks(subscribed_fields)

    await db.execute(
        text(
            """
            INSERT INTO social_webhook_subscriptions ("pageId", "subscriptionStatus", "subscribedFields", "lastVerifiedAt", "createdAt", "updatedAt")
            VALUES (:page_id, 'active', :subscribed_fields, NOW(), NOW(), NOW())
            ON CONFLICT DO NOTHING
            """
        ),
        {"page_id": request.page_id, "subscribed_fields": subscribed_fields},
    )
    await db.execute(
        text(
            """
            UPDATE social_pages
            SET status = 'active', "updatedAt" = NOW()
            WHERE id = :page_id
            """
        ),
        {"page_id": request.page_id},
    )
    await db.commit()
    return {"status": "connected", "result": result, "page_id": request.page_id}


@router.post("/disconnect")
async def disconnect_page(request: DisconnectPageRequest, db: AsyncSession = Depends(get_db), _auth: None = Depends(_verify_internal_token)):
    page = await _load_page(db, request.page_id)
    encrypted_page_token = page["encryptedPageAccessToken"]
    if encrypted_page_token:
        try:
            token = decrypt_smartspecweb(encrypted_page_token)
            client = MetaGraphClient(token, page_id=str(page["providerPageId"]))
            await client.unsubscribe_webhooks()
        except Exception:
            # Best effort only — disconnect should still proceed
            pass

    await db.execute(
        text(
            """
            UPDATE social_pages
            SET status = 'disconnected',
                "encryptedPageAccessToken" = NULL,
                "tokenExpiresAt" = NULL,
                "selectedForInbox" = false,
                "selectedForPublishing" = false,
                "selectedForModeration" = false,
                "updatedAt" = NOW()
            WHERE id = :page_id
            """
        ),
        {"page_id": request.page_id},
    )
    await db.execute(
        text("DELETE FROM social_webhook_subscriptions WHERE \"pageId\" = :page_id"),
        {"page_id": request.page_id},
    )
    await db.commit()
    return {"status": "disconnected", "page_id": request.page_id}
