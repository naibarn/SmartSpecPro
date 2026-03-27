"""Celery task for publishing scheduled social posts."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.database import get_db_context
from app.core.smartspecweb_crypto import decrypt_smartspecweb
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TikTokApiError, TokenExpiredError, YouTubeApiError
from app.services.social.publish_service import publish_social_content

logger = structlog.get_logger(__name__)

MAX_POSTS_PER_RUN = 100


def _extract_provider_post_id(payload: Any) -> str | None:
    if not payload or not isinstance(payload, dict):
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


async def _load_due_posts(db, now: datetime) -> list[tuple[Any, ...]]:
    result = await db.execute(
        text(
            """
            SELECT sp.id,
                   sp."tenantId",
                   sp."pageId",
                   sp."status",
                   sp."contentText",
                   sp."contentLink",
                   sp."mediaRefs",
                   sp.metadata,
                   sp."scheduledAt",
                   sp."createdAt",
                   sp."updatedAt",
                   sp."providerPostId",
                   sps.status AS page_status,
                   sps."providerPageId",
                   sps."encryptedPageAccessToken",
                   sps."tokenExpiresAt",
                   pc.provider,
                   pc."encryptedAccessToken",
                   pc."encryptedRefreshToken",
                   pc."tokenExpiresAt" AS connection_token_expires_at
            FROM social_posts sp
            JOIN social_pages sps ON sps.id = sp."pageId"
            JOIN social_provider_connections pc ON pc.id = sps."connectionId"
            WHERE sp.status = 'scheduled'
              AND sp."scheduledAt" <= :now
            ORDER BY sp."scheduledAt" ASC, sp.id ASC
            LIMIT :limit
            """
        ),
        {"now": now, "limit": MAX_POSTS_PER_RUN},
    )
    return list(result.fetchall())


async def _update_post_status(
    db,
    post_id: int,
    status: str,
    *,
    provider_post_id: str | None = None,
    error_message: str | None = None,
) -> None:
    await db.execute(
        text(
            """
            UPDATE social_posts
            SET status = :status,
                "providerPostId" = COALESCE(:provider_post_id, "providerPostId"),
                "publishedAt" = CASE WHEN :status = 'published' THEN :published_at ELSE "publishedAt" END,
                "errorMessage" = :error_message,
                "updatedAt" = :updated_at
            WHERE id = :post_id
            """
        ),
        {
            "post_id": post_id,
            "status": status,
            "provider_post_id": provider_post_id,
            "published_at": datetime.now(timezone.utc),
            "error_message": error_message,
            "updated_at": datetime.now(timezone.utc),
        },
    )


async def _publish_single_post(db, row: tuple[Any, ...]) -> str:
    (
        post_id,
        tenant_id,
        page_id,
        _status,
        content_text,
        content_link,
        media_refs,
        metadata,
        scheduled_at,
        _created_at,
        _updated_at,
        _provider_post_id,
        page_status,
        provider_page_id,
        encrypted_page_access_token,
        token_expires_at,
        provider,
        encrypted_access_token,
        encrypted_refresh_token,
        connection_token_expires_at,
    ) = row

    provider_id = str(provider or "").strip().lower()

    if page_status != "active":
        logger.info(
            "social_publish_skipped_inactive_page",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
            page_status=page_status,
        )
        return "skipped"

    if provider_id == "tiktok":
        await _update_post_status(db, post_id, "failed", error_message="TikTok scheduled publishing is not supported")
        return "failed"

    if provider_id == "meta" and not encrypted_page_access_token:
        logger.info(
            "social_publish_skipped_missing_token",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
        )
        return "skipped"

    token_expiry = token_expires_at if provider_id == "meta" else connection_token_expires_at
    if token_expiry and token_expiry <= datetime.now(timezone.utc):
        logger.info(
            "social_publish_skipped_expired_token",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
        )
        return "skipped"

    message = (content_text or "").strip()
    media_urls = [str(item).strip() for item in (media_refs or []) if isinstance(item, str) and str(item).strip()]
    if provider_id == "meta" and not message:
        await _update_post_status(db, post_id, "failed", error_message="Post content is empty")
        return "failed"
    if provider_id != "meta" and not media_urls:
        await _update_post_status(db, post_id, "failed", error_message=f"{provider_id.title()} post is missing media URLs")
        return "failed"

    try:
        if provider_id == "meta":
            access_token = decrypt_smartspecweb(encrypted_page_access_token)
        else:
            access_token = decrypt_smartspecweb(encrypted_access_token)
    except Exception as exc:
        await _update_post_status(db, post_id, "failed", error_message=f"Failed to decrypt token: {exc}")
        return "failed"

    try:
        result = await publish_social_content(
            provider=provider_id,
            access_token=access_token,
            page_id=str(provider_page_id),
            message=message if provider_id == "meta" else message or None,
            link=content_link,
            media_urls=media_urls if media_urls else None,
            title=message or None,
            description=message or None,
            video_metadata=(metadata.get("videoMetadata") if isinstance(metadata, dict) else None) or None,
        )
        provider_post_id = _extract_provider_post_id(result)
        await _update_post_status(db, post_id, "published", provider_post_id=provider_post_id, error_message=None)
        logger.info(
            "social_publish_succeeded",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
            provider=provider_id,
            provider_post_id=provider_post_id,
        )
        return "published"
    except (TokenExpiredError, PermissionDeniedError, RateLimitExceededError, MetaApiError, TikTokApiError, YouTubeApiError) as exc:
        await _update_post_status(db, post_id, "failed", error_message=str(exc))
        logger.warning(
            "social_publish_failed",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
            provider=provider_id,
            error=str(exc),
        )
        return "failed"
    except Exception as exc:
        await _update_post_status(db, post_id, "failed", error_message=str(exc))
        logger.warning(
            "social_publish_failed",
            post_id=post_id,
            page_id=page_id,
            tenant_id=tenant_id,
            provider=provider_id,
            error=str(exc),
        )
        return "failed"


async def publish_scheduled_posts_async() -> dict[str, int]:
    now = datetime.now(timezone.utc)
    processed = 0
    published = 0
    failed = 0
    skipped = 0

    async with get_db_context() as db:
        rows = await _load_due_posts(db, now)
        for row in rows:
            processed += 1
            outcome = await _publish_single_post(db, row)
            if outcome == "published":
                published += 1
            elif outcome == "failed":
                failed += 1
            else:
                skipped += 1
        await db.commit()

    return {
        "processed": processed,
        "published": published,
        "failed": failed,
        "skipped": skipped,
    }


@celery_app.task(
    name="app.tasks.social_publish_task.publish_scheduled_posts",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def publish_scheduled_posts(self):
    try:
        return asyncio.run(publish_scheduled_posts_async())
    except Exception as exc:
        logger.exception("publish_scheduled_posts task failed, will retry")
        raise self.retry(exc=exc)
