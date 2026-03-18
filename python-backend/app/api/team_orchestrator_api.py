"""
Team Orchestrator API — FastAPI endpoints for turn execution and summary generation.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.services.team_orchestrator import TeamOrchestratorService, ExecuteTurnRequest
from app.services.summary_generator import SummaryGeneratorService

router = APIRouter(prefix="/api/team-orchestrator", tags=["team-orchestrator"])


class ExecuteTurnBody(BaseModel):
    runId: str
    assistantId: str
    prompt: str
    modelId: Optional[str] = None
    tenantId: str
    userId: int


class ExecuteTurnResponseBody(BaseModel):
    content: str
    tokenUsage: dict
    costCredits: float
    nextSpeakerHint: Optional[str] = None
    metadata: dict = {}


class GenerateSummaryBody(BaseModel):
    runId: str
    messages: list[dict]
    method: str = "system_generated"
    personaContext: Optional[str] = None


@router.post("/execute-turn", response_model=ExecuteTurnResponseBody)
async def execute_turn(body: ExecuteTurnBody):
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
async def generate_summary(body: GenerateSummaryBody):
    """Generate a structured summary for a team run."""
    service = SummaryGeneratorService()
    result = await service.generate(
        run_id=body.runId,
        messages=body.messages,
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
