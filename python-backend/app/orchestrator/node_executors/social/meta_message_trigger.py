"""Social trigger executor for incoming Meta messages."""

from __future__ import annotations

from typing import Any

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)


def _normalize_keywords(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [part.strip().lower() for part in value.split(",") if part.strip()]
    if isinstance(value, (list, tuple, set)):
        return [str(part).strip().lower() for part in value if str(part).strip()]
    return [str(value).strip().lower()]


def _extract_message_payload(context: ExecutionContext, data: NodeExecutionData) -> dict[str, Any]:
    raw_event = (
        context.extra_data.get("social_message")
        or context.extra_data.get("trigger_event")
        or data.inputs.get("messagePayload")
        or data.inputs.get("socialMessage")
        or {}
    )
    if not isinstance(raw_event, dict):
        raise ValueError("Social trigger requires a message payload")

    payload = raw_event.get("data") if isinstance(raw_event.get("data"), dict) else raw_event
    if not isinstance(payload, dict):
        raise ValueError("Social trigger payload is invalid")
    return payload


class MetaMessageTriggerExecutor:
    """Trigger workflow from an incoming Meta message payload."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        payload = _extract_message_payload(context, data)

        configured_page_id = data.config.get("pageId") or data.inputs.get("pageId")
        if configured_page_id is not None:
            incoming_page_id = payload.get("page_id") or payload.get("pageId")
            if incoming_page_id is not None and str(incoming_page_id) != str(configured_page_id):
                raise ValueError(
                    f"Page mismatch. Expected '{configured_page_id}', got '{incoming_page_id}'"
                )

        message_body = (
            payload.get("body")
            or payload.get("messageBody")
            or payload.get("text")
            or payload.get("content")
            or ""
        )
        if not isinstance(message_body, str):
            message_body = str(message_body)

        filter_keywords = _normalize_keywords(
            data.config.get("filterKeywords") or data.inputs.get("filterKeywords")
        )
        if filter_keywords:
            body_lower = message_body.lower()
            if not any(keyword in body_lower for keyword in filter_keywords):
                logger.info(
                    "meta_message_trigger_filtered",
                    node_id=data.node_id,
                    keywords=filter_keywords,
                )
                raise ValueError("Message filtered out by keyword filter")

        sender_name = (
            payload.get("sender_name")
            or payload.get("senderName")
            or payload.get("author_display_name")
            or payload.get("customerDisplayName")
            or ""
        )
        sender_external_id = (
            payload.get("sender_external_id")
            or payload.get("senderExternalId")
            or payload.get("author_external_id")
            or payload.get("customerExternalId")
            or ""
        )

        conversation_id = (
            payload.get("conversation_id")
            or payload.get("conversationId")
            or payload.get("thread_id")
            or payload.get("threadId")
        )

        logger.info(
            "meta_message_trigger_executed",
            node_id=data.node_id,
            trigger_mode=data.config.get("triggerMode", "batch"),
        )

        return {
            "conversationId": conversation_id,
            "messageBody": message_body,
            "senderName": sender_name,
            "senderExternalId": sender_external_id,
            "messagePayload": payload,
        }
