"""
Internal Guardrails API — service-to-service endpoint for testing guardrails.

Called by Node.js tRPC testGuardrail procedure via X-Internal-Token auth.
"""

from __future__ import annotations

import secrets
import re
from dataclasses import dataclass
from typing import Any, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings

@dataclass
class GuardrailDefinition:
    id: str
    name: str
    type: str
    mode: str
    strategy: str
    config: dict[str, Any]


@dataclass
class GuardrailResult:
    passed: bool
    message: str = ""
    action: str = "allow"
    redacted_message: Optional[str] = None


async def execute_guardrails(
    guardrails: list[GuardrailDefinition],
    message: str,
    phase: str,
) -> GuardrailResult:
    """Small HTTP-safe guardrail evaluator; agent execution is owned by Agents API."""
    for guardrail in guardrails:
        config = guardrail.config or {}
        strategy = guardrail.strategy
        if strategy == "max_length" and len(message) > int(config.get("max_length", 10000)):
            return GuardrailResult(False, "Message exceeds the configured length", "block")
        if strategy == "keyword_block":
            keywords = [str(item).lower() for item in config.get("keywords", [])]
            if any(keyword and keyword in message.lower() for keyword in keywords):
                return GuardrailResult(False, "Blocked keyword detected", "block")
        if strategy == "regex_match":
            pattern = str(config.get("pattern", ""))
            if pattern and re.search(pattern, message):
                return GuardrailResult(False, "Blocked pattern detected", "block")
    return GuardrailResult(True)

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/internal/guardrails", tags=["Internal Guardrails"])


# ── Auth ──────────────────────────────────────────────────────────────────────


async def _verify_internal_token(
    x_internal_token: Optional[str] = Header(None),
) -> bool:
    """Verify service-to-service token."""
    expected = settings.SMARTSPEC_WEB_GATEWAY_TOKEN
    if not expected:
        raise HTTPException(status_code=500, detail="Gateway token not configured")
    if not x_internal_token:
        raise HTTPException(status_code=401, detail="Missing X-Internal-Token")
    if not secrets.compare_digest(x_internal_token, expected):
        raise HTTPException(status_code=401, detail="Invalid token")
    return True


# ── Models ────────────────────────────────────────────────────────────────────


ALLOWED_STRATEGIES = {
    "keyword_block", "regex_match", "llm_classify", "json_schema",
    "max_length", "pii_detection", "custom_endpoint",
}


class GuardrailTestRequest(BaseModel):
    strategy: str = Field(..., min_length=1, max_length=30)
    config: dict[str, Any] = Field(default_factory=dict)
    message: str = Field(..., min_length=1, max_length=50000)


class GuardrailTestResponse(BaseModel):
    passed: bool
    message: str = ""
    action: str = "allow"
    redactedMessage: Optional[str] = None


# ── Endpoint ──────────────────────────────────────────────────────────────────


@router.post("/test", response_model=GuardrailTestResponse)
async def test_guardrail(
    request: GuardrailTestRequest,
    _auth: bool = Depends(_verify_internal_token),
) -> GuardrailTestResponse:
    """Test a single guardrail strategy against a sample message."""
    if request.strategy not in ALLOWED_STRATEGIES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown strategy '{request.strategy}'. Allowed: {sorted(ALLOWED_STRATEGIES)}",
        )

    guardrail = GuardrailDefinition(
        id="test-0",
        name="Test Guardrail",
        type="input",
        mode="strict",
        strategy=request.strategy,
        config=request.config,
    )

    try:
        result = await execute_guardrails(
            [guardrail],
            request.message,
            "input",
        )
    except Exception as exc:
        logger.error("guardrail_test_error", error=str(exc)[:200])
        raise HTTPException(status_code=500, detail=f"Guardrail test failed: {str(exc)[:200]}")

    return GuardrailTestResponse(
        passed=result.passed,
        message=result.message,
        action=result.action,
        redactedMessage=result.redacted_message,
    )
