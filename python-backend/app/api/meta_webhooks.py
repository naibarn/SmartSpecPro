"""Public Meta webhook endpoint for verification and inbound delivery ingestion."""

from __future__ import annotations

import json
import secrets
from typing import Any

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.system_settings_loader import get_first_system_setting
from app.services.social.webhook_validator import validate_meta_webhook_signature
from app.tasks.social_webhook_task import process_social_webhook_event

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


async def _load_meta_webhook_secret(db: AsyncSession, keys: tuple[str, ...]) -> str:
    value = await get_first_system_setting(category="meta_channels", keys=keys, db=db)
    if not value:
        raise HTTPException(status_code=503, detail="Meta webhook secret is not configured")
    return value


def _extract_message_mid(payload: dict[str, Any]) -> str:
    for entry in payload.get("entry") or []:
        if not isinstance(entry, dict):
            continue
        for message in entry.get("messaging") or []:
            if not isinstance(message, dict):
                continue
            message_payload = message.get("message") if isinstance(message.get("message"), dict) else {}
            mid = message_payload.get("mid") or message.get("mid")
            if mid:
                return str(mid)
    return ""


def _build_delivery_id(payload: dict[str, Any]) -> str:
    entries = payload.get("entry") or []
    if isinstance(entries, list):
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_id = str(entry.get("id") or entry.get("page_id") or "unknown")
            messaging = entry.get("messaging") or []
            if isinstance(messaging, list):
                for index, message in enumerate(messaging):
                    if not isinstance(message, dict):
                        continue
                    message_payload = message.get("message") if isinstance(message.get("message"), dict) else {}
                    mid = message_payload.get("mid") or message.get("mid")
                    if mid:
                        return f"{entry_id}_{mid}"
                    timestamp = (
                        message.get("timestamp")
                        or message.get("time")
                        or entry.get("time")
                        or message.get("created_time")
                        or 0
                    )
                    return f"{entry_id}_{timestamp}_{index}"
            changes = entry.get("changes") or []
            if isinstance(changes, list):
                for index, change in enumerate(changes):
                    if not isinstance(change, dict):
                        continue
                    value = change.get("value") or {}
                    if not isinstance(value, dict):
                        value = {}
                    change_id = value.get("comment_id") or value.get("id")
                    if change_id:
                        return f"{entry_id}_{change_id}"
                    timestamp = entry.get("time") or value.get("created_time") or 0
                    return f"{entry_id}_{timestamp}_{index}"
    return "unknown_0_0"


def _sanitized_headers(request: Request) -> dict[str, str]:
    allowed = {"content-type", "x-hub-delivery"}
    headers: dict[str, str] = {}
    for key, value in request.headers.items():
        lower_key = key.lower()
        if lower_key in allowed:
            headers[lower_key] = value
    return headers


@router.get("/meta")
async def verify_meta_webhook(
    request: Request,
    hub_mode: str = Query("", alias="hub.mode"),
    hub_verify_token: str = Query("", alias="hub.verify_token"),
    hub_challenge: str = Query("", alias="hub.challenge"),
    db: AsyncSession = Depends(get_db),
):
    if hub_mode and hub_mode != "subscribe":
        raise HTTPException(status_code=400, detail="Invalid hub.mode")

    expected_verify_token = await _load_meta_webhook_secret(db, ("webhook_verify_token", "verify_token"))
    if not secrets.compare_digest(hub_verify_token, expected_verify_token):
        raise HTTPException(status_code=403, detail="Invalid verify token")

    if not hub_challenge:
        raise HTTPException(status_code=400, detail="Missing hub.challenge")

    return PlainTextResponse(content=hub_challenge)


async def ingest_meta_webhook_payload(
    raw_body: bytes,
    request: Request,
    db: AsyncSession,
) -> dict[str, Any]:
    signature_header = request.headers.get("X-Hub-Signature-256", "")
    app_secret = await _load_meta_webhook_secret(db, ("app_secret", "webhook_app_secret"))

    if not validate_meta_webhook_signature(raw_body, signature_header, app_secret):
        logger.warning("meta_webhook_invalid_signature")
        raise HTTPException(status_code=403, detail="Invalid webhook signature")

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    delivery_id = request.headers.get("X-Hub-Delivery") or _build_delivery_id(payload)
    headers = _sanitized_headers(request)
    event_type = str(payload.get("object") or "unknown")
    entries = payload.get("entry") or []

    insert_result = await db.execute(
        text(
            """
            INSERT INTO social_webhook_events_raw (
              "provider", "pageId", "deliveryId", "eventType", "payload", "headers",
              "processingStatus", "receivedAt"
            ) VALUES (
              'meta', :page_id, :delivery_id, :event_type, :payload, :headers,
              'pending', NOW()
            )
            ON CONFLICT ("provider", "deliveryId") DO NOTHING
            RETURNING id
            """
        ),
        {
            "page_id": None,
            "delivery_id": delivery_id,
            "event_type": event_type,
            "payload": payload,
            "headers": headers,
        },
    )
    row = insert_result.fetchone()
    raw_event_id = int(row[0]) if row else None

    if raw_event_id is None:
        existing = await db.execute(
            text(
                """
                SELECT id FROM social_webhook_events_raw
                WHERE "provider" = 'meta' AND "deliveryId" = :delivery_id
                LIMIT 1
                """
            ),
            {"delivery_id": delivery_id},
        )
        existing_row = existing.fetchone()
        if not existing_row:
            raise HTTPException(status_code=500, detail="Unable to store webhook event")
        raw_event_id = int(existing_row[0])

    await db.commit()

    try:
        process_social_webhook_event.delay(raw_event_id)
    except Exception as exc:
        logger.error("meta_webhook_dispatch_failed", raw_event_id=raw_event_id, error=str(exc))

    return {
        "ok": True,
        "raw_event_id": raw_event_id,
        "delivery_id": delivery_id,
        "page_id": None,
    }


@router.post("/meta")
async def receive_meta_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw_body = await request.body()
    return await ingest_meta_webhook_payload(raw_body, request, db)
