"""Outbound Meta reply executor."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import text

from app.core.database import AsyncSessionLocal
from app.core.smartspecweb_crypto import decrypt_smartspecweb
from app.core.redis_client import get_cache_redis
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.social.exceptions import MetaApiError, PermissionDeniedError, RateLimitExceededError, TokenExpiredError
from app.services.social.meta_graph_client import MetaGraphClient

logger = structlog.get_logger(__name__)


def _extract_provider_message_id(payload: Any) -> str | None:
    if not isinstance(payload, dict):
        return None
    for key in ("provider_message_id", "providerMessageId", "message_id", "messageId", "id"):
        value = payload.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, int):
            return str(value)
    nested = payload.get("result")
    if isinstance(nested, dict):
        return _extract_provider_message_id(nested)
    return None


class SendReplyExecutor:
    """Send a Meta reply and persist the outbound message."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        page_id_value = data.inputs.get("pageId") or data.config.get("pageId")
        conversation_id = data.inputs.get("conversationId") or data.config.get("conversationId")
        message_body = data.inputs.get("messageBody") or data.config.get("messageBody") or ""

        if not page_id_value:
            raise ValueError("pageId is required")
        if conversation_id is None:
            raise ValueError("conversationId is required")
        if not isinstance(message_body, str):
            message_body = str(message_body)
        if not message_body.strip():
            raise ValueError("messageBody is required")

        page_id = int(page_id_value)
        conversation_id = int(conversation_id)

        async with AsyncSessionLocal() as db:
            page_result = await db.execute(
                text(
                    """
                    SELECT sp.id, sp."tenantId", sp."providerPageId", sp.status,
                           sp."encryptedPageAccessToken", sp."tokenExpiresAt",
                           c."customerExternalId"
                    FROM social_pages sp
                    JOIN social_conversations c ON c."pageId" = sp.id
                    WHERE sp.id = :page_id
                      AND c.id = :conversation_id
                    LIMIT 1
                    """
                ),
                {"page_id": page_id, "conversation_id": conversation_id},
            )
            row = page_result.fetchone()
            if not row:
                return {
                    "providerMessageId": None,
                    "deliveryStatus": "failed",
                    "error": "Conversation page not found",
                }

            encrypted_token = row[4]
            token_expires_at = row[5]
            recipient_external_id = row[6]

            if row[3] != "active":
                return {
                    "providerMessageId": None,
                    "deliveryStatus": "failed",
                    "error": "Page is not active",
                }
            if not encrypted_token:
                return {
                    "providerMessageId": None,
                    "deliveryStatus": "failed",
                    "error": "Page access token is missing",
                }
            if token_expires_at and token_expires_at <= datetime.now(timezone.utc):
                return {
                    "providerMessageId": None,
                    "deliveryStatus": "failed",
                    "error": "Page access token has expired",
                }

            try:
                page_token = decrypt_smartspecweb(encrypted_token)
                client = MetaGraphClient(page_token, page_id=str(row[2]))
                result = await client.send_message(str(recipient_external_id), message_body)
            except TokenExpiredError as exc:
                return {"providerMessageId": None, "deliveryStatus": "failed", "error": str(exc)}
            except PermissionDeniedError as exc:
                return {"providerMessageId": None, "deliveryStatus": "failed", "error": str(exc)}
            except RateLimitExceededError as exc:
                return {"providerMessageId": None, "deliveryStatus": "failed", "error": str(exc)}
            except MetaApiError as exc:
                return {"providerMessageId": None, "deliveryStatus": "failed", "error": str(exc)}

            provider_message_id = _extract_provider_message_id(result)
            now = datetime.now(timezone.utc)
            await db.execute(
                text(
                    """
                    INSERT INTO social_messages (
                      "tenantId", "conversationId", "pageId", "providerMessageId",
                      "direction", "senderType", "senderUserId", "messageType",
                      "body", "payload", "deliveryStatus", "sentAt", "createdAt"
                    ) VALUES (
                      :tenant_id, :conversation_id, :page_id, :provider_message_id,
                      'outbound', 'agent', :sender_user_id, 'text',
                      :body, :payload, 'sent', :sent_at, :created_at
                    )
                    RETURNING id
                    """
                ),
                {
                    "tenant_id": row[1],
                    "conversation_id": conversation_id,
                    "page_id": page_id,
                    "provider_message_id": provider_message_id,
                    "sender_user_id": context.user_id or None,
                    "body": message_body,
                    "payload": result,
                    "sent_at": now,
                    "created_at": now,
                },
            )
            await db.execute(
                text(
                    """
                    UPDATE social_conversations
                    SET "lastMessageAt" = :now,
                        "lastOutboundAt" = :now,
                        "unreadCount" = 0,
                        "updatedAt" = :now
                    WHERE id = :conversation_id
                    """
                ),
                {"conversation_id": conversation_id, "now": now},
            )
            await db.commit()

        try:
            redis = await get_cache_redis()
            if redis is not None:
                await redis.set(f"social:unread:{context.tenant_id}:{conversation_id}", "0")
        except Exception:
            logger.debug("social_reply_unread_reset_failed", conversation_id=conversation_id)

        logger.info(
            "social_reply_sent",
            node_id=data.node_id,
            conversation_id=conversation_id,
            provider_message_id=provider_message_id,
        )

        return {
            "providerMessageId": provider_message_id,
            "deliveryStatus": "sent",
            "error": None,
        }
