"""Celery tasks for Meta social workflow triggers."""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select, text

from app.core.celery_app import celery_app
from app.core.database import get_db_context
from app.core.redis_client import get_cache_redis, get_realtime_redis
from app.models.workflow import Workflow
from app.orchestrator.langgraph_runtime import get_langgraph_runtime

logger = structlog.get_logger(__name__)

MAX_MESSAGES_PER_BATCH = 200
MAX_TRIGGERS_PER_PAGE_PER_MINUTE = 10
SOCIAL_TRIGGER_QUEUE = "social-workflow-triggers"


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


def _normalize_keywords(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [part.strip().lower() for part in value.split(",") if part.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(part).strip().lower() for part in value if str(part).strip()]
    return [str(value).strip().lower()]


def _message_matches_keywords(message_body: str, keywords: Any) -> bool:
    normalized = _normalize_keywords(keywords)
    if not normalized:
        return True
    body_lower = (message_body or "").lower()
    return any(keyword in body_lower for keyword in normalized)


async def _load_message(db, message_id: int) -> dict[str, Any] | None:
    result = await db.execute(
        text(
            """
            SELECT sm.id, sm."tenantId", sm."conversationId", sm."pageId",
                   sm."providerMessageId", sm.direction, sm."senderType",
                   sm."senderExternalId", sm."senderUserId", sm."messageType",
                   sm.body, sm.payload, sm."deliveryStatus", sm."workflowTriggerStatus",
                   sm."receivedAt", sm."createdAt",
                   sp."pageName", sp.status AS page_status,
                   sc."customerDisplayName", sc."providerConversationId"
            FROM social_messages sm
            JOIN social_pages sp ON sp.id = sm."pageId"
            LEFT JOIN social_conversations sc ON sc.id = sm."conversationId"
            WHERE sm.id = :message_id
            LIMIT 1
            """
        ),
        {"message_id": message_id},
    )
    row = result.fetchone()
    if not row:
        return None

    payload = _row_value(row, "payload", 11) or {}
    if not isinstance(payload, dict):
        payload = {}

    sender_name = (
        payload.get("sender_name")
        or payload.get("senderName")
        or payload.get("author_display_name")
        or _row_value(row, "customerDisplayName", 17)
        or ""
    )

    return {
        "id": int(_row_value(row, "id", 0)),
        "tenant_id": _row_value(row, "tenantId", 1),
        "conversation_id": int(_row_value(row, "conversationId", 2)),
        "page_id": int(_row_value(row, "pageId", 3)),
        "provider_message_id": _row_value(row, "providerMessageId", 4),
        "direction": _row_value(row, "direction", 5),
        "sender_type": _row_value(row, "senderType", 6),
        "sender_external_id": _row_value(row, "senderExternalId", 7),
        "sender_user_id": _row_value(row, "senderUserId", 8),
        "message_type": _row_value(row, "messageType", 9),
        "body": _row_value(row, "body", 10) or "",
        "payload": payload,
        "delivery_status": _row_value(row, "deliveryStatus", 12),
        "workflow_trigger_status": _row_value(row, "workflowTriggerStatus", 13),
        "received_at": _row_value(row, "receivedAt", 14),
        "created_at": _row_value(row, "createdAt", 15),
        "page_name": _row_value(row, "pageName", 16),
        "page_status": _row_value(row, "page_status", 17),
        "sender_name": sender_name,
        "provider_conversation_id": _row_value(row, "providerConversationId", 19),
    }


async def _load_matching_workflows(db, page_id: int, trigger_mode: str, message_body: str) -> list[tuple[Workflow, str]]:
    result = await db.execute(
        select(Workflow).where(Workflow.status == "active")
    )
    workflows = result.scalars().all()

    matches: list[tuple[Workflow, str]] = []
    for workflow in workflows:
        workflow_json = workflow.workflowJson
        if not isinstance(workflow_json, dict):
            continue
        nodes = workflow_json.get("nodes", [])
        if not isinstance(nodes, list):
            continue
        for node in nodes:
            if not isinstance(node, dict):
                continue
            node_type = node.get("type") or node.get("data", {}).get("nodeType")
            if node_type != "incoming_meta_message":
                continue
            node_config = node.get("data", {}).get("config", {}) if isinstance(node.get("data"), dict) else {}
            configured_page_id = node_config.get("pageId")
            node_trigger_mode = str(node_config.get("triggerMode") or "batch")
            if configured_page_id is not None and str(configured_page_id) != str(page_id):
                continue
            if node_trigger_mode != trigger_mode:
                continue
            if not _message_matches_keywords(message_body, node_config.get("filterKeywords")):
                continue
            matches.append((workflow, str(node.get("id") or "incoming_meta_message")))
            break

    return matches


async def _mark_message_trigger_status(db, message_id: int, status: str) -> None:
    await db.execute(
        text(
            """
            UPDATE social_messages
            SET "workflowTriggerStatus" = :status
            WHERE id = :message_id
            """
        ),
        {"message_id": message_id, "status": status},
    )


async def _execute_social_workflow(
    db,
    workflow: Workflow,
    trigger_node_id: str,
    message: dict[str, Any],
    trigger_mode: str,
) -> None:
    runtime = get_langgraph_runtime()
    compile_result = await runtime.compile(
        workflow_json=workflow.workflowJson,
        metadata={"workflow_id": str(workflow.id), "trigger_mode": trigger_mode},
    )
    compiled_graph = getattr(compile_result, "graph", compile_result)

    execution_id = f"social-{message['id']}-{workflow.id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
    config = {
        "configurable": {
            "thread_id": execution_id,
            "workflow_id": str(workflow.id),
            "execution_id": execution_id,
            "tenant_id": message["tenant_id"],
            "user_id": 0,
            "social_message": message,
            "trigger_mode": trigger_mode,
        }
    }

    await compiled_graph.ainvoke(
        {
            "social_message": message,
            "trigger_event": {
                "type": "social_message",
                "data": message,
            },
        },
        config=config,
    )

    logger.info(
        "social_workflow_triggered",
        workflow_id=workflow.id,
        execution_id=execution_id,
        trigger_node_id=trigger_node_id,
        message_id=message["id"],
        trigger_mode=trigger_mode,
    )


async def process_social_workflow_message_async(
    message_id: int | None = None,
    *,
    page_id: int | None = None,
    message_payload: dict[str, Any] | None = None,
    trigger_mode: str = "batch",
) -> dict[str, Any]:
    async with get_db_context() as db:
        message: dict[str, Any] | None = None
        if message_id is not None:
            message = await _load_message(db, message_id)
        elif message_payload is not None and page_id is not None:
            message = {
                "id": int(message_payload.get("message_id") or message_payload.get("id") or 0),
                "tenant_id": str(message_payload.get("tenant_id") or ""),
                "conversation_id": int(message_payload.get("conversation_id") or message_payload.get("conversationId") or 0),
                "page_id": int(page_id),
                "provider_message_id": str(message_payload.get("provider_message_id") or ""),
                "direction": "inbound",
                "sender_type": "customer",
                "sender_external_id": str(message_payload.get("sender_external_id") or ""),
                "sender_user_id": None,
                "message_type": "text",
                "body": str(message_payload.get("body") or ""),
                "payload": message_payload,
                "delivery_status": "received",
                "workflow_trigger_status": None,
                "received_at": datetime.now(timezone.utc),
                "created_at": datetime.now(timezone.utc),
                "page_name": "",
                "page_status": "active",
                "sender_name": str(message_payload.get("sender_name") or message_payload.get("senderName") or ""),
                "provider_conversation_id": str(message_payload.get("conversation_id") or ""),
            }

        if not message:
            return {"status": "not_found", "message_id": message_id}

        if message.get("workflow_trigger_status") == "dispatched":
            return {"status": "already_dispatched", "message_id": message["id"]}

        cache_redis = await get_cache_redis()
        if cache_redis is not None:
            counter_key = f"social:trigger:ratelimit:{message['page_id']}"
            count = await cache_redis.incr(counter_key)
            if count == 1:
                await cache_redis.expire(counter_key, 60)
            if count > MAX_TRIGGERS_PER_PAGE_PER_MINUTE:
                logger.info(
                    "social_trigger_rate_limited",
                    page_id=message["page_id"],
                    message_id=message["id"],
                    count=count,
                )
                return {"status": "rate_limited", "message_id": message["id"]}

        matches = await _load_matching_workflows(
            db,
            message["page_id"],
            trigger_mode,
            str(message.get("body") or ""),
        )

        if not matches:
            logger.info(
                "social_trigger_no_match",
                page_id=message["page_id"],
                message_id=message["id"],
                trigger_mode=trigger_mode,
            )
            return {"status": "no_match", "message_id": message["id"]}

        for workflow, trigger_node_id in matches:
            await _execute_social_workflow(
                db=db,
                workflow=workflow,
                trigger_node_id=trigger_node_id,
                message=message,
                trigger_mode=trigger_mode,
            )

        await _mark_message_trigger_status(db, int(message["id"]), "dispatched")
        await db.commit()

        return {
            "status": "dispatched",
            "message_id": message["id"],
            "workflow_count": len(matches),
        }


async def _process_social_workflow_message_task(message_id: int | None = None, *, page_id: int | None = None, message_payload: dict[str, Any] | None = None, trigger_mode: str = "batch") -> dict[str, Any]:
    return await process_social_workflow_message_async(
        message_id=message_id,
        page_id=page_id,
        message_payload=message_payload,
        trigger_mode=trigger_mode,
    )


@celery_app.task(
    name="app.tasks.social_workflow_trigger_task.process_social_workflow_message",
    bind=True,
    max_retries=3,
    default_retry_delay=15,
)
def process_social_workflow_message(self, message_id: int | None = None, *, page_id: int | None = None, message_payload: dict[str, Any] | None = None, trigger_mode: str = "batch"):
    try:
        return asyncio.run(
            _process_social_workflow_message_task(
                message_id=message_id,
                page_id=page_id,
                message_payload=message_payload,
                trigger_mode=trigger_mode,
            )
        )
    except Exception as exc:
        logger.exception("process_social_workflow_message_failed", message_id=message_id, page_id=page_id)
        if self.request.retries >= self.max_retries:
            return {"status": "failed", "message_id": message_id, "error": str(exc)}
        raise self.retry(exc=exc)


async def _poll_social_workflow_triggers_async() -> dict[str, Any]:
    processed = 0
    enqueued = 0

    async with get_db_context() as db:
        result = await db.execute(
            text(
                """
                SELECT id, "pageId"
                FROM social_messages
                WHERE "workflowTriggerStatus" IS NULL
                  AND direction = 'inbound'
                ORDER BY "createdAt" ASC, id ASC
                LIMIT :limit
                """
            ),
            {"limit": MAX_MESSAGES_PER_BATCH},
        )
        rows = result.fetchall()

    for row in rows:
        message_id = int(_row_value(row, "id", 0))
        page_id = int(_row_value(row, "pageId", 1))
        process_social_workflow_message.delay(message_id=message_id, page_id=page_id, trigger_mode="batch")
        processed += 1
        enqueued += 1

    return {"processed": processed, "enqueued": enqueued}


@celery_app.task(name="app.tasks.social_workflow_trigger_task.poll_social_workflow_triggers")
def poll_social_workflow_triggers():
    return asyncio.run(_poll_social_workflow_triggers_async())
