"""Structured agency result envelope parsing and validation."""

from __future__ import annotations

import json
import re
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError


AgencyIntent = Literal[
    "chat_reply",
    "research_report",
    "ticket_comparison",
    "hotel_comparison",
    "shortlist",
    "video_storyboard",
    "presentation_deck",
    "media_prompt",
]

_ENVELOPE_FENCE_RE = re.compile(
    r"```(?:agency-result|agency_result|json)\s*(\{.*?\})\s*```",
    re.IGNORECASE | re.DOTALL,
)


class AgencyArtifactDescriptor(BaseModel):
    """Descriptor for a generated artifact referenced by an envelope."""

    model_config = ConfigDict(extra="forbid")

    artifact_type: str = Field(min_length=1, max_length=100)
    title: str | None = Field(default=None, max_length=255)
    metadata: dict[str, Any] = Field(default_factory=dict)


class AgencyReference(BaseModel):
    """Source provenance entry included with a structured result."""

    model_config = ConfigDict(extra="forbid")

    source_title: str = Field(min_length=1, max_length=255)
    source_id: str = Field(min_length=1, max_length=255)
    chunk_refs: list[str] = Field(default_factory=list)
    source_uri: str | None = Field(default=None, max_length=2000)
    support_summary: str | None = Field(default=None, max_length=2000)


class AgencyResultEnvelope(BaseModel):
    """Canonical structured payload emitted by agency runs."""

    model_config = ConfigDict(extra="forbid")

    version: str = Field(default="1.0", min_length=1, max_length=20)
    intent: AgencyIntent
    summary: str = Field(min_length=1, max_length=20_000)
    payload: dict[str, Any] = Field(default_factory=dict)
    artifacts: list[AgencyArtifactDescriptor] = Field(default_factory=list)
    references: list[AgencyReference] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class AgencyEnvelopeParseOutcome(BaseModel):
    """Parsed result plus normalized text fallback."""

    found: bool
    valid: bool
    text_response: str
    envelope: AgencyResultEnvelope | None = None
    error: str | None = None


def _extract_candidate(text: str) -> tuple[str | None, str]:
    match = _ENVELOPE_FENCE_RE.search(text)
    if match:
        surrounding_text = f"{text[:match.start()]}{text[match.end():]}".strip()
        return match.group(1).strip(), surrounding_text

    stripped = text.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        return stripped, ""

    return None, stripped


def parse_agency_result_envelope(raw_response: str) -> AgencyEnvelopeParseOutcome:
    """Parse and validate an agency envelope without breaking text fallback."""

    text = (raw_response or "").strip()
    candidate, surrounding_text = _extract_candidate(text)
    if not candidate:
        return AgencyEnvelopeParseOutcome(
            found=False,
            valid=False,
            text_response=text,
        )

    try:
        parsed = json.loads(candidate)
    except json.JSONDecodeError as exc:
        return AgencyEnvelopeParseOutcome(
            found=True,
            valid=False,
            text_response=text,
            error=f"invalid_json: {exc.msg}",
        )

    try:
        envelope = AgencyResultEnvelope.model_validate(parsed)
    except ValidationError as exc:
        error_messages = "; ".join(
            f"{'.'.join(str(part) for part in err['loc'])}: {err['msg']}"
            for err in exc.errors()
        )
        return AgencyEnvelopeParseOutcome(
            found=True,
            valid=False,
            text_response=surrounding_text or text,
            error=error_messages,
        )

    return AgencyEnvelopeParseOutcome(
        found=True,
        valid=True,
        text_response=surrounding_text or envelope.summary,
        envelope=envelope,
    )
