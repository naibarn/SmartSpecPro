"""Standalone safety filter for agency memory content.

Extracted from LongTermMemoryService._safety_filter() so it can be reused
by both long_term_memory.py (L1 facts) and agency_chunk_service.py (L2 chunks).
"""

from __future__ import annotations

UNSAFE_PATTERNS = [
    "ignore previous", "ignore all instructions", "ignore the above",
    "always output", "always ignore", "always respond",
    "disregard", "override instructions", "override the",
    "you must always", "you must never", "you are now",
    "from now on", "forget everything", "forget your",
    "new instructions", "updated instructions", "system prompt",
    "act as", "pretend to be", "role play as",
    "do not follow", "do not obey", "bypass",
    "jailbreak", "dan mode", "developer mode",
    "output the system", "reveal your", "show me your prompt",
    "repeat after me", "say exactly",
]

IMPERATIVE_STARTS = [
    "you must", "you should always", "you will", "you are",
    "always ", "never ", "do not ", "don't ",
]

IMPERATIVE_VERBS = ["must", "shall", "always", "never", "ensure", "require", "mandate"]


async def memory_safety_filter(content: str) -> bool:
    """Heuristic + structural safety check. Returns True if content is safe to store.

    Rejects content that contains instructions, commands, role-playing prompts,
    or attempts to manipulate agent behavior.
    """
    content_lower = content.lower().strip()

    # Pattern-based rejection
    for pattern in UNSAFE_PATTERNS:
        if pattern in content_lower:
            return False

    # Structural rejection — imperative commands directed at the agent
    for prefix in IMPERATIVE_STARTS:
        if content_lower.startswith(prefix):
            return False

    # Length-based rejection — very short content is likely a command, not a fact
    if len(content.strip()) < 10:
        return False

    # Ratio check — content with many imperative verbs is suspicious
    verb_count = sum(1 for v in IMPERATIVE_VERBS if v in content_lower)
    word_count = len(content_lower.split())
    if word_count > 0 and verb_count / word_count > 0.15:
        return False

    return True
