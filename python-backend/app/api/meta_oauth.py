"""Meta Pages OAuth flow and connection management."""

from __future__ import annotations

import os
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import quote

import httpx
import structlog
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import JSON, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.smartspecweb_crypto import decrypt_smartspecweb, encrypt_smartspecweb
from app.core.system_settings_loader import get_category_settings
from app.services.postgres_ephemeral_store import put_value, take_value

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/oauth/meta", tags=["meta-oauth"])

META_OAUTH_SCOPES = [
    "pages_show_list",
    "pages_manage_metadata",
    "pages_read_engagement",
    "pages_manage_posts",
    "pages_manage_engagement",
]
META_REELS_REQUIRED_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement"]


async def _verify_internal_token(
    x_internal_token: str | None = Header(None),
    x_proxy_token: str | None = Header(None),
) -> None:
    expected = getattr(settings, "SMARTSPEC_WEB_GATEWAY_TOKEN", None) or getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
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
        loaded = await get_category_settings("oauth", db)
        for key in config:
            if loaded.get(key):
                config[key] = loaded[key]
    except Exception as exc:
        logger.warning("meta_oauth_config_load_failed", error=str(exc))
    return config


async def _resolve_meta_config(db: AsyncSession) -> dict[str, str]:
    cfg = await _load_meta_config(db)
    if not cfg.get("metaAppId") or not cfg.get("metaAppSecret"):
        raise HTTPException(status_code=503, detail="Meta OAuth is not configured")
    if not cfg.get("metaRedirectUri", "").startswith("https://"):
        raise HTTPException(status_code=503, detail="Meta OAuth callback must use HTTPS")
    if not cfg.get("metaGraphApiVersion", "").startswith("v"):
        raise HTTPException(status_code=503, detail="Meta Graph API version is not configured")
    return cfg


def _build_auth_url(cfg: dict[str, str], state: str) -> str:
    base = f"https://www.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/dialog/oauth"
    return (
        f"{base}"
        f"?client_id={quote(cfg['metaAppId'], safe='')}"
        f"&redirect_uri={quote(cfg['metaRedirectUri'], safe='')}"
        f"&response_type=code"
        f"&scope={quote(','.join(META_OAUTH_SCOPES), safe='')}"
        f"&state={quote(state, safe='')}"
    )


@router.get("/authorize")
async def authorize(
    tenant_id: str = Query(..., min_length=1),
    user_id: int = Query(..., ge=1),
    db: AsyncSession = Depends(get_db),
    _auth: None = Depends(_verify_internal_token),
):
    cfg = await _resolve_meta_config(db)
    state = secrets.token_urlsafe(32)
    payload = {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "created_at": datetime.now(UTC).isoformat(),
        "redirect_uri": cfg["metaRedirectUri"],
    }
    await put_value("meta_oauth_state", state, payload, 600)
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


async def _fetch_meta_permissions(cfg: dict[str, str], access_token: str) -> list[str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/me/permissions",
            params={"access_token": access_token},
        )
        response.raise_for_status()
        payload = response.json()
        return sorted({
            str(item.get("permission"))
            for item in payload.get("data", [])
            if isinstance(item, dict) and item.get("status") == "granted" and item.get("permission")
        })


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
    db: AsyncSession = Depends(get_db),
):
    state_data = await take_value("meta_oauth_state", request.state)
    if not isinstance(state_data, dict):
        raise HTTPException(status_code=403, detail="Invalid or expired OAuth state")

    cfg = await _resolve_meta_config(db)
    token_data = await _exchange_code_for_token(cfg, request.code)
    access_token = token_data["access_token"]
    expires_in = int(token_data.get("expires_in") or 0)
    profile = await _fetch_meta_profile(cfg, access_token)
    granted_scopes = await _fetch_meta_permissions(cfg, access_token)
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
        token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None
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
            ).bindparams(
                bindparam("granted_scopes", type_=JSON),
                bindparam("metadata", type_=JSON),
            ),
            {
                "provider_user_id": profile["id"],
                "granted_scopes": granted_scopes,
                "encrypted_access_token": encrypted_token,
                "token_expires_at": token_expires_at,
                "metadata": {
                    "metaProfile": profile,
                    "oauthStateTenantId": tenant_id,
                    "permissionVerificationStatus": "verified",
                    "permissionsVerifiedAt": datetime.now(UTC).isoformat(),
                },
                "id": connection_id,
            },
        )
    else:
        token_expires_at = datetime.now(UTC) + timedelta(seconds=expires_in) if expires_in else None
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
            ).bindparams(
                bindparam("granted_scopes", type_=JSON),
                bindparam("metadata", type_=JSON),
            ),
            {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "provider_user_id": profile["id"],
                "granted_scopes": granted_scopes,
                "encrypted_access_token": encrypted_token,
                "token_expires_at": token_expires_at,
                "metadata": {
                    "metaProfile": profile,
                    "oauthStateTenantId": tenant_id,
                    "permissionVerificationStatus": "verified",
                    "permissionsVerifiedAt": datetime.now(UTC).isoformat(),
                },
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
        page_tasks = sorted({str(task) for task in page.get("tasks", []) if isinstance(task, str)})
        page_can_create_content = "CREATE_CONTENT" in page_tasks
        page_metadata = {
            "providerPage": {"id": page_id, "tasks": page_tasks},
            "permissionsVerifiedAt": datetime.now(UTC).isoformat(),
            "canCreateContent": page_can_create_content,
        }

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
                        metadata = :metadata,
                        "updatedAt" = NOW()
                    WHERE id = :id
                    """
                ).bindparams(bindparam("metadata", type_=JSON)),
                {
                    "connection_id": connection_id,
                    "page_name": page_name,
                    "page_category": page_category,
                    "encrypted_page_token": encrypted_page_token,
                    "metadata": page_metadata,
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
                      'active', :encrypted_page_token, true, :selected_for_publishing, false,
                      'draft_only', 0.95, :metadata, NOW(), NOW()
                    )
                    RETURNING id
                    """
                ).bindparams(bindparam("metadata", type_=JSON)),
                {
                    "tenant_id": tenant_id,
                    "connection_id": connection_id,
                    "provider_page_id": page_id,
                    "page_name": page_name,
                    "page_category": page_category,
                    "encrypted_page_token": encrypted_page_token,
                    "selected_for_publishing": page_can_create_content,
                    "metadata": page_metadata,
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
                "canCreateContent": page_can_create_content,
                "missingRequiredScopes": [scope for scope in META_REELS_REQUIRED_SCOPES if scope not in granted_scopes],
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
            SELECT id, "providerUserId", status, "encryptedAccessToken", "tokenExpiresAt", "grantedScopes"
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
        config = await _load_meta_config(db)
        return {
            "status": "not_connected",
            "configuration": {
                "appIdConfigured": bool(config.get("metaAppId")),
                "appSecretConfigured": bool(config.get("metaAppSecret")),
                "callbackConfigured": bool(config.get("metaRedirectUri", "").startswith("https://")),
                "graphApiVersion": config.get("metaGraphApiVersion"),
            },
        }

    pages = await db.execute(
        text(
            """
            SELECT id, "providerPageId", "pageName", "pageCategory", status, "selectedForInbox", "selectedForPublishing", "selectedForModeration", "aiActionMode", "autoSendConfidenceThreshold", "tokenExpiresAt", metadata, "encryptedPageAccessToken"
            FROM social_pages
            WHERE "connectionId" = :connection_id
            ORDER BY "createdAt" DESC, id DESC
            """
        ),
        {"connection_id": row[0]},
    )
    page_rows = pages.fetchall()
    token_validity = "unknown"
    try:
        access_token = decrypt_smartspecweb(str(row[3] or ""))
        cfg = await _load_meta_config(db)
        if access_token:
            async with httpx.AsyncClient(timeout=8.0) as client:
                check = await client.get(
                    f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/me",
                    params={"fields": "id", "access_token": access_token},
                )
            token_validity = "valid" if check.is_success else "invalid"
    except Exception:
        token_validity = "unknown"
        cfg = await _load_meta_config(db)
    granted_scopes = list(row[5] or [])
    page_summaries: list[dict[str, object]] = []
    for page_row in page_rows:
        page_metadata = page_row[11] if isinstance(page_row[11], dict) else {}
        page_token_validity = "unknown"
        try:
            page_token = decrypt_smartspecweb(str(page_row[12] or ""))
            if page_token:
                async with httpx.AsyncClient(timeout=8.0) as client:
                    page_check = await client.get(
                        f"https://graph.facebook.com/{cfg['metaGraphApiVersion'].strip('/')}/{page_row[1]}",
                        params={"fields": "id", "access_token": page_token},
                    )
                page_token_validity = "valid" if page_check.is_success else "invalid"
        except Exception:
            page_token_validity = "unknown"
        page_summaries.append({
            "pageId": int(page_row[0]),
            "providerPageId": page_row[1],
            "pageName": page_row[2],
            "pageCategory": page_row[3],
            "status": page_row[4],
            "selectedForInbox": bool(page_row[5]),
            "selectedForPublishing": bool(page_row[6]),
            "selectedForModeration": bool(page_row[7]),
            "aiActionMode": page_row[8],
            "autoSendConfidenceThreshold": float(page_row[9] or 0.95),
            "tokenExpiresAt": page_row[10].isoformat() if page_row[10] else None,
            "pageTasks": page_metadata.get("providerPage", {}).get("tasks", []),
            "canCreateContent": bool(page_metadata.get("canCreateContent")),
            "pagePermissionsVerified": bool(page_metadata.get("permissionsVerifiedAt")),
            "pageTokenValidity": page_token_validity,
        })
    return {
        "status": "connected",
        "connection": {
            "id": int(row[0]),
            "providerUserId": row[1],
            "connectionStatus": row[2],
            "tokenMasked": "***",
            "tokenExpiresAt": row[4].isoformat() if row[4] else None,
            "tokenValidity": token_validity,
            "grantedScopes": granted_scopes,
            "requiredReelsScopes": META_REELS_REQUIRED_SCOPES,
            "missingReelsScopes": [scope for scope in META_REELS_REQUIRED_SCOPES if scope not in granted_scopes],
            "configuration": {
                "appIdConfigured": bool(cfg.get("metaAppId")),
                "appSecretConfigured": bool(cfg.get("metaAppSecret")),
                "callbackConfigured": bool(cfg.get("metaRedirectUri", "").startswith("https://")),
                "graphApiVersion": cfg.get("metaGraphApiVersion"),
            },
            "pages": page_summaries,
        },
    }
