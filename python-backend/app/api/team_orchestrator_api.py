"""
Team Orchestrator API — FastAPI endpoints for turn execution and summary generation.

Internal API: called exclusively by the Node.js backend gateway.
Auth boundary: X-Proxy-Token header verified by _verify_proxy_token (F01).
tenantId/userId are supplied by the Node.js gateway from its own JWT session —
clients never supply these values directly (F09).
"""

from __future__ import annotations

import secrets
from typing import Annotated, Optional

import structlog
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from app.core.config import settings
from app.services.summary_generator import SummaryGeneratorService
from app.services.team_orchestrator import ExecuteTurnRequest, TeamOrchestratorService

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Internal proxy-token authentication (F01)
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
# Router — all routes require the proxy token (F01)
# ---------------------------------------------------------------------------

router = APIRouter(
    prefix="/api/team-orchestrator",
    tags=["team-orchestrator"],
    dependencies=[Depends(_verify_proxy_token)],
)

# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------


class ExecuteTurnBody(BaseModel):
    runId: str
    assistantId: str
    prompt: str
    modelId: Optional[str] = None
    # F09: tenantId/userId are forwarded by the Node.js gateway from its JWT
    # session — not client-supplied. Kept here as typed fields so the gateway
    # can propagate them for per-tenant LLM routing.
    tenantId: str
    userId: int


class ExecuteTurnResponseBody(BaseModel):
    content: str
    tokenUsage: dict
    costCredits: float
    nextSpeakerHint: Optional[str] = None
    metadata: dict = {}


# F07: Typed MessageItem replaces bare list[dict] — prevents unvalidated arbitrary
# payloads from reaching the summary generator.
class MessageItem(BaseModel):
    senderType: str = Field(max_length=64)
    content: str = Field(max_length=32_000)
    turnType: Optional[str] = Field(default=None, max_length=64)
    artifactRefsJson: Optional[list[dict]] = None


class GenerateSummaryBody(BaseModel):
    runId: str
    # F07: messages is now list[MessageItem] with an item cap, not list[dict].
    messages: list[MessageItem] = Field(max_length=200)
    method: str = "system_generated"
    personaContext: Optional[str] = Field(default=None, max_length=2_000)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("/execute-turn", response_model=ExecuteTurnResponseBody)
async def execute_turn(body: ExecuteTurnBody) -> ExecuteTurnResponseBody:
    """Execute a single agent turn in a team conversation."""
    service = TeamOrchestratorService()
    result = await service.execute_turn(
        ExecuteTurnRequest(
            run_id=body.runId,
            assistant_id=body.assistantId,
            prompt=body.prompt,
            model_id=body.modelId,
            tenant_id=body.tenantId,
            user_id=body.userId,
        )
    )

    return ExecuteTurnResponseBody(
        content=result.content,
        tokenUsage={
            "inputTokens": result.input_tokens,
            "outputTokens": result.output_tokens,
        },
        costCredits=result.cost_credits,
        nextSpeakerHint=result.next_speaker_hint,
        metadata=result.metadata,
    )


@router.post("/generate-summary")
async def generate_summary(body: GenerateSummaryBody) -> dict:
    """Generate a structured summary for a team run."""
    service = SummaryGeneratorService()
    # Convert validated MessageItem objects back to plain dicts for the service layer.
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
