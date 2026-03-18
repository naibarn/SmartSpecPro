"""
Summary Generator — generates structured run summaries via LLM.

Supports agent-generated (with persona) and system-generated (neutral) methods.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class RunSummaryResult:
    objective: Optional[str] = None
    key_decisions: list[str] = field(default_factory=list)
    key_findings: list[str] = field(default_factory=list)
    artifacts_produced: list[str] = field(default_factory=list)
    open_questions: list[str] = field(default_factory=list)
    next_steps: list[str] = field(default_factory=list)
    total_cost: float = 0.0
    total_duration_ms: int = 0


class SummaryGeneratorService:
    """Generates structured run summaries."""

    def __init__(self, llm_client=None):
        self.llm_client = llm_client

    async def generate(
        self,
        run_id: str,
        messages: list[dict],
        method: str = "system_generated",
        persona_context: Optional[str] = None,
    ) -> RunSummaryResult:
        """Generate a summary for the given run messages."""
        if method == "extractive":
            return self._extractive_summary(messages)

        # LLM-based summary — build role-structured messages (F04/F05)
        llm_messages = self._build_messages(messages, method, persona_context)

        try:
            if not self.llm_client:
                from app.services.llm_gateway_client import LLMGatewayClient

                self.llm_client = LLMGatewayClient()

            result = await self.llm_client.chat(
                model="auto",
                messages=llm_messages,
            )

            content = result.get("content", "")
            return self._parse_summary(content)

        except Exception as e:
            logger.error("Summary generation failed: %s", e)
            return self._extractive_summary(messages)

    def _extractive_summary(self, messages: list[dict]) -> RunSummaryResult:
        """Extract key points without LLM."""
        decisions = []
        findings = []
        artifacts = []

        for msg in messages:
            turn_type = msg.get("turnType", "")
            content = msg.get("content", "")[:500]

            if turn_type == "decision":
                decisions.append(content)
            elif turn_type in ("summary", "execution_update"):
                findings.append(content)

            refs = msg.get("artifactRefsJson")
            if isinstance(refs, list):
                for ref in refs:
                    if isinstance(ref, dict):
                        artifacts.append(ref.get("name", "Unnamed"))

        return RunSummaryResult(
            key_decisions=decisions,
            key_findings=findings,
            artifacts_produced=artifacts,
        )

    def _build_messages(
        self, messages: list[dict], method: str, persona_context: Optional[str]
    ) -> list[dict]:
        """
        Build role-structured message list for the LLM call.

        F04/F05 — System instructions live in the system message only.
        User-supplied persona_context is passed as a separate user-role message
        (prefixed with a label) so it cannot override system instructions.
        The conversation transcript is always in a user-role message.
        """
        conversation = "\n".join(
            f"[{m.get('senderType', 'unknown')}] {m.get('content', '')[:300]}"
            for m in messages[-50:]  # Last 50 messages
        )

        llm_messages: list[dict] = [
            {
                "role": "system",
                "content": (
                    "You are a neutral summarization assistant. "
                    "Summarize the provided team conversation into a structured format. "
                    "Provide: key decisions, key findings, artifacts produced, "
                    "open questions, and next steps."
                ),
            }
        ]

        # If agent-generated, inject persona as a labelled user message — never into system.
        if method == "agent_generated" and persona_context:
            llm_messages.append(
                {
                    "role": "user",
                    "content": f"[Persona context provided by requester]: {persona_context}",
                }
            )

        llm_messages.append(
            {
                "role": "user",
                "content": f"[Conversation transcript to summarize]:\n{conversation}",
            }
        )

        return llm_messages

    def _parse_summary(self, content: str) -> RunSummaryResult:
        """Parse LLM output into structured summary."""
        # Simple extraction — could be improved with structured output
        lines = content.strip().split("\n")
        decisions = [l.strip("- ") for l in lines if "decision" in l.lower()]
        findings = [l.strip("- ") for l in lines if "finding" in l.lower()]

        return RunSummaryResult(
            key_decisions=decisions[:10],
            key_findings=findings[:10],
        )
