"""
Agency Guardrails — execution engine for input/output validation during agent runs.

Supports 7 strategies: keyword_block, regex_match, llm_classify, json_schema,
max_length, pii_detection, custom_endpoint.

Called by the agency orchestrator, not directly by HTTP endpoints.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any

import httpx
import structlog

logger = structlog.get_logger(__name__)


# ── Data structures ───────────────────────────────────────────────────────────


@dataclass
class GuardrailResult:
    passed: bool
    message: str = ""
    action: str = "allow"  # "allow", "block", "guidance", "redact"
    redacted_message: str | None = None


@dataclass
class GuardrailDefinition:
    id: str
    name: str
    type: str  # "input" | "output"
    mode: str  # "guidance" | "strict"
    strategy: str  # one of 7 strategies
    config: dict[str, Any] = field(default_factory=dict)
    validation_attempts: int = 1
    sort_order: int = 0
    enforce_on_handoff: bool = False
    is_enabled: bool = True


# ── Main entry point ──────────────────────────────────────────────────────────


async def execute_guardrails(
    guardrails: list[GuardrailDefinition],
    message: str,
    guardrail_type: str,  # "input" or "output"
    context: dict[str, Any] | None = None,
    is_handoff: bool = False,
    llm_client: Any | None = None,
) -> GuardrailResult:
    """Execute guardrails in sortOrder. Returns aggregated result."""

    # Filter by type and enabled
    filtered = [
        g for g in guardrails
        if g.type == guardrail_type and g.is_enabled
    ]

    # If handoff, only include guardrails with enforce_on_handoff
    if is_handoff:
        filtered = [g for g in filtered if g.enforce_on_handoff]

    # Sort by sort_order ascending
    filtered.sort(key=lambda g: g.sort_order)

    if not filtered:
        return GuardrailResult(passed=True, action="allow")

    guidance_messages: list[str] = []
    current_message = message

    for guardrail in filtered:
        try:
            result = await _dispatch_strategy(
                guardrail.strategy, current_message, guardrail.config, llm_client
            )
        except Exception as exc:
            logger.error(
                "guardrail_execution_error",
                guardrail_id=guardrail.id,
                strategy=guardrail.strategy,
                error=str(exc)[:200],
            )
            # Fail-open on unexpected errors
            result = GuardrailResult(passed=True, action="allow")

        if not result.passed:
            if guardrail.mode == "strict":
                return GuardrailResult(
                    passed=False,
                    message=result.message,
                    action="block",
                )
            else:
                # guidance mode — collect and continue
                guidance_messages.append(
                    f"[{guardrail.name}]: {result.message}"
                )

        # If redaction happened, use the redacted message for subsequent guardrails
        if result.redacted_message is not None:
            current_message = result.redacted_message

    if guidance_messages:
        return GuardrailResult(
            passed=True,
            message="\n".join(guidance_messages),
            action="guidance",
            redacted_message=current_message if current_message != message else None,
        )

    return GuardrailResult(
        passed=True,
        action="allow",
        redacted_message=current_message if current_message != message else None,
    )


# ── Strategy dispatcher ──────────────────────────────────────────────────────


STRATEGY_MAP: dict[str, Any] = {}  # populated below


async def _dispatch_strategy(
    strategy: str,
    message: str,
    config: dict[str, Any],
    llm_client: Any | None = None,
) -> GuardrailResult:
    handler = STRATEGY_MAP.get(strategy)
    if handler is None:
        logger.warning("guardrail_unknown_strategy", strategy=strategy)
        return GuardrailResult(passed=True, action="allow")

    if strategy == "llm_classify":
        return await handler(message, config, llm_client)
    return await handler(message, config)


# ── Strategy implementations ──────────────────────────────────────────────────


async def _strategy_keyword_block(message: str, config: dict[str, Any]) -> GuardrailResult:
    keywords: list[str] = config.get("keywords", [])
    msg_lower = message.lower()
    for kw in keywords:
        if kw.lower() in msg_lower:
            return GuardrailResult(
                passed=False,
                message=f"Blocked: message contains keyword '{kw}'",
                action="block",
            )
    return GuardrailResult(passed=True, action="allow")


async def _strategy_regex_match(message: str, config: dict[str, Any]) -> GuardrailResult:
    pattern = config.get("pattern", "")
    action = config.get("action", "block")

    # ReDoS protection: enforce max pattern length at runtime
    if len(pattern) > 1000:
        return GuardrailResult(
            passed=False,
            message="Regex pattern exceeds maximum length of 1000 characters",
            action="block",
        )

    try:
        match = re.search(pattern, message[:50000], re.IGNORECASE)  # cap message length for regex
    except re.error as e:
        return GuardrailResult(
            passed=False,
            message=f"Invalid regex pattern: {e}",
            action="block",
        )

    if action == "block" and match:
        return GuardrailResult(
            passed=False,
            message=f"Blocked: message matches pattern '{pattern}'",
            action="block",
        )
    elif action == "require" and not match:
        return GuardrailResult(
            passed=False,
            message=f"Required pattern '{pattern}' not found in message",
            action="block",
        )

    return GuardrailResult(passed=True, action="allow")


async def _strategy_llm_classify(
    message: str,
    config: dict[str, Any],
    llm_client: Any | None = None,
) -> GuardrailResult:
    if llm_client is None:
        logger.warning("guardrail_llm_classify_no_client")
        return GuardrailResult(passed=True, action="allow")

    prompt_template = config.get("prompt", "Classify this message: {message}")
    block_if = config.get("blockIf", "").lower().strip()
    model = config.get("model")

    prompt = prompt_template.replace("{message}", message)

    try:
        response = await llm_client.chat(
            messages=[{"role": "user", "content": prompt}],
            model=model,
        )
        content = ""
        if isinstance(response, dict):
            content = str(response.get("content", "")).lower().strip()
        else:
            content = str(response).lower().strip()

        # Exact match (stripped and lowered) to avoid false positives from substring matching
        if block_if and content.strip() == block_if:
            return GuardrailResult(
                passed=False,
                message=f"LLM classified as '{content}' (blocked on '{block_if}')",
                action="block",
            )
    except Exception as exc:
        logger.error("guardrail_llm_classify_error", error=str(exc)[:200])
        # Fail-open on LLM errors
        return GuardrailResult(passed=True, action="allow")

    return GuardrailResult(passed=True, action="allow")


async def _strategy_json_schema(message: str, config: dict[str, Any]) -> GuardrailResult:
    schema = config.get("schema", {})

    try:
        parsed = json.loads(message)
    except (json.JSONDecodeError, TypeError):
        return GuardrailResult(
            passed=False,
            message="Output is not valid JSON",
            action="block",
        )

    try:
        import jsonschema
        jsonschema.validate(instance=parsed, schema=schema)
    except jsonschema.ValidationError as e:
        return GuardrailResult(
            passed=False,
            message=f"JSON schema validation failed: {e.message}",
            action="block",
        )
    except jsonschema.SchemaError as e:
        return GuardrailResult(
            passed=False,
            message=f"Invalid JSON schema: {e.message}",
            action="block",
        )

    return GuardrailResult(passed=True, action="allow")


async def _strategy_max_length(message: str, config: dict[str, Any]) -> GuardrailResult:
    max_chars: int = config.get("maxChars", 10000)
    if len(message) > max_chars:
        return GuardrailResult(
            passed=False,
            message=f"Message exceeds maximum length of {max_chars} characters ({len(message)} chars)",
            action="block",
        )
    return GuardrailResult(passed=True, action="allow")


# ── PII patterns ──────────────────────────────────────────────────────────────

PII_PATTERNS: dict[str, re.Pattern[str]] = {
    "email": re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"),
    "phone": re.compile(r"\b\d{3}[-.]?\d{3}[-.]?\d{4}\b"),
    "ssn": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
}


async def _strategy_pii_detection(message: str, config: dict[str, Any]) -> GuardrailResult:
    patterns_to_check: list[str] = config.get("patterns", [])
    action = config.get("action", "block")

    found_matches: list[str] = []
    redacted = message

    for pattern_name in patterns_to_check:
        pat = PII_PATTERNS.get(pattern_name)
        if pat is None:
            continue
        if pat.search(message):
            found_matches.append(pattern_name)
            if action == "redact":
                redacted = pat.sub("[REDACTED]", redacted)

    if not found_matches:
        return GuardrailResult(passed=True, action="allow")

    if action == "redact":
        return GuardrailResult(
            passed=True,
            message=f"PII detected and redacted: {', '.join(found_matches)}",
            action="redact",
            redacted_message=redacted,
        )

    return GuardrailResult(
        passed=False,
        message=f"PII detected: {', '.join(found_matches)}",
        action="block",
    )


async def _strategy_custom_endpoint(message: str, config: dict[str, Any]) -> GuardrailResult:
    endpoint = config.get("endpoint", "")
    timeout_ms = config.get("timeout", 5000)

    # SSRF validation
    try:
        from app.orchestrator.node_executors.io_executors.ssrf_guard import SSRFGuard
        guard = SSRFGuard()
        await guard.validate_url(endpoint)
    except (ValueError, Exception) as exc:
        return GuardrailResult(
            passed=False,
            message=f"SSRF validation failed: {str(exc)[:200]}",
            action="block",
        )

    try:
        async with httpx.AsyncClient(timeout=timeout_ms / 1000.0) as client:
            resp = await client.post(
                endpoint,
                json={"message": message},
                headers={"Content-Type": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            passed = data.get("passed", True)
            msg = data.get("message", "")
            return GuardrailResult(
                passed=passed,
                message=msg,
                action="allow" if passed else "block",
            )
    except Exception as exc:
        logger.error("guardrail_custom_endpoint_error", error=str(exc)[:200])
        # Fail-open on external service errors
        return GuardrailResult(passed=True, action="allow")


# ── Register strategies ───────────────────────────────────────────────────────

STRATEGY_MAP.update({
    "keyword_block": _strategy_keyword_block,
    "regex_match": _strategy_regex_match,
    "llm_classify": _strategy_llm_classify,
    "json_schema": _strategy_json_schema,
    "max_length": _strategy_max_length,
    "pii_detection": _strategy_pii_detection,
    "custom_endpoint": _strategy_custom_endpoint,
})
