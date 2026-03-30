"""Meta publishing executor."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.core.smartspecweb_crypto import decrypt_smartspecweb
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError
from app.services.social.meta_graph_client import MetaGraphClient

logger = structlog.get_logger(__name__)


def _extract_provider_post_id(payload: Any) -> str | None:
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


def _parse_scheduled_at(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        text_value = value.strip()
        if not text_value:
            return None
        try:
            return int(float(text_value))
        except ValueError:
            try:
                dt = datetime.fromisoformat(text_value.replace("Z", "+00:00"))
            except ValueError:
                return None
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return int(dt.timestamp())
    return None


class PublishPostExecutor:
    """Publish or schedule a Meta post."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        page_id_value = data.inputs.get("pageId") or data.config.get("pageId")
        content_text = data.inputs.get("contentText") or data.config.get("contentText") or ""
        content_link = data.inputs.get("contentLink") or data.config.get("contentLink")
        scheduled_at_value = data.inputs.get("scheduledAt") or data.config.get("scheduledAt")

        if not page_id_value:
            raise ValueError("pageId is required")
        if not isinstance(content_text, str):
            content_text = str(content_text)
        if not content_text.strip():
            raise ValueError("contentText is required")

        page_id = int(page_id_value)
        scheduled_at = _parse_scheduled_at(scheduled_at_value)

        async with AsyncSessionLocal() as db:
            page_result = await db.execute(
                text(
                    """
                    SELECT id, "tenantId", "providerPageId", status,
                           "encryptedPageAccessToken", "tokenExpiresAt"
                    FROM social_pages
                    WHERE id = :page_id
                    LIMIT 1
                    """
                ),
                {"page_id": page_id},
            )
            row = page_result.fetchone()
            if not row:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": "Page not found"}
            if row[3] != "active":
                return {"postId": None, "providerPostId": None, "status": "failed", "error": "Page is not active"}
            if not row[4]:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": "Page access token is missing"}
            if row[5] and row[5] <= datetime.now(timezone.utc):
                return {"postId": None, "providerPostId": None, "status": "failed", "error": "Page access token has expired"}

            try:
                page_token = decrypt_smartspecweb(row[4])
                client = MetaGraphClient(page_token, page_id=str(row[2]))
                result = await client.create_post(content_text, str(content_link) if content_link else None, scheduled_at=scheduled_at)
            except TokenExpiredError as exc:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": str(exc)}
            except PermissionDeniedError as exc:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": str(exc)}
            except RateLimitExceededError as exc:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": str(exc)}
            except MetaApiError as exc:
                return {"postId": None, "providerPostId": None, "status": "failed", "error": str(exc)}

            provider_post_id = _extract_provider_post_id(result)
            now = datetime.now(timezone.utc)
            status = "scheduled" if scheduled_at is not None else "published"
            inserted = await db.execute(
                text(
                    """
                    INSERT INTO social_posts (
                      "tenantId", "pageId", "providerPostId", status,
                      "contentText", "contentLink", "scheduledAt", "publishedAt",
                      "createdByUserId", "metadata", "createdAt", "updatedAt"
                    ) VALUES (
                      :tenant_id, :page_id, :provider_post_id, :status,
                      :content_text, :content_link, :scheduled_at, :published_at,
                      :created_by_user_id, :metadata, :created_at, :updated_at
                    )
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": row[1],
                    "page_id": page_id,
                    "provider_post_id": provider_post_id,
                    "status": status,
                    "content_text": content_text,
                    "content_link": content_link,
                    "scheduled_at": datetime.fromtimestamp(scheduled_at, tz=timezone.utc) if scheduled_at is not None else None,
                    "published_at": None if scheduled_at is not None else now,
                    "created_by_user_id": context.user_id or None,
                    "metadata": result,
                    "created_at": now,
                    "updated_at": now,
                },
            )
            row_inserted = inserted.fetchone()
            await db.commit()

        post_id = int(row_inserted[0]) if row_inserted else None
        logger.info(
            "social_post_published",
            node_id=data.node_id,
            page_id=page_id,
            provider_post_id=provider_post_id,
            status=status,
        )

        return {
            "postId": post_id,
            "providerPostId": provider_post_id,
            "status": status,
            "error": None,
        }
