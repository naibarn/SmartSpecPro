"""
Few-Shot Examples & Shared Instructions for Agency Agents.

Pure functions for prepending example conversations and shared instructions
into agent message histories and instructions at runtime.
"""

from __future__ import annotations

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
