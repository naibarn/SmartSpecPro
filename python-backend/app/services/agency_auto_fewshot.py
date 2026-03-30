"""Auto Few-Shot: Save high-quality runs as example conversations for agent nodes.

When a run completes with quality_score >= threshold (0.9 default), the
input/output pair is automatically saved as a few-shot example for the agent.
This enables agents to learn from their own best work.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.agentic_sanitizer import sanitize_llm_input

logger: Any = logging.getLogger(__name__)

AUTO_FEWSHOT_QUALITY_THRESHOLD = 0.9
MAX_FEWSHOT_EXAMPLES = 10
MAX_EXAMPLE_LENGTH = 2000


async def maybe_save_auto_fewshot(
    db: AsyncSession,
    tenant_id: str,
    agency_id: str,
    agent_node_id: str,
    user_input: str,
    agent_output: str,
    quality_score: float,
    quality_threshold: float = AUTO_FEWSHOT_QUALITY_THRESHOLD,
) -> bool:
    """Save input/output as a few-shot example if quality exceeds threshold.

    Returns True if an example was saved.
    """
    if quality_score < quality_threshold:
        return False

    if not user_input or not agent_output:
        return False

    # Truncate to reasonable length
    user_input = sanitize_llm_input(user_input, max_length=MAX_EXAMPLE_LENGTH)
    agent_output = sanitize_llm_input(agent_output, max_length=MAX_EXAMPLE_LENGTH)

    try:
        # Read current examples from the agent
        result = await db.execute(
            text(
                'SELECT examples FROM agency_agents '
                'WHERE id = :node_id AND "agencyId" = :agency_id '
                'AND "tenantId" = :tenant_id'
            ),
            {"node_id": agent_node_id, "agency_id": agency_id, "tenant_id": tenant_id},
        )
        row = result.fetchone()
        if not row:
            return False

        import json
        current_examples: list = []
        if row[0]:
            current_examples = row[0] if isinstance(row[0], list) else json.loads(row[0])

        if len(current_examples) >= MAX_FEWSHOT_EXAMPLES:
            # Remove oldest example to make room
            current_examples = current_examples[1:]

        # Add new example pair
        new_example = [
            {"role": "user", "content": user_input},
            {"role": "assistant", "content": agent_output},
        ]

        # Dedup: skip if very similar to existing examples
        for existing in current_examples:
            if len(existing) >= 2:
                existing_output = existing[1].get("content", "")
                if existing_output and _similarity(existing_output, agent_output) > 0.8:
                    logger.debug("auto_fewshot_skipped_duplicate")
                    return False

        current_examples.append(new_example)

        await db.execute(
            text(
                'UPDATE agency_agents SET examples = :examples::jsonb '
                'WHERE id = :node_id AND "agencyId" = :agency_id '
                'AND "tenantId" = :tenant_id'
            ),
            {
                "examples": json.dumps(current_examples),
                "node_id": agent_node_id,
                "agency_id": agency_id,
                "tenant_id": tenant_id,
            },
        )
        await db.commit()

        logger.info(
            "auto_fewshot_saved",
            agent_node_id=agent_node_id,
            quality_score=quality_score,
            total_examples=len(current_examples),
        )
        return True

    except Exception as exc:
        logger.debug("auto_fewshot_save_failed", error=str(exc)[:120])
        return False


def _similarity(a: str, b: str) -> float:
    """Quick Jaccard word similarity."""
    words_a = set(a.lower().split())
    words_b = set(b.lower().split())
    if not words_a or not words_b:
        return 0.0
    return len(words_a & words_b) / len(words_a | words_b)
