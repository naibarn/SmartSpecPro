"""
Few-Shot Examples & Shared Instructions for Agency Agents.

Pure functions for prepending example conversations and shared instructions
into agent message histories and instructions at runtime.

Includes embedding-based relevance filtering: when an agent has >3 examples,
the current task is embedded and the top-k most similar examples are selected.
"""

from __future__ import annotations

import hashlib
import logging
from collections import OrderedDict

import numpy as np

logger = logging.getLogger(__name__)

# In-process cache: md5(text) → embedding vector. FIFO eviction at max size.
_example_embedding_cache: OrderedDict[str, list[float]] = OrderedDict()
_CACHE_MAX_SIZE = 200

FRAMING_START = "The following are example interactions for reference only:"
FRAMING_END = "End of examples. Now respond to the actual user message:"

SHARED_PREFIX = "[SHARED INSTRUCTIONS]"
SHARED_SUFFIX = "[/SHARED INSTRUCTIONS]"


def prepend_examples(
    history: list[dict],
    examples: list[list[dict]] | None,
) -> list[dict]:
    """Insert example messages at the beginning of the agent's message history.

    Each example pair is wrapped with system framing to prevent confusion
    with actual conversation history.

    Args:
        history: The agent's current message history.
        examples: List of example pairs. Each pair is a list of
            {"role": "user"|"assistant", "content": "..."} dicts.

    Returns:
        New history with examples prepended. Original list is not mutated.
    """
    if not examples:
        return history

    example_messages: list[dict] = []
    example_messages.append({"role": "system", "content": FRAMING_START})

    for pair in examples:
        for msg in pair:
            example_messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", ""),
            })

    example_messages.append({"role": "system", "content": FRAMING_END})

    return example_messages + list(history)


async def select_relevant_examples(
    examples: list[dict],
    task_text: str,
    top_k: int = 3,
) -> list[dict]:
    """Select the most relevant few-shot examples for a task via cosine similarity.

    When the number of examples is <= top_k, all examples are returned unchanged
    (no embedding calls). When >top_k, each example's ``user_message`` (or ``input``)
    field is embedded and compared against the task embedding. The top_k most
    similar examples are returned.

    Falls back to the first top_k examples if the embedding service raises.
    """
    if len(examples) <= top_k:
        return examples

    try:
        from app.orchestrator.vector_store.embedding_service import EmbeddingService

        service = EmbeddingService()
        task_embedding = await service.embed(task_text)

        scored: list[tuple[float, dict]] = []
        for ex in examples:
            ex_text = ex.get("user_message", "") or ex.get("input", "")
            if not ex_text:
                scored.append((0.0, ex))
                continue

            cache_key = hashlib.md5(ex_text.encode()).hexdigest()
            if cache_key not in _example_embedding_cache:
                # FIFO eviction before insert
                if len(_example_embedding_cache) >= _CACHE_MAX_SIZE:
                    _example_embedding_cache.popitem(last=False)
                _example_embedding_cache[cache_key] = await service.embed(ex_text)
            ex_embedding = _example_embedding_cache[cache_key]

            # Cosine similarity
            dot = float(np.dot(task_embedding, ex_embedding))
            norm = float(np.linalg.norm(task_embedding) * np.linalg.norm(ex_embedding))
            similarity = dot / norm if norm > 0 else 0.0
            scored.append((similarity, ex))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [ex for _, ex in scored[:top_k]]
    except Exception:
        logger.warning("few_shot_relevance_fallback", exc_info=True)
        return examples[:top_k]


def prepend_shared_instructions(
    agent_instructions: str,
    shared_instructions: str | None,
) -> str:
    """Prepend shared instructions to the agent's own instructions.

    Wraps shared instructions in delimiters so the LLM can distinguish
    them from agent-specific instructions.

    Args:
        agent_instructions: The agent's own instruction string.
        shared_instructions: Agency-level shared instructions, or None.

    Returns:
        Combined instructions string.
    """
    if not shared_instructions:
        return agent_instructions

    return (
        f"{SHARED_PREFIX}\n{shared_instructions}\n{SHARED_SUFFIX}\n\n"
        f"{agent_instructions}"
    )
