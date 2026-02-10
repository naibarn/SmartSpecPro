"""Durable callback pipeline for media provider webhooks."""

from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import json
from typing import Any, Optional

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.media_callback_event import (
    CallbackEventStatus,
    CallbackDLQStatus,
    MediaCallbackDLQ,
    MediaCallbackEvent,
)
from app.models.media_task import TaskStatus
from app.services.library_observability import emit_metric, log_observability_event
from app.services.media_task_service import MediaTaskService

logger = structlog.get_logger()

DEFAULT_MAX_ATTEMPTS = 5


def _extract_url_from_value(value: Any) -> Optional[str]:
    if isinstance(value, str) and value.startswith("http"):
        return value

    if isinstance(value, dict):
        for key in (
            "url",
            "image_url",
            "video_url",
            "audio_url",
            "imageUrl",
            "videoUrl",
            "audioUrl",
            "result_url",
        ):
            candidate = value.get(key)
            if isinstance(candidate, str) and candidate.startswith("http"):
                return candidate

    return None


def _extract_result_url(output: Any) -> Optional[str]:
    if isinstance(output, dict):
        direct = _extract_url_from_value(output)
        if direct:
            return direct

        for list_key in ("urls", "resultUrls", "images", "videos", "audios", "outputs"):
            items = output.get(list_key)
            if isinstance(items, list):
                for item in items:
                    url = _extract_url_from_value(item)
                    if url:
                        return url
            elif items is not None:
                url = _extract_url_from_value(items)
                if url:
                    return url

    if isinstance(output, list):
        for item in output:
            url = _extract_url_from_value(item)
            if url:
                return url

    return _extract_url_from_value(output)


def _normalize_kie_callback_payload(payload: dict[str, Any]) -> dict[str, Any]:
    data = payload.get("data", {})
    if not isinstance(data, dict):
        data = {}

    provider_task_id = payload.get("taskId") or payload.get("task_id")
    status_raw = str(payload.get("status", "")).strip().lower()

    if not status_raw:
        success_flag = data.get("successFlag")
        if success_flag in (1, True):
            status_raw = "completed"
        elif success_flag in (0, False):
            status_raw = "failed"
        elif data:
            status_raw = "processing"

    output = payload.get("output", {})
    if (not isinstance(output, dict) or not output) and isinstance(data.get("response"), dict):
        output = data.get("response")

    error = payload.get("error") or data.get("errorMessage") or data.get("msg")

    normalized_status = "processing"
    if status_raw in {"completed", "complete", "success", "done", "finished", "finish"}:
        normalized_status = "completed"
    elif status_raw in {"failed", "fail", "error", "cancelled", "canceled"}:
        normalized_status = "failed"

    result_url = _extract_result_url(output)

    return {
        "provider_task_id": provider_task_id,
        "status_raw": status_raw or "processing",
        "normalized_status": normalized_status,
        "output": output if isinstance(output, (dict, list, str)) else {},
        "error": str(error) if error else None,
        "result_url": result_url,
    }


def _build_event_fingerprint(provider_name: str, payload: dict[str, Any], normalized: dict[str, Any]) -> str:
    canonical_payload = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    fingerprint_source = "|".join(
        [
            provider_name,
            str(normalized.get("provider_task_id") or "missing"),
            str(normalized.get("normalized_status") or "unknown"),
            str(normalized.get("result_url") or ""),
            str(normalized.get("error") or ""),
            canonical_payload,
        ]
    )
    return hashlib.sha256(fingerprint_source.encode("utf-8")).hexdigest()


def _retry_delay_seconds(attempt_count: int) -> int:
    # 30s, 60s, 120s, 240s, ... max 30m
    exponent = max(attempt_count - 1, 0)
    return min(30 * (2**exponent), 1800)


def _map_normalized_to_task_status(normalized_status: str) -> TaskStatus:
    if normalized_status == "completed":
        return TaskStatus.COMPLETED
    if normalized_status == "failed":
        return TaskStatus.FAILED
    return TaskStatus.PROCESSING


async def _insert_dlq_entry(db: AsyncSession, event: MediaCallbackEvent, error_message: str) -> None:
    existing = await db.scalar(select(MediaCallbackDLQ).where(MediaCallbackDLQ.event_id == event.id))
    if existing:
        return

    entry = MediaCallbackDLQ(
        event_id=event.id,
        provider_name=event.provider_name,
        provider_task_id=event.provider_task_id,
        event_fingerprint=event.event_fingerprint,
        payload=event.payload or {},
        error_message=error_message,
        retry_count=event.attempt_count,
        status=CallbackDLQStatus.PENDING.value,
    )
    db.add(entry)
    await db.commit()
    emit_metric("media.callback.dlq_total", provider=event.provider_name)


async def _process_callback_event(db: AsyncSession, event: MediaCallbackEvent) -> dict[str, Any]:
    payload = event.payload if isinstance(event.payload, dict) else {}
    normalized = _normalize_kie_callback_payload(payload)

    event.status = CallbackEventStatus.PROCESSING.value
    event.attempt_count = (event.attempt_count or 0) + 1
    event.normalized_status = normalized["normalized_status"]
    event.result_url = normalized["result_url"]
    event.error_message = None
    event.next_retry_at = None
    await db.commit()

    try:
        provider_task_id = normalized.get("provider_task_id")
        if not provider_task_id:
            raise ValueError("provider_task_id missing in callback payload")

        task = await MediaTaskService.get_task_by_external_id(db, provider_task_id)
        if not task:
            raise LookupError(f"No media task found for provider_task_id={provider_task_id}")

        target_status = _map_normalized_to_task_status(normalized["normalized_status"])
        task_terminal = task.status in {
            TaskStatus.COMPLETED.value,
            TaskStatus.FAILED.value,
            TaskStatus.CANCELLED.value,
        }

        if not task_terminal:
            await MediaTaskService.update_task_by_external_id(
                db,
                provider_task_id,
                target_status,
                result_url=normalized.get("result_url"),
                result_data={"output": normalized.get("output")},
                error_message=normalized.get("error") if target_status == TaskStatus.FAILED else None,
            )

        event.status = CallbackEventStatus.COMPLETED.value
        event.processed_at = datetime.utcnow()
        event.updated_at = datetime.utcnow()
        await db.commit()

        logger.info(
            "media_callback_processed",
            event_id=event.id,
            provider_task_id=provider_task_id,
            duplicate_terminal=task_terminal,
            target_status=target_status.value,
        )
        emit_metric(
            "media.callback.processed_total",
            provider=event.provider_name,
            normalized_status=normalized["normalized_status"],
        )
        log_observability_event(
            "media_callback_processed_observed",
            correlation_id=f"media-callback:{event.id}",
            event_id=event.id,
            provider_task_id=provider_task_id,
            target_status=target_status.value,
            duplicate_terminal=task_terminal,
        )
        return {
            "event_id": event.id,
            "status": "completed",
            "provider_task_id": provider_task_id,
            "attempt_count": event.attempt_count,
            "terminal_noop": task_terminal,
        }

    except Exception as exc:  # noqa: BLE001
        err_msg = str(exc)
        terminal = isinstance(exc, ValueError) or event.attempt_count >= (event.max_attempts or DEFAULT_MAX_ATTEMPTS)

        if terminal:
            event.status = CallbackEventStatus.FAILED.value
            event.error_message = err_msg
            event.processed_at = datetime.utcnow()
            event.updated_at = datetime.utcnow()
            await db.commit()

            await _insert_dlq_entry(db, event, err_msg)

            logger.warning(
                "media_callback_failed_terminal",
                event_id=event.id,
                provider_task_id=event.provider_task_id,
                error=err_msg,
            )
            emit_metric(
                "media.callback.failed_total",
                provider=event.provider_name,
                terminal=True,
            )
            log_observability_event(
                "media_callback_failed_terminal_observed",
                correlation_id=f"media-callback:{event.id}",
                event_id=event.id,
                provider_task_id=event.provider_task_id,
                error=err_msg,
                attempt_count=event.attempt_count,
            )
            return {
                "event_id": event.id,
                "status": "failed_terminal",
                "error": err_msg,
                "provider_task_id": event.provider_task_id,
                "attempt_count": event.attempt_count,
            }

        delay = _retry_delay_seconds(event.attempt_count)
        event.status = CallbackEventStatus.RETRY_PENDING.value
        event.error_message = err_msg
        event.next_retry_at = datetime.utcnow() + timedelta(seconds=delay)
        event.updated_at = datetime.utcnow()
        await db.commit()

        logger.info(
            "media_callback_retry_scheduled",
            event_id=event.id,
            provider_task_id=event.provider_task_id,
            delay_seconds=delay,
            error=err_msg,
        )
        emit_metric(
            "media.callback.retry_scheduled_total",
            provider=event.provider_name,
        )
        return {
            "event_id": event.id,
            "status": "retry_pending",
            "error": err_msg,
            "provider_task_id": event.provider_task_id,
            "attempt_count": event.attempt_count,
            "next_retry_at": event.next_retry_at.isoformat() if event.next_retry_at else None,
        }


async def process_kie_callback_payload(
    db: AsyncSession,
    payload: dict[str, Any],
    max_attempts: int = DEFAULT_MAX_ATTEMPTS,
) -> dict[str, Any]:
    """Persist and process a Kie callback payload with idempotency."""
    normalized = _normalize_kie_callback_payload(payload)
    log_observability_event(
        "media_callback_payload_received",
        provider="kie_ai",
        provider_task_id=normalized.get("provider_task_id"),
        normalized_status=normalized.get("normalized_status"),
        payload=payload,
    )
    fingerprint = _build_event_fingerprint("kie_ai", payload, normalized)

    event = await db.scalar(select(MediaCallbackEvent).where(MediaCallbackEvent.event_fingerprint == fingerprint))
    created = False

    if not event:
        event = MediaCallbackEvent(
            provider_name="kie_ai",
            provider_task_id=normalized.get("provider_task_id"),
            event_fingerprint=fingerprint,
            payload=payload,
            normalized_status=normalized.get("normalized_status"),
            result_url=normalized.get("result_url"),
            error_message=normalized.get("error"),
            status=CallbackEventStatus.PENDING.value,
            max_attempts=max_attempts,
        )
        db.add(event)
        await db.commit()
        await db.refresh(event)
        created = True

    if event.status == CallbackEventStatus.COMPLETED.value:
        return {
            "event_id": event.id,
            "status": "completed",
            "provider_task_id": event.provider_task_id,
            "duplicate": True,
            "attempt_count": event.attempt_count,
        }

    result = await _process_callback_event(db, event)
    result["duplicate"] = not created
    return result


async def retry_due_callback_events(db: AsyncSession, limit: int = 50) -> dict[str, int]:
    """Retry due callback events currently in retry_pending state."""
    now = datetime.utcnow()
    rows = await db.execute(
        select(MediaCallbackEvent)
        .where(MediaCallbackEvent.status == CallbackEventStatus.RETRY_PENDING.value)
        .where(MediaCallbackEvent.next_retry_at.isnot(None))
        .where(MediaCallbackEvent.next_retry_at <= now)
        .order_by(MediaCallbackEvent.next_retry_at.asc())
        .limit(limit)
    )
    events = rows.scalars().all()

    processed = 0
    completed = 0
    retry_pending = 0
    failed = 0

    for event in events:
        processed += 1
        result = await _process_callback_event(db, event)
        if result.get("status") == "completed":
            completed += 1
        elif result.get("status") == "retry_pending":
            retry_pending += 1
        else:
            failed += 1

    log_observability_event(
        "media_callback_retry_batch_completed",
        processed=processed,
        completed=completed,
        retry_pending=retry_pending,
        failed=failed,
        limit=limit,
    )
    return {
        "processed": processed,
        "completed": completed,
        "retry_pending": retry_pending,
        "failed": failed,
    }


async def get_latest_callback_event_by_provider_task_id(
    db: AsyncSession,
    provider_task_id: str,
) -> Optional[MediaCallbackEvent]:
    """Return latest callback event for a provider task id."""
    if not provider_task_id:
        return None

    rows = await db.execute(
        select(MediaCallbackEvent)
        .where(MediaCallbackEvent.provider_task_id == provider_task_id)
        .order_by(MediaCallbackEvent.created_at.desc())
        .limit(1)
    )
    return rows.scalar_one_or_none()
