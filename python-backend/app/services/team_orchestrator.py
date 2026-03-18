"""
Team Orchestrator Service — executes agent turns for team conversations.

Called by Node.js backend via POST /api/team-orchestrator/execute-turn.
The Node.js promptComposer assembles the full prompt; this service
sends it to the LLM gateway and returns the response.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# System prompt injected before the composed prompt from Node.js
# ---------------------------------------------------------------------------

TURN_SYSTEM_PROMPT = (
    "You are a virtual assistant in a multi-agent team discussion. "
    "Your response should be concise, actionable, and directly address the current objective. "
    "Follow these guidelines:\n"
    "- Stay in character based on your assigned persona and role\n"
    "- Build on what previous speakers said — don't repeat their points\n"
    "- If you're the lead, synthesize findings and guide the discussion\n"
    "- If you reach consensus or have a deliverable ready, say so clearly\n"
    "- When handing off to another agent, mention them by role\n"
)

# Few-shot examples for structured turn responses
FEW_SHOT_EXAMPLES = [
    {
        "role": "user",
        "content": (
            "[Researcher] Based on our analysis, the main bottleneck is in the image processing pipeline. "
            "Processing time is 3x higher than expected due to unoptimized resize operations."
        ),
    },
    {
        "role": "assistant",
        "content": (
            "Good finding. I'll focus on the resize optimization. Two approaches:\n\n"
            "1. **Batch processing** — group images by target size to reduce context switches\n"
            "2. **WebP pre-conversion** — convert to WebP before resize (40% faster for JPEG sources)\n\n"
            "I recommend approach 2 as a quick win. @Researcher — can you benchmark both approaches? "
            "I'll draft the implementation plan while you test."
        ),
    },
]


@dataclass
class ExecuteTurnRequest:
    run_id: str
    assistant_id: str
    prompt: str
    model_id: Optional[str] = None
    tenant_id: str = ""
    user_id: int = 0
    persona_context: Optional[str] = None


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
        """Execute a single agent turn with full prompt composition."""
        try:
            if not self.llm_client:
                from app.services.llm_gateway_client import LLMGatewayClient

                self.llm_client = LLMGatewayClient()

            # Build structured message list with system prompt + few-shot + user prompt
            messages: list[dict[str, str]] = []

            # 1. System instructions
            system_content = TURN_SYSTEM_PROMPT
            if request.persona_context:
                system_content += f"\n\nYour persona: {request.persona_context}"
            messages.append({"role": "system", "content": system_content})

            # 2. Few-shot examples for response style
            messages.extend(FEW_SHOT_EXAMPLES)

            # 3. The composed prompt from Node.js (contains history + memory + objective)
            messages.append({"role": "user", "content": request.prompt})

            result = await self.llm_client.chat_completion(
                model=request.model_id or "auto",
                messages=messages,
                tenant_id=request.tenant_id,
                user_id=request.user_id,
            )

            content = ""
            if isinstance(result, dict):
                # Standard gateway response format
                choices = result.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                if not content:
                    content = result.get("content", "")

            usage = result.get("usage", {}) if isinstance(result, dict) else {}
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)

            # Extract next speaker hint from response metadata
            next_speaker_hint = None
            metadata = result.get("metadata", {}) if isinstance(result, dict) else {}
            if isinstance(metadata, dict) and "nextSpeakerHint" in metadata:
                next_speaker_hint = metadata["nextSpeakerHint"]

            # Cost estimation based on token usage
            cost_credits = (input_tokens * 0.001 + output_tokens * 0.002) / 1000

            return ExecuteTurnResponse(
                content=content,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                cost_credits=cost_credits,
                next_speaker_hint=next_speaker_hint,
                metadata=metadata if isinstance(metadata, dict) else {},
            )

        except Exception:
            # F06: Log full exception server-side, never expose str(e) to callers.
            logger.error("Team orchestrator turn failed", exc_info=True)
            return ExecuteTurnResponse(
                content="[Agent turn unavailable]",
                metadata={"error": "Agent turn unavailable"},
            )
