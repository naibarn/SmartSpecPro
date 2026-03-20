"""
Team Orchestrator API — FastAPI endpoint for summary generation.

Internal API: called exclusively by the Node.js backend gateway.
Auth boundary: X-Proxy-Token header verified by _verify_proxy_token.

Note: The execute-turn endpoint was removed in spec-051 section-04.
All LLM execution now goes through Node.js executeSkillLlmWithFallback().
"""

from __future__ import annotations

import secrets
from typing import Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.summary_generator import SummaryGeneratorService

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal proxy-token authentication
# ---------------------------------------------------------------------------


async def _verify_proxy_token(x_proxy_token: Optional[str] = Header(None)) -> None:
    """Verify the internal proxy token for Node.js -> Python calls."""
    if not x_proxy_token:
        raise HTTPException(status_code=401, detail="Missing proxy token")
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", None)
    if not proxy_token:
        raise HTTPException(status_code=500, detail="SMARTSPEC_PROXY_TOKEN not configured")
    if not secrets.compare_digest(x_proxy_token, proxy_token):
        raise HTTPException(status_code=401, detail="Invalid proxy token")


# ---------------------------------------------------------------------------
# Router — all routes require the proxy token
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/api/team-orchestrator",
    tags=["team-orchestrator"],
    dependencies=[Depends(_verify_proxy_token)],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class MessageItem(BaseModel):
    senderType: str = Field(max_length=64)
    content: str = Field(max_length=32_000)
    turnType: Optional[str] = Field(default=None, max_length=64)
    artifactRefsJson: Optional[list[dict]] = None


class GenerateSummaryBody(BaseModel):
    runId: str
    messages: list[MessageItem] = Field(max_length=200)
    method: str = "system_generated"
    personaContext: Optional[str] = Field(default=None, max_length=2_000)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/generate-summary")
async def generate_summary(body: GenerateSummaryBody) -> dict:
    """Generate a structured summary for a team run."""
    service = SummaryGeneratorService()
    messages_dicts = [m.model_dump() for m in body.messages]
    result = await service.generate(
        run_id=body.runId,
        messages=messages_dicts,
        method=body.method,
        persona_context=body.personaContext,
    )

    return {
        "runId": body.runId,
        "method": body.method,
        "keyDecisions": result.key_decisions,
        "keyFindings": result.key_findings,
        "artifactsProduced": result.artifacts_produced,
        "openQuestions": result.open_questions,
        "nextSteps": result.next_steps,
        "totalCost": result.total_cost,
    }
