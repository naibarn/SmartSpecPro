"""Prompt injection prevention for agentic loops.

Strips known injection markers and non-printable characters from
content entering LLM calls within agentic execution.
"""

import re

# Compiled patterns: (regex, replacement)
_INJECTION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # System/instruction markers
    (re.compile(r"\[SYSTEM\]", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"\[/SYSTEM\]", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"\[INST\]", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"\[/INST\]", re.IGNORECASE), "[FILTERED]"),
    # OpenAI special tokens
    (re.compile(r"<\|im_start\|>", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"<\|im_end\|>", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"<\|endoftext\|>", re.IGNORECASE), "[FILTERED]"),
    # Common injection phrases
    (re.compile(r"Ignore previous instructions", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"You are now\s", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"Disregard all prior", re.IGNORECASE), "[FILTERED]"),
    (re.compile(r"IMPORTANT:\s*Override", re.IGNORECASE), "[FILTERED]"),
]

# Matches non-printable chars except \n, \t, \r and extended Unicode
_NON_PRINTABLE_RE = re.compile(r"[^\x20-\x7E\n\t\r\u0080-\uFFFF]")


def sanitize_llm_input(text: str | None, max_length: int = 10000) -> str:
    """Sanitize text for safe injection into LLM agentic loops.

    Args:
        text: Input text to sanitize. None is treated as empty string.
        max_length: Maximum output length (default 10000).

    Processing pipeline:
    1. Early return for empty/None input
    2. Strip non-printable characters (keep newline, tab, carriage return)
    3. Replace known injection patterns with [FILTERED]
    4. Truncate to max_length
    """
    if not text:
        return ""

    # Strip non-printable characters
    result = _NON_PRINTABLE_RE.sub("", text)

    # Replace injection patterns
    for pattern, replacement in _INJECTION_PATTERNS:
        result = pattern.sub(replacement, result)

    # Truncate
    if len(result) > max_length:
        result = result[:max_length]

    return result
