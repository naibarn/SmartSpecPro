"""Social draft reply executor."""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

from app.core.database import get_db_context
from app.llm_proxy.unified_client import get_unified_client
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)


def _strip_fences(text: str) -> str:
    trimmed = text.strip()
    match = re.match(r"^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$", trimmed, flags=re.IGNORECASE)
    return match.group(1).strip() if match else trimmed


def _parse_reply_payload(content: str) -> dict[str, Any]:
    cleaned = _strip_fences(content)
    candidates = [cleaned]
    first_brace = cleaned.find("{")
    last_brace = cleaned.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        candidates.append(cleaned[first_brace : last_brace + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return {}


class DraftReplyExecutor:
    """Generate a reply draft for a social message."""

    async def _query_rag_documents(
        self,
        tenant_id: str | None,
        rag_collection_id: str | None,
        query: str,
        context: ExecutionContext,
    ) -> list[dict[str, Any]]:
        """Best-effort RAG lookup for reply drafting.

        This reuses any caller-provided RAG documents if available. If the
        caller has a collection lookup helper in extra_data we defer to it.
        """
        if not rag_collection_id or not tenant_id:
            return []

        lookup = context.extra_data.get("rag_collection_lookup")
        if callable(lookup):
            try:
                result = await lookup(tenant_id=tenant_id, rag_collection_id=rag_collection_id, query=query)
                if isinstance(result, list):
                    return [item for item in result if isinstance(item, dict)]
            except Exception:
                logger.warning("social_draft_rag_lookup_failed", rag_collection_id=rag_collection_id)

        return []

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        message_body = data.inputs.get("messageBody") or data.config.get("messageBody") or ""
        if not isinstance(message_body, str):
            message_body = str(message_body)
        if not message_body.strip():
            raise ValueError("messageBody is required")

        intent = str(data.inputs.get("intent") or data.config.get("intent") or "other")
        tone_guide = str(data.inputs.get("toneGuide") or data.config.get("toneGuide") or "Professional, friendly, helpful")
        model = data.inputs.get("model") or data.config.get("model") or "openai/gpt-4o-mini"
        rag_collection_id = str(data.inputs.get("ragCollectionId") or data.config.get("ragCollectionId") or "").strip() or None

        source_documents: list[dict[str, Any]] = []
        rag_context = ""
        if rag_collection_id:
            source_documents = await self._query_rag_documents(
                tenant_id=context.tenant_id,
                rag_collection_id=rag_collection_id,
                query=message_body,
                context=context,
            )
            if source_documents:
                rag_context = "\n\n".join(
                    f"- {doc.get('content', '')[:1200]} (score={doc.get('score', 0)})"
                    for doc in source_documents[:3]
                    if str(doc.get("content", "")).strip()
                )

        system_prompt = (
            "You are a customer support agent. Draft a concise, helpful reply to the customer's message.\n"
            f"Tone: {tone_guide}"
        )
        if intent:
            system_prompt += f"\nIntent: {intent}"
        if rag_context:
            system_prompt += f"\nReference notes:\n{rag_context}"

        user_prompt = f"Customer message:\n{message_body}\n\nReturn JSON with keys reply and confidence."

        client = get_unified_client()
        await client.initialize()
        response = await client.chat(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            model=str(model),
            task_type="decision",
            budget_priority="balanced",
            temperature=0.2,
            max_tokens=512,
        )

        parsed = _parse_reply_payload(str(getattr(response, "content", "") or ""))
        reply = str(parsed.get("reply") or parsed.get("draft") or parsed.get("message") or "").strip()
        if not reply:
            reply = str(getattr(response, "content", "") or "").strip()
        if not reply:
            raise ValueError("LLM did not return a reply draft")

        confidence_value = parsed.get("confidence", 0.6 if reply else 0.0)
        try:
            confidence = float(confidence_value)
        except (TypeError, ValueError):
            confidence = 0.6
        confidence = max(0.0, min(1.0, confidence))

        logger.info(
            "social_reply_drafted",
            node_id=data.node_id,
            intent=intent,
            confidence=confidence,
            source_documents=len(source_documents),
        )

        return {
            "draftReply": reply,
            "confidence": confidence,
            "sourceDocuments": source_documents,
        }
