"""Normalize Meta webhook payloads into social conversation/message/comment rows."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

import structlog
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger(__name__)


def _epoch_to_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return datetime.now(timezone.utc)
    if numeric > 10_000_000_000:
        numeric /= 1000.0
    return datetime.fromtimestamp(numeric, tz=timezone.utc)


def _message_body(message: dict[str, Any]) -> str:
    message_payload = message.get("message")
    payload = message_payload if isinstance(message_payload, dict) else {}
    text_body = payload.get("text")
    if isinstance(text_body, str) and text_body.strip():
        return text_body

    attachments = payload.get("attachments")
    if attachments:
        return json.dumps(attachments, ensure_ascii=False)

    if payload:
        return json.dumps(payload, ensure_ascii=False)
    return ""


def _comment_body(change_value: dict[str, Any]) -> str:
    for key in ("message", "comment_message", "text", "body"):
        value = change_value.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


class WebhookNormalizer:
    """Transforms raw webhook entries into DB records."""

    def __init__(self, db: AsyncSession, redis: Redis | None = None) -> None:
        self.db = db
        self.redis = redis

    async def normalize_messaging_event(self, entry: dict[str, Any], page_id: int, tenant_id: str) -> dict[str, Any]:
        """Normalize one entry containing Messenger messaging events."""
        normalized: list[dict[str, Any]] = []
        messaging = entry.get("messaging") or []
        if not isinstance(messaging, list):
            return {"kind": "messaging", "messages": []}

        for index, message in enumerate(messaging):
            if not isinstance(message, dict):
                continue

            sender_value = message.get("sender")
            recipient_value = message.get("recipient")
            sender = sender_value if isinstance(sender_value, dict) else {}
            recipient = recipient_value if isinstance(recipient_value, dict) else {}
            sender_external_id = str(sender.get("id") or "")
            if not sender_external_id:
                continue

            message_value = message.get("message")
            message_payload = message_value if isinstance(message_value, dict) else {}
            conversation_value = message.get("conversation")
            thread_value = message.get("thread")
            conversation_id_value = conversation_value.get("id") if isinstance(conversation_value, dict) else None
            thread_id_value = thread_value.get("id") if isinstance(thread_value, dict) else None
            sender_name_value = sender.get("name")
            from_value = message.get("from")
            from_name_value = from_value.get("name") if isinstance(from_value, dict) else None
            provider_message_id = (
                message_payload.get("mid")
                or message.get("mid")
                or f"{entry.get('id', 'entry')}_{index}"
            )
            provider_conversation_id = (
                conversation_id_value
                or message.get("conversation_id")
                or thread_id_value
            )
            customer_display_name = (
                sender_name_value
                or from_name_value
            )
            timestamp = _epoch_to_datetime(message.get("timestamp") or entry.get("time") or message.get("created_time"))
            body = _message_body(message)

            conversation_result = await self.db.execute(
                text(
                    """
                    INSERT INTO social_conversations (
                      "tenantId", "pageId", "providerConversationId", "channelType",
                      "customerExternalId", "customerDisplayName", "status",
                      "unreadCount", "createdAt", "updatedAt"
                    ) VALUES (
                      :tenant_id, :page_id, :provider_conversation_id, :channel_type,
                      :customer_external_id, :customer_display_name, 'open',
                      0, NOW(), NOW()
                    )
                    ON CONFLICT ("pageId", "customerExternalId") DO UPDATE
                    SET "providerConversationId" = COALESCE(EXCLUDED."providerConversationId", social_conversations."providerConversationId"),
                        "customerDisplayName" = COALESCE(EXCLUDED."customerDisplayName", social_conversations."customerDisplayName"),
                        "updatedAt" = NOW()
                    RETURNING id, "unreadCount"
                    """
                ),
                {
                    "tenant_id": tenant_id,
                    "page_id": page_id,
                    "provider_conversation_id": provider_conversation_id,
                    "channel_type": "messenger",
                    "customer_external_id": sender_external_id,
                    "customer_display_name": customer_display_name,
                },
            )
            conversation_row = conversation_result.fetchone()
            if not conversation_row:
                raise RuntimeError("Failed to upsert social conversation")
            conversation_id = int(conversation_row[0])

            try:
                message_result = await self.db.execute(
                    text(
                        """
                        INSERT INTO social_messages (
                          "tenantId", "conversationId", "pageId", "providerMessageId",
                          "direction", "senderType", "senderExternalId",
                          "messageType", "body", "payload", "receivedAt", "createdAt"
                        ) VALUES (
                          :tenant_id, :conversation_id, :page_id, :provider_message_id,
                          'inbound', 'customer', :sender_external_id,
                          :message_type, :body, :payload, :received_at, NOW()
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "conversation_id": conversation_id,
                        "page_id": page_id,
                        "provider_message_id": provider_message_id,
                        "sender_external_id": sender_external_id,
                        "message_type": "text" if body else "event",
                        "body": body,
                        "payload": message,
                        "received_at": timestamp,
                    },
                )
                message_row = message_result.fetchone()
                if not message_row:
                    raise RuntimeError("Failed to insert social message")
                message_id = int(message_row[0])
            except IntegrityError as exc:
                await self.db.rollback()
                existing_message = await self.db.execute(
                    text(
                        """
                        SELECT id FROM social_messages
                        WHERE "providerMessageId" = :provider_message_id
                        LIMIT 1
                        """
                    ),
                    {"provider_message_id": provider_message_id},
                )
                duplicate_row = existing_message.fetchone()
                if duplicate_row:
                    logger.info(
                        "social_message_already_stored",
                        provider_message_id=provider_message_id,
                        conversation_id=conversation_id,
                    )
                    normalized.append(
                        {
                            "kind": "messaging",
                            "duplicate": True,
                            "conversation_id": conversation_id,
                            "message_id": int(duplicate_row[0]),
                            "provider_message_id": provider_message_id,
                        }
                    )
                    continue
                raise exc

            await self.db.execute(
                text(
                    """
                    UPDATE social_conversations
                    SET "lastMessageAt" = :last_message_at,
                        "lastInboundAt" = :last_inbound_at,
                        "unreadCount" = "unreadCount" + 1,
                        "updatedAt" = NOW()
                    WHERE id = :conversation_id
                    """
                ),
                {
                    "last_message_at": timestamp,
                    "last_inbound_at": timestamp,
                    "conversation_id": conversation_id,
                },
            )
            await self.db.commit()

            if self.redis is not None:
                try:
                    await self.redis.incr(f"social:unread:{tenant_id}:{conversation_id}")
                except Exception:
                    logger.warning("social_unread_counter_increment_failed", conversation_id=conversation_id)

            normalized.append(
                {
                    "kind": "messaging",
                    "conversation_id": conversation_id,
                    "message_id": message_id,
                    "provider_message_id": provider_message_id,
                    "provider_conversation_id": provider_conversation_id,
                    "sender_external_id": sender_external_id,
                    "body": body,
                    "timestamp": timestamp.isoformat(),
                }
            )

        return {"kind": "messaging", "messages": normalized}

    async def normalize_feed_event(self, entry: dict[str, Any], page_id: int, tenant_id: str) -> dict[str, Any]:
        """Normalize one entry containing page feed/comment events."""
        normalized: list[dict[str, Any]] = []
        changes = entry.get("changes") or []
        if not isinstance(changes, list):
            return {"kind": "feed", "comments": []}

        for index, change in enumerate(changes):
            if not isinstance(change, dict):
                continue
            value = change.get("value") or {}
            if not isinstance(value, dict):
                continue

            provider_comment_id = str(value.get("comment_id") or value.get("id") or f"{entry.get('id', 'entry')}_{index}")
            provider_object_id = str(value.get("post_id") or value.get("object_id") or value.get("parent_id") or "")
            author_external_id = (
                value.get("from", {}).get("id")
                if isinstance(value.get("from"), dict)
                else value.get("from_id")
            )
            author_display_name = (
                value.get("from", {}).get("name")
                if isinstance(value.get("from"), dict)
                else value.get("from_name")
            )
            body = _comment_body(value)
            timestamp = _epoch_to_datetime(value.get("created_time") or entry.get("time"))

            try:
                result = await self.db.execute(
                    text(
                        """
                        INSERT INTO social_comments (
                          "tenantId", "pageId", "providerCommentId", "providerObjectId",
                          "authorExternalId", "authorDisplayName", "body", "status",
                          "createdAt", "updatedAt"
                        ) VALUES (
                          :tenant_id, :page_id, :provider_comment_id, :provider_object_id,
                          :author_external_id, :author_display_name, :body, 'visible',
                          :created_at, NOW()
                        )
                        RETURNING id
                        """
                    ),
                    {
                        "tenant_id": tenant_id,
                        "page_id": page_id,
                        "provider_comment_id": provider_comment_id,
                        "provider_object_id": provider_object_id,
                        "author_external_id": author_external_id,
                        "author_display_name": author_display_name,
                        "body": body,
                        "created_at": timestamp,
                    },
                )
                row = result.fetchone()
                if not row:
                    raise RuntimeError("Failed to insert social comment")
            except IntegrityError as exc:
                await self.db.rollback()
                existing = await self.db.execute(
                    text(
                        """
                        SELECT id FROM social_comments
                        WHERE "providerCommentId" = :provider_comment_id
                        LIMIT 1
                        """
                    ),
                    {"provider_comment_id": provider_comment_id},
                )
                duplicate_row = existing.fetchone()
                if duplicate_row:
                    logger.info("social_comment_already_stored", provider_comment_id=provider_comment_id)
                    normalized.append(
                        {
                            "kind": "feed",
                            "duplicate": True,
                            "comment_id": int(duplicate_row[0]),
                            "provider_comment_id": provider_comment_id,
                        }
                    )
                    continue
                raise exc

            await self.db.commit()
            normalized.append(
                {
                    "kind": "feed",
                    "comment_id": int(row[0]),
                    "provider_comment_id": provider_comment_id,
                    "provider_object_id": provider_object_id,
                    "author_external_id": author_external_id,
                    "author_display_name": author_display_name,
                    "body": body,
                    "timestamp": timestamp.isoformat(),
                }
            )

        return {"kind": "feed", "comments": normalized}
