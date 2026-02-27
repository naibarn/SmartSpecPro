"""
PII redaction for agency inter-agent messages.

Regex-based redaction of emails, phone numbers, and SSNs.
Applied to agent-to-agent messages before storage.
User-facing final responses are NOT redacted.

Processing order: SSN first (most specific) -> phone -> email (most general).
"""

import re

# ── Compiled patterns ────────────────────────────────────────────────

# SSN: exactly NNN-NN-NNNN with word boundaries.
# Must NOT match UUIDs (8-4-4-4-12 hex) -- the 3-2-4 digit groups are unique.
_SSN_RE = re.compile(r"\b(\d{3}-\d{2}-\d{4})\b")

# Phone: 7+ digits in common formats with required separators.
# Matches: +1-555-123-4567, (555) 123-4567, 555-123-4567, 555.123.4567
# Must NOT match version numbers or UUID digit segments.
# Requires at least one separator or parentheses to distinguish from bare digit runs.
_PHONE_RE = re.compile(
    r"(?<![.\w-])"  # Not preceded by dot, word char, or hyphen (avoids UUIDs)
    r"(?:\+\d{1,3}[-.\s])?"  # Optional international prefix (requires separator)
    r"(?:"
    r"\(\d{3}\)\s?"  # (555) format with optional space
    r"|"
    r"\d{3}[-.\s]"  # 555- or 555. or "555 " (requires separator after area code)
    r")"
    r"\d{3}[-.\s]?\d{4}"  # Main number
    r"\b"
)

# Email: standard email pattern.
# Must NOT match URLs -- negative lookbehind for :// and /
_EMAIL_RE = re.compile(
    r"(?<![:\/])"  # Not preceded by :/ (avoids matching URL userinfo)
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b"
)


def redact_pii(content: str) -> tuple[str, bool]:
    """Redact PII patterns (emails, phones, SSN) from content.

    Applied to agent-to-agent messages before storage.
    User-facing final responses are NOT redacted.

    Returns:
        Tuple of (redacted_content, was_redacted).
    """
    if not content:
        return content, False

    original = content

    # Process in order: SSN (most specific) -> phone -> email (most general)
    content = _SSN_RE.sub("[SSN]", content)
    content = _PHONE_RE.sub("[PHONE]", content)
    content = _EMAIL_RE.sub("[EMAIL]", content)

    was_redacted = content != original
    return content, was_redacted
