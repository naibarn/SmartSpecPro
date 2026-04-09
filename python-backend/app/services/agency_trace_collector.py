"""
AgencyTraceCollector — builds hierarchical span tree for agency run observability.

Collects timing, token, and cost data for each node execution.  Secret scrubbing
ensures no API keys or auth tokens leak into persisted traces.  Thread-safe via
asyncio.Lock for concurrent tool calls within a single agent turn.
"""

from __future__ import annotations

import asyncio
import re
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

import structlog

logger = structlog.get_logger(__name__)

# ── Secret scrubbing patterns ──────────────────────────────────────────────────

_SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"sk-[a-zA-Z0-9]{20,}"),                 # OpenAI-style API keys
    re.compile(r"Bearer\s+[a-zA-Z0-9._\-]+", re.I),     # Bearer tokens
    re.compile(r"Authorization:\s*\S+(?:\s+\S+)?", re.I), # Authorization header values (Basic/Bearer + token)
    re.compile(r"key-[a-zA-Z0-9]{20,}"),                 # generic API key patterns
    re.compile(r"postgresql://[^\s]+"),                   # connection strings
]

TOOL_OUTPUT_MAX = 1000
AGENT_OUTPUT_MAX = 2000


def scrub_secrets(text: str | None) -> str | None:
    """Replace known secret patterns with [REDACTED]."""
    if text is None:
        return None
    if not text:
        return text
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub("[REDACTED]", text)
    return text


def _truncate(text: str | None, max_len: int) -> str | None:
    if text is None:
        return None
    if len(text) <= max_len:
        return text
    return text[:max_len] + "..."


# ── Span dataclass ─────────────────────────────────────────────────────────────


@dataclass
class TraceSpan:
    """Single span representing an agent turn, tool call, or guardrail check."""

    span_id: str
    parent_span_id: str | None
    name: str
    type: str  # agent_turn | tool_call | guardrail
    start_ms: float
    end_ms: float | None = None
    duration_ms: float | None = None
    input_data: str | None = None
    output: str | None = None
    tokens: int = 0
    cost: float = 0.0
    tool_calls: list[dict[str, Any]] = field(default_factory=list)
    guardrails: list[dict[str, Any]] = field(default_factory=list)
    error: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "spanId": self.span_id,
            "parentSpanId": self.parent_span_id,
            "name": self.name,
            "type": self.type,
            "startMs": round(self.start_ms, 2),
            "endMs": round(self.end_ms, 2) if self.end_ms is not None else None,
            "durationMs": round(self.duration_ms, 2) if self.duration_ms is not None else None,
            "input": self.input_data,
            "output": self.output,
            "tokens": self.tokens,
            "cost": self.cost,
            "toolCalls": self.tool_calls,
            "guardrails": self.guardrails,
            "error": self.error,
            "metadata": self.metadata,
        }


# ── TraceCollector ─────────────────────────────────────────────────────────────


class TraceCollector:
    """Builds a hierarchical trace during an agency orchestrator run."""

    def __init__(
        self,
        run_id: str,
        agency_id: str,
        tenant_id: str,
        user_id: int | None = None,
    ) -> None:
        self.run_id = run_id
        self.agency_id = agency_id
        self.tenant_id = tenant_id
        self.user_id = user_id
        self._spans: dict[str, TraceSpan] = {}
        self._status: str = "running"
        self._run_start_ms: float = time.monotonic() * 1000
        self._lock = asyncio.Lock()

    def start_span(
        self,
        name: str,
        type: str,
        parent_span_id: str | None = None,
        input_data: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Start a new span. Returns span_id."""
        span_id = str(uuid.uuid4())
        now_ms = time.monotonic() * 1000 - self._run_start_ms
        truncated_input = _truncate(scrub_secrets(input_data), AGENT_OUTPUT_MAX)
        span = TraceSpan(
            span_id=span_id,
            parent_span_id=parent_span_id,
            name=name,
            type=type,
            start_ms=now_ms,
            input_data=truncated_input,
            metadata=dict(metadata or {}),
        )
        self._spans[span_id] = span
        return span_id

    def end_span(
        self,
        span_id: str,
        *,
        output: str | None = None,
        tokens: int = 0,
        cost: float = 0.0,
        tool_calls: list[dict[str, Any]] | None = None,
        guardrails: list[dict[str, Any]] | None = None,
        error: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        """End a span. Applies secret scrubbing and output truncation."""
        span = self._spans.get(span_id)
        if span is None:
            logger.warning("trace_end_span_not_found", span_id=span_id)
            return

        now_ms = time.monotonic() * 1000 - self._run_start_ms
        span.end_ms = now_ms
        span.duration_ms = now_ms - span.start_ms

        # Determine truncation limit based on span type
        max_len = TOOL_OUTPUT_MAX if span.type == "tool_call" else AGENT_OUTPUT_MAX
        span.output = _truncate(scrub_secrets(output), max_len)
        span.tokens = tokens
        span.cost = cost
        if tool_calls:
            span.tool_calls = tool_calls
        if guardrails:
            span.guardrails = guardrails
        if error:
            span.error = scrub_secrets(error)
        if metadata:
            span.metadata.update(metadata)

    async def start_span_async(
        self,
        name: str,
        type: str,
        parent_span_id: str | None = None,
        input_data: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Thread-safe version of start_span for concurrent tool calls."""
        async with self._lock:
            return self.start_span(name, type, parent_span_id, input_data, metadata)

    async def end_span_async(self, span_id: str, **kwargs: Any) -> None:
        """Thread-safe version of end_span for concurrent tool calls."""
        async with self._lock:
            self.end_span(span_id, **kwargs)

    def set_status(self, status: str) -> None:
        """Set the final run status: 'completed', 'failed', 'cancelled', 'timeout'."""
        self._status = status

    def get_trace_summary(self) -> dict[str, Any]:
        """Return the full trace dict suitable for INSERT into agency_run_traces."""
        total_tokens = sum(s.tokens for s in self._spans.values())
        total_cost = sum(s.cost for s in self._spans.values())
        end_ms = time.monotonic() * 1000 - self._run_start_ms
        duration_ms = round(end_ms, 2)

        spans_list = [s.to_dict() for s in self._spans.values()]

        return {
            "runId": self.run_id,
            "agencyId": self.agency_id,
            "tenantId": self.tenant_id,
            "createdBy": self.user_id,
            "trace": {
                "version": 1,
                "spans": spans_list,
            },
            "durationMs": duration_ms,
            "totalTokens": total_tokens,
            "totalCost": round(total_cost, 6),
            "status": self._status,
        }
