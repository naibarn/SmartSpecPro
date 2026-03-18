"""
Team Orchestrator Service — executes agent turns for team conversations.

Called by Node.js backend via POST /api/team-orchestrator/execute-turn.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ExecuteTurnRequest:
    run_id: str
    assistant_id: str
    prompt: str
    model_id: Optional[str] = None
    tenant_id: str = ""
    user_id: int = 0


@dataclass
class ExecuteTurnResponse:
    content: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_credits: float = 0.0
    next_speaker_hint: Optional[str] = None
    metadata: dict = field(default_factory=dict)


class TeamOrchestratorService:
    """Executes agent turns by calling the LLM gateway."""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def execute_turn(self, request: ExecuteTurnRequest) -> ExecuteTurnResponse:
        """Execute a single agent turn."""
        try:
            if not self.llm_client:
                from app.services.llm_gateway_client import LLMGatewayClient

                self.llm_client = LLMGatewayClient()

            result = await self.llm_client.chat(
                model=request.model_id or "auto",
                messages=[{"role": "user", "content": request.prompt}],
                tenant_id=request.tenant_id,
                user_id=request.user_id,
            )

            content = result.get("content", "")
            usage = result.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            # Extract next speaker hint from response metadata
            next_speaker_hint = None
            if "metadata" in result and "nextSpeakerHint" in result["metadata"]:
                next_speaker_hint = result["metadata"]["nextSpeakerHint"]

            # Estimate cost (simplified)
            cost_credits = (input_tokens * 0.001 + output_tokens * 0.002) / 1000

            return ExecuteTurnResponse(
                content=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_credits=cost_credits,
                next_speaker_hint=next_speaker_hint,
                metadata=result.get("metadata", {}),
            )

        except Exception as e:
            # F06: Log full exception server-side, never expose str(e) to callers.
            logger.error("Team orchestrator turn failed", exc_info=True)
            return ExecuteTurnResponse(
                content="[Agent turn unavailable]",
                metadata={"error": "Agent turn unavailable"},
            )
