"""Meta Pages OAuth flow and connection management."""

from __future__ import annotations

import json
import os
import secrets
from datetime import datetime, timezone, timedelta
from typing import Optional
from urllib.parse import quote

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.smartspecweb_crypto import encrypt_smartspecweb

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/oauth/meta", tags=["meta-oauth"])


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


class MetaOAuthCallbackRequest(BaseModel):
    code: str = Field(min_length=1)
    state: str = Field(min_length=1)


class MetaOAuthStatusRequest(BaseModel):
    tenant_id: str
    user_id: int


def _meta_defaults() -> dict[str, str]:
    return {
        "metaAppId": os.getenv("META_APP_ID", ""),
        "metaAppSecret": os.getenv("META_APP_SECRET", ""),
        "metaRedirectUri": os.getenv("META_REDIRECT_URI", "http://localhost:3000/auth/callback/meta"),
        "metaGraphApiVersion": os.getenv("META_GRAPH_API_VERSION", "v25.0"),
    }


async def _load_meta_config(db: AsyncSession) -> dict[str, str]:
    config = _meta_defaults()
    try:
        result = await db.execute(text('SELECT key, value, "isSensitive" FROM system_settings WHERE category = :category'), {"category": "oauth"})
        for key, value, is_sensitive in result.fetchall():
            if not value:
                continue
            if key in config:
                config[key] = str(value)
    except Exception as exc:
        logger.warning("meta_oauth_config_load_failed", error=str(exc))
    return config


async def _resolve_meta_config(db: AsyncSession) -> dict[str, str]:
    cfg = await _load_meta_config(db)
    if not cfg.get("metaAppId") or not cfg.get("metaAppSecret"):
        raise HTTPException(status_code=503, detail="Meta OAuth is not configured")
    return cfg


def _build_auth_url(cfg: dict[str, str], state: str) -> str:
    scopes = [
        "pages_show_list",
        "pages_manage_metadata",
        "pages_messaging",
        "pages_read_engagement",
        "pages_manage_posts",
        "pages_manage_comments",
        "business_management",
    ]
    base = f"https://www.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/dialog/oauth"
    return (
        f"{base}"
        f"?client_id={quote(cfg['metaAppId'], safe='')}"
        f"&redirect_uri={quote(cfg['metaRedirectUri'], safe='')}"
        f"&response_type=code"
        f"&scope={quote(','.join(scopes), safe='')}"
        f"&state={quote(state, safe='')}"
    )


@router.get("/authorize")
async def authorize(
    tenant_id: str = Query(..., min_length=1),
    user_id: int = Query(..., ge=1),
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(_verify_internal_token),
):
    cfg = await _resolve_meta_config(db)
    state = secrets.token_urlsafe(32)
    payload = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "redirect_uri": cfg["metaRedirectUri"],
    }
    await redis.set(f"meta:oauth:state:{state}", json.dumps(payload), ex=600)
    return {
        "authorization_url": _build_auth_url(cfg, state),
        "state": state,
        "expires_in": 600,
    }


async def _exchange_code_for_token(
    cfg: dict[str, str],
    code: str,
) -> dict[str, str]:
    token_url = f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/oauth/access_token"
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            token_url,
            params={
                "client_id": cfg["metaAppId"],
                "client_secret": cfg["metaAppSecret"],
                "redirect_uri": cfg["metaRedirectUri"],
                "code": code,
            },
        )
        response.raise_for_status()
        short = response.json()
        short_token = str(short.get("access_token") or "")
        if not short_token:
            raise HTTPException(status_code=502, detail="Meta token exchange failed")
        response = await client.get(
            token_url,
            params={
                "grant_type": "fb_exchange_token",
                "client_id": cfg["metaAppId"],
                "client_secret": cfg["metaAppSecret"],
                "fb_exchange_token": short_token,
            },
        )
        response.raise_for_status()
        long_lived = response.json()
        token = str(long_lived.get("access_token") or short_token)
        expires_in = int(long_lived.get("expires_in") or short.get("expires_in") or 0)
        return {"access_token": token, "expires_in": str(expires_in)}


async def _fetch_meta_profile(cfg: dict[str, str], access_token: str) -> dict[str, str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/me",
            params={"fields": "id,name", "access_token": access_token},
        )
        response.raise_for_status()
        data = response.json()
        return {
            "id": str(data.get("id") or ""),
            "name": str(data.get("name") or ""),
        }


async def _fetch_meta_pages(cfg: dict[str, str], access_token: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/me/accounts",
            params={"fields": "id,name,category,access_token,tasks", "access_token": access_token},
        )
        response.raise_for_status()
        payload = response.json()
        return [item for item in payload.get("data", []) if isinstance(item, dict)]


@router.post("/callback")
async def callback(
    request: MetaOAuthCallbackRequest,
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    key = f"meta:oauth:state:{request.state}"
    raw_state = await redis.get(key)
    if not raw_state:
        raise HTTPException(status_code=403, detail="Invalid or expired OAuth state")
    await redis.delete(key)

    try:
        state_data = json.loads(raw_state)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid OAuth state payload")

    cfg = await _resolve_meta_config(db)
    token_data = await _exchange_code_for_token(cfg, request.code)
    access_token = token_data["access_token"]
    expires_in = int(token_data.get("expires_in") or 0)
    profile = await _fetch_meta_profile(cfg, access_token)
    pages = await _fetch_meta_pages(cfg, access_token)

    encrypted_token = encrypt_smartspecweb(access_token)
    tenant_id = str(state_data.get("tenant_id") or "").strip()
    user_id = int(state_data.get("user_id") or 0)
    if not tenant_id or not user_id:
        raise HTTPException(status_code=400, detail="Missing OAuth state context")

    existing = await db.execute(
        text(
            """
            SELECT id FROM social_provider_connections
            WHERE "tenantId" = :tenant_id AND "userId" = :user_id AND provider = 'meta'
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id},
    )
    row = existing.fetchone()
    if row:
        connection_id = int(row[0])
        token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None
        await db.execute(
            text(
                """
                UPDATE social_provider_connections
                SET "providerUserId" = :provider_user_id,
                    status = 'active',
                    "grantedScopes" = :granted_scopes,
                    "encryptedAccessToken" = :encrypted_access_token,
                    "tokenExpiresAt" = :token_expires_at,
                    metadata = :metadata,
                    "updatedAt" = NOW()
                WHERE id = :id
                """
            ),
            {
                "provider_user_id": profile["id"],
                "granted_scopes": ["pages_show_list", "pages_manage_metadata", "pages_messaging", "pages_read_engagement", "pages_manage_posts", "pages_manage_comments", "business_management"],
                "encrypted_access_token": encrypted_token,
                "token_expires_at": token_expires_at,
                "metadata": {"metaProfile": profile, "oauthStateTenantId": tenant_id},
                "id": connection_id,
            },
        )
    else:
        token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in) if expires_in else None
        inserted = await db.execute(
            text(
                """
                INSERT INTO social_provider_connections (
                  "tenantId", "userId", provider, "providerUserId", status, "grantedScopes",
                  "encryptedAccessToken", "tokenExpiresAt", metadata, "createdAt", "updatedAt"
                ) VALUES (
                  :tenant_id, :user_id, 'meta', :provider_user_id, 'active', :granted_scopes,
                  :encrypted_access_token, :token_expires_at, :metadata, NOW(), NOW()
                )
                RETURNING id
                """
            ),
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "provider_user_id": profile["id"],
                "granted_scopes": ["pages_show_list", "pages_manage_metadata", "pages_messaging", "pages_read_engagement", "pages_manage_posts", "pages_manage_comments", "business_management"],
                "encrypted_access_token": encrypted_token,
                "token_expires_at": token_expires_at,
                "metadata": {"metaProfile": profile, "oauthStateTenantId": tenant_id},
            },
        )
        connection_id = int(inserted.scalar_one())

    page_results: list[dict[str, object]] = []
    for page in pages:
        page_id = str(page.get("id") or "")
        if not page_id:
            continue
        encrypted_page_token = encrypt_smartspecweb(str(page.get("access_token") or ""))
        page_name = str(page.get("name") or "")
        page_category = str(page.get("category") or "")

        existing_page = await db.execute(
            text(
                """
                SELECT id FROM social_pages
                WHERE "tenantId" = :tenant_id AND "providerPageId" = :provider_page_id
                ORDER BY id DESC
                LIMIT 1
                """
            ),
            {"tenant_id": tenant_id, "provider_page_id": page_id},
        )
        page_row = existing_page.fetchone()
        if page_row:
            social_page_id = int(page_row[0])
            await db.execute(
                text(
                    """
                    UPDATE social_pages
                    SET "connectionId" = :connection_id,
                        "pageName" = :page_name,
                        "pageCategory" = :page_category,
                        status = 'active',
                        "encryptedPageAccessToken" = :encrypted_page_token,
                        "tokenExpiresAt" = NULL,
                        "updatedAt" = NOW()
                    WHERE id = :id
                    """
                ),
                {
                    "connection_id": connection_id,
                    "page_name": page_name,
                    "page_category": page_category,
                    "encrypted_page_token": encrypted_page_token,
                    "id": social_page_id,
                },
            )
        else:
            inserted_page = await db.execute(
                text(
                    """
                    INSERT INTO social_pages (
                      "tenantId", "connectionId", "providerPageId", "pageName", "pageCategory",
                      status, "encryptedPageAccessToken", "selectedForInbox",
                      "selectedForPublishing", "selectedForModeration",
                      "aiActionMode", "autoSendConfidenceThreshold", metadata, "createdAt", "updatedAt"
                    ) VALUES (
                      :tenant_id, :connection_id, :provider_page_id, :page_name, :page_category,
                      'active', :encrypted_page_token, true, true, false,
                      'draft_only', 0.95, :metadata, NOW(), NOW()
                    )
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "connection_id": connection_id,
                    "provider_page_id": page_id,
                    "page_name": page_name,
                    "page_category": page_category,
                    "encrypted_page_token": encrypted_page_token,
                    "metadata": {"providerPage": page},
                },
            )
            social_page_id = int(inserted_page.scalar_one())

        page_results.append(
            {
                "pageId": social_page_id,
                "providerPageId": page_id,
                "pageName": page_name,
                "pageCategory": page_category,
                "status": "active",
            }
        )

    await db.commit()

    return {
        "status": "connected",
        "connection": {
            "provider": "meta",
            "providerUserId": profile["id"],
        },
        "pages": page_results,
    }


@router.get("/status")
async def status(
    tenant_id: str = Query(..., min_length=1),
    user_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(_verify_internal_token),
):
    conn = await db.execute(
        text(
            """
            SELECT id, "providerUserId", status, "encryptedAccessToken", "tokenExpiresAt"
            FROM social_provider_connections
            WHERE "tenantId" = :tenant_id AND "userId" = :user_id AND provider = 'meta'
            ORDER BY id DESC
            LIMIT 1
            """
        ),
        {"tenant_id": tenant_id, "user_id": user_id},
    )
    row = conn.fetchone()
    if not row:
        return {"status": "not_connected"}

    pages = await db.execute(
        text(
            """
            SELECT id, "providerPageId", "pageName", "pageCategory", status, "selectedForInbox", "selectedForPublishing", "selectedForModeration", "aiActionMode", "autoSendConfidenceThreshold", "tokenExpiresAt"
            FROM social_pages
            WHERE "connectionId" = :connection_id
            ORDER BY "createdAt" DESC, id DESC
            """
        ),
        {"connection_id": row[0]},
    )
    page_rows = pages.fetchall()
    return {
        "status": "connected",
        "connection": {
            "id": int(row[0]),
            "providerUserId": row[1],
            "connectionStatus": row[2],
            "tokenMasked": "***",
            "tokenExpiresAt": row[4].isoformat() if row[4] else None,
            "pages": [
                {
                    "pageId": int(p[0]),
                    "providerPageId": p[1],
                    "pageName": p[2],
                    "pageCategory": p[3],
                    "status": p[4],
                    "selectedForInbox": bool(p[5]),
                    "selectedForPublishing": bool(p[6]),
                    "selectedForModeration": bool(p[7]),
                    "aiActionMode": p[8],
                    "autoSendConfidenceThreshold": float(p[9] or 0.95),
                    "tokenExpiresAt": p[10].isoformat() if p[10] else None,
                }
                for p in page_rows
            ],
        },
    }
