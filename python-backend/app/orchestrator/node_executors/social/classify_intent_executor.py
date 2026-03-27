"""Social intent classifier executor."""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

from app.llm_proxy.unified_client import get_unified_client
from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData

logger = structlog.get_logger(__name__)

HIGH_RISK_INTENTS = {"billing", "legal", "harassment", "refund", "complaint"}


def _strip_fences(text: str) -> str:
    trimmed = text.strip()
    match = re.match(r"^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$", trimmed, flags=re.IGNORECASE)
    return match.group(1).strip() if match else trimmed


def _parse_intent_payload(content: str) -> dict[str, Any]:
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


class ClassifyIntentExecutor:
    """Classify a social message into intent, confidence, and risk."""

    async def execute(self, data: NodeExecutionData, context: ExecutionContext) -> dict[str, Any]:
        message_body = data.inputs.get("messageBody") or data.config.get("messageBody") or ""
        if not isinstance(message_body, str):
            message_body = str(message_body)
        if not message_body.strip():
            raise ValueError("messageBody is required")

        conversation_history = data.inputs.get("conversationHistory") or data.config.get("conversationHistory")
        model = data.inputs.get("model") or data.config.get("model") or "openai/gpt-4o-mini"

        prompt_parts = [
            "Classify the user's social message into a concise JSON response.",
            "Return exactly: {\"intent\":\"...\",\"confidence\":0.0-1.0,\"category\":\"...\"}.",
            "Use one of these broad categories when possible: support, sales, billing, legal, harassment, complaint, other.",
            f"Message: {message_body}",
        ]
        if conversation_history:
            try:
                history_json = json.dumps(conversation_history, ensure_ascii=False, default=str)
            except Exception:
                history_json = str(conversation_history)
            prompt_parts.append(f"Conversation history: {history_json}")

        client = get_unified_client()
        await client.initialize()
        response = await client.chat(
            messages=[{"role": "user", "content": "\n\n".join(prompt_parts)}],
            model=str(model),
            task_type="decision",
            budget_priority="balanced",
            temperature=0.0,
            max_tokens=256,
        )

        content = getattr(response, "content", "") or ""
        parsed = _parse_intent_payload(str(content))

        intent = str(parsed.get("intent") or "other").strip().lower() or "other"
        category = str(parsed.get("category") or intent or "other").strip().lower() or "other"
        confidence_value = parsed.get("confidence", 0)
        try:
            confidence = float(confidence_value)
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        requires_human = bool(parsed.get("requiresHuman")) or intent in HIGH_RISK_INTENTS or category in HIGH_RISK_INTENTS
        if intent == "other" and not parsed:
            requires_human = True

        logger.info(
            "social_intent_classified",
            node_id=data.node_id,
            intent=intent,
            category=category,
            confidence=confidence,
            requires_human=requires_human,
        )

        return {
            "intent": intent,
            "confidence": confidence,
            "category": category,
            "requiresHuman": requires_human,
        }
