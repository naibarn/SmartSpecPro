"""Celery tasks for Meta social webhook ingestion."""

from __future__ import annotations

import asyncio
from typing import Any

import structlog
from sqlalchemy import text

from app.core.celery_app import celery_app
from app.core.database import AsyncSessionLocal
from app.core.redis_client import get_cache_redis, get_realtime_redis
from app.services.social.webhook_dedup import SocialWebhookDedupService
from app.services.social.webhook_normalizer import WebhookNormalizer

logger = structlog.get_logger(__name__)


def _run_async(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def _row_value(row: Any, key: str, index: int, default: Any = None) -> Any:
    if row is None:
        return default
    mapping = getattr(row, "_mapping", None)
    if mapping is not None and key in mapping:
        return mapping[key]
    if isinstance(row, dict):
        return row.get(key, default)
    try:
        return row[index]
    except Exception:
        return default


async def _load_raw_event(db, raw_event_id: int) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            """
            SELECT id, "tenantId", provider, "pageId", "deliveryId", "eventType",
                   payload, headers, "processingStatus", "errorMessage", "receivedAt"
            FROM social_webhook_events_raw
            WHERE id = :raw_event_id
            LIMIT 1
            """
        ),
        {"raw_event_id": raw_event_id},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "id": int(_row_value(row, "id", 0)),
        "tenant_id": _row_value(row, "tenantId", 1),
        "provider": _row_value(row, "provider", 2),
        "page_id": _row_value(row, "pageId", 3),
        "delivery_id": _row_value(row, "deliveryId", 4),
        "event_type": _row_value(row, "eventType", 5),
        "payload": _row_value(row, "payload", 6) or {},
        "headers": _row_value(row, "headers", 7) or {},
        "processing_status": _row_value(row, "processingStatus", 8),
        "error_message": _row_value(row, "errorMessage", 9),
        "received_at": _row_value(row, "receivedAt", 10),
    }


async def _resolve_page(db, provider_page_id: str) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            """
            SELECT sp.id, sp."tenantId", sp."providerPageId", sp.status, sp."pageName"
            FROM social_pages sp
            WHERE sp."providerPageId" = :provider_page_id
              AND sp.status = 'active'
            ORDER BY sp.id DESC
            LIMIT 1
            """
        ),
        {"provider_page_id": provider_page_id},
    )
    row = result.fetchone()
    if not row:
        return None
    return {
        "id": int(_row_value(row, "id", 0)),
        "tenant_id": _row_value(row, "tenantId", 1),
        "provider_page_id": _row_value(row, "providerPageId", 2),
        "status": _row_value(row, "status", 3),
        "page_name": _row_value(row, "pageName", 4),
    }


async def _mark_raw_event_status(db, raw_event_id: int, status: str, error_message: str | None = None) -> None:
    await db.execute(
        text(
            """
            UPDATE social_webhook_events_raw
            SET "processingStatus" = :status,
                "errorMessage" = :error_message
            WHERE id = :raw_event_id
            """
        ),
        {"raw_event_id": raw_event_id, "status": status, "error_message": error_message},
    )
    await db.commit()


async def _mark_raw_event_status_with_new_session(raw_event_id: int, status: str, error_message: str | None = None) -> None:
    async with AsyncSessionLocal() as db:
        await _mark_raw_event_status(db, raw_event_id, status, error_message)


async def _update_raw_event_context(db, raw_event_id: int, *, tenant_id: str | None = None, page_id: int | None = None) -> None:
    await db.execute(
        text(
            """
            UPDATE social_webhook_events_raw
            SET "tenantId" = COALESCE(:tenant_id, "tenantId"),
                "pageId" = COALESCE(:page_id, "pageId")
            WHERE id = :raw_event_id
            """
        ),
        {"raw_event_id": raw_event_id, "tenant_id": tenant_id, "page_id": page_id},
    )
    await db.commit()


async def _publish_stream_event(redis_client, page_id: int, payload: dict[str, Any]) -> None:
    if redis_client is None:
        return
    stream_key = f"social:stream:{page_id}"
    stream_payload = {key: "" if value is None else str(value) for key, value in payload.items()}
    await redis_client.xadd(stream_key, stream_payload, maxlen=10000, approximate=True)


async def _audit_unknown_page(provider_page_id: str, raw_event_id: int) -> None:
    logger.warning(
        "social_webhook_unknown_page",
        provider_page_id=provider_page_id,
        raw_event_id=raw_event_id,
    )


async def _process_entry(
    *,
    db,
    cache_redis,
    stream_redis,
    dedup: SocialWebhookDedupService,
    entry: dict[str, Any],
    raw_event_id: int,
    raw_tenant_id: str | None,
) -> tuple[int, int]:
    processed = 0
    skipped = 0
    provider_page_id = str(entry.get("id") or "")
    page = await _resolve_page(db, provider_page_id)
    if not page:
        await _audit_unknown_page(provider_page_id, raw_event_id)
        skipped += 1
        return processed, skipped

    if raw_tenant_id != page["tenant_id"]:
        await _update_raw_event_context(db, raw_event_id, tenant_id=str(page["tenant_id"]), page_id=page["id"])

    normalizer = WebhookNormalizer(db, redis=cache_redis)

    messaging = entry.get("messaging") or []
    if isinstance(messaging, list):
        for index, message in enumerate(messaging):
            if not isinstance(message, dict):
                continue

            recipient = message.get("recipient") or {}
            recipient_id = str(recipient.get("id") or "")
            if recipient_id and recipient_id != page["provider_page_id"]:
                logger.warning(
                    "social_webhook_recipient_mismatch",
                    provider_page_id=provider_page_id,
                    recipient_id=recipient_id,
                    raw_event_id=raw_event_id,
                )
                skipped += 1
                continue

            dedup_key = dedup.build_message_dedup_key(entry, message, index)
            if await dedup.is_message_duplicate(dedup_key):
                logger.info("social_webhook_message_duplicate", dedup_key=dedup_key, raw_event_id=raw_event_id)
                skipped += 1
                continue

            normalized = await normalizer.normalize_messaging_event(
                {"id": provider_page_id, "messaging": [message]},
                page["id"],
                str(page["tenant_id"]),
            )
            for message_result in normalized.get("messages", []):
                await _publish_stream_event(
                    stream_redis,
                    page["id"],
                    {
                        "event_type": "messaging",
                        "raw_event_id": str(raw_event_id),
                        "page_id": str(page["id"]),
                        "tenant_id": str(page["tenant_id"]),
                        "conversation_id": str(message_result.get("conversation_id", "")),
                        "message_id": str(message_result.get("message_id", "")),
                        "provider_message_id": str(message_result.get("provider_message_id", "")),
                        "sender_external_id": str(message_result.get("sender_external_id", "")),
                        "body": str(message_result.get("body", "")),
                    },
                )
            await dedup.mark_message_processed(dedup_key)
            processed += 1

    changes = entry.get("changes") or []
    if isinstance(changes, list):
        for index, change in enumerate(changes):
            if not isinstance(change, dict):
                continue
            value = change.get("value") or {}
            if not isinstance(value, dict):
                continue
            provider_comment_id = str(value.get("comment_id") or value.get("id") or f"{provider_page_id}_{index}")
            dedup_key = f"{provider_page_id}_{provider_comment_id}"
            if await dedup.is_message_duplicate(dedup_key):
                skipped += 1
                continue

            normalized = await normalizer.normalize_feed_event(
                {"id": provider_page_id, "changes": [change]},
                page["id"],
                str(page["tenant_id"]),
            )
            for comment_result in normalized.get("comments", []):
                await _publish_stream_event(
                    stream_redis,
                    page["id"],
                    {
                        "event_type": "feed",
                        "raw_event_id": str(raw_event_id),
                        "page_id": str(page["id"]),
                        "tenant_id": str(page["tenant_id"]),
                        "comment_id": str(comment_result.get("comment_id", "")),
                        "provider_comment_id": str(comment_result.get("provider_comment_id", "")),
                        "provider_object_id": str(comment_result.get("provider_object_id", "")),
                        "author_external_id": str(comment_result.get("author_external_id", "")),
                        "body": str(comment_result.get("body", "")),
                    },
                )
            await dedup.mark_message_processed(dedup_key)
            processed += 1

    return processed, skipped


async def process_social_webhook_event_async(raw_event_id: int, *, db=None, cache_redis=None, stream_redis=None) -> dict[str, Any]:
    close_db = False
    if db is None:
        db = AsyncSessionLocal()
        close_db = True

    if cache_redis is None:
        cache_redis = await get_cache_redis()
    if stream_redis is None:
        stream_redis = await get_realtime_redis()

    try:
        raw_event = await _load_raw_event(db, raw_event_id)
        if raw_event is None:
            raise ValueError(f"Raw webhook event {raw_event_id} not found")

        payload = raw_event["payload"] if isinstance(raw_event["payload"], dict) else {}
        delivery_id = str(raw_event["delivery_id"] or "")
        dedup = SocialWebhookDedupService(cache_redis)

        if await dedup.is_duplicate(delivery_id):
            await _mark_raw_event_status(db, raw_event_id, "processed", None)
            return {"status": "duplicate", "raw_event_id": raw_event_id}

        entries = payload.get("entry") or []
        if not isinstance(entries, list) or not entries:
            await _mark_raw_event_status(db, raw_event_id, "skipped", "No webhook entries to process")
            await dedup.mark_processed(delivery_id)
            return {"status": "skipped", "raw_event_id": raw_event_id}

        processed_total = 0
        skipped_total = 0
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_processed, entry_skipped = await _process_entry(
                db=db,
                cache_redis=cache_redis,
                stream_redis=stream_redis,
                dedup=dedup,
                entry=entry,
                raw_event_id=raw_event_id,
                raw_tenant_id=raw_event.get("tenant_id"),
            )
            processed_total += entry_processed
            skipped_total += entry_skipped

        if processed_total > 0:
            await _mark_raw_event_status(db, raw_event_id, "processed", None)
        else:
            await _mark_raw_event_status(db, raw_event_id, "skipped", "No processable webhook entries")

        await dedup.mark_processed(delivery_id)
        return {
            "status": "processed" if processed_total > 0 else "skipped",
            "raw_event_id": raw_event_id,
            "processed_count": processed_total,
            "skipped_count": skipped_total,
        }
    finally:
        if close_db:
            await db.close()


def _handle_social_webhook_failure(task_self, raw_event_id: int, exc: Exception) -> dict[str, Any]:
    logger.exception("social_webhook_processing_failed", raw_event_id=raw_event_id)
    if task_self.request.retries >= task_self.max_retries:
        _run_async(_mark_raw_event_status_with_new_session(raw_event_id, "failed", str(exc)))
        process_social_webhook_event.apply_async(args=[raw_event_id], queue="social_dlq")
        return {"status": "sent_to_dlq", "raw_event_id": raw_event_id}
    countdown = min(2 ** task_self.request.retries, 300)
    raise task_self.retry(exc=exc, countdown=countdown)


@celery_app.task(
    name="app.tasks.social_webhook_task.process_social_webhook_event",
    bind=True,
    max_retries=3,
    default_retry_delay=30,
)
def process_social_webhook_event(self, raw_event_id: int):
    routing_key = (self.request.delivery_info or {}).get("routing_key") if hasattr(self.request, "delivery_info") else None
    if routing_key == "social_dlq":
        return _run_async(_mark_raw_event_status_with_new_session(raw_event_id, "failed", "Moved to DLQ"))

    try:
        return _run_async(process_social_webhook_event_async(raw_event_id))
    except Exception as exc:
        return _handle_social_webhook_failure(self, raw_event_id, exc)


@celery_app.task(name="app.tasks.social_webhook_task.cleanup_social_webhook_events", bind=True)
def cleanup_social_webhook_events(self):
    return _run_async(_cleanup_social_webhook_events_async())


async def _cleanup_social_webhook_events_async() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            text(
                """
                DELETE FROM social_webhook_events_raw
                WHERE (
                    "processingStatus" IN ('processed', 'skipped')
                    AND "receivedAt" < NOW() - INTERVAL '30 days'
                )
                OR (
                    "processingStatus" = 'failed'
                    AND "receivedAt" < NOW() - INTERVAL '90 days'
                )
                """
            )
        )
        await db.commit()
        deleted = getattr(result, "rowcount", 0) or 0
        logger.info("social_webhook_events_cleaned", deleted_count=deleted)
        return {"deleted_count": deleted}
