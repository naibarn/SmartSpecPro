"""
agency_error_handler — Error handler strategies for agency graph error_handler nodes.

Provides retry (exponential backoff), fallback (redirect or message),
skip (graceful skip with message), and terminate (raise exception).
All error payloads are scrubbed before entering context or SSE events.
"""

from __future__ import annotations

import asyncio
import re
from typing import Any, Awaitable, Callable

import structlog

logger = structlog.get_logger(__name__)

MAX_RETRIES_CAP = 5

# Patterns to strip from error payloads
SCRUB_PATTERNS: list[re.Pattern] = [
    re.compile(r"/(?:home|app|var|tmp|usr|root|etc)/[^\s\"']+"),  # Filesystem paths
    re.compile(r"postgresql://[^\s\"']+"),                # DB connection strings
    re.compile(r"mysql://[^\s\"']+"),                     # MySQL strings
    re.compile(r"redis://[^\s\"']+"),                     # Redis strings
    re.compile(r"sk-[a-zA-Z0-9]{10,}"),                  # API keys (OpenAI-style)
    re.compile(r"key-[a-zA-Z0-9]{10,}"),                 # Generic API keys
    re.compile(r"Bearer\s+[^\s\"']+", re.IGNORECASE),    # Bearer tokens
    re.compile(r"Authorization:\s*[^\s\"']+", re.IGNORECASE),  # Auth headers
    re.compile(r'File "[^"]+",\s*line \d+'),             # Stack trace frames
    re.compile(r"at\s+[\w.]+\s+\([^)]+\)"),              # JS-style stack frames
]

MAX_SCRUBBED_LENGTH = 500


class RunTerminatedError(Exception):
    """Raised when an error handler uses the 'terminate' strategy."""

    pass


def scrub_error_payload(raw: str) -> str:
    """Remove stack traces, file paths, DB connection strings, API keys.

    Returns a safe summary truncated to MAX_SCRUBBED_LENGTH chars.
    """
    result = raw
    for pattern in SCRUB_PATTERNS:
        result = pattern.sub("[REDACTED]", result)
    if len(result) > MAX_SCRUBBED_LENGTH:
        result = result[:MAX_SCRUBBED_LENGTH] + "..."
    return result


async def execute_retry(
    node_executor: Callable[..., Awaitable[str]],
    node: dict[str, Any],
    ctx: Any,
    retry_config: dict[str, Any],
    emitter: Any | None = None,
) -> str:
    """Retry the failed node with exponential backoff.

    Cap maxRetries at MAX_RETRIES_CAP. Between each retry, sleep for
    backoffMs * (backoffMultiplier ^ attempt). Emit 'error_handled' SSE event
    per attempt if emitter is provided.
    """
    max_retries = min(int(retry_config.get("maxRetries", 3)), MAX_RETRIES_CAP)
    backoff_ms = float(retry_config.get("backoffMs", 100))
    backoff_multiplier = float(retry_config.get("backoffMultiplier", 2))
    node_name = node.get("name", node.get("id", "unknown"))

    last_error: Exception | None = None
    for attempt in range(max_retries + 1):  # initial + retries
        try:
            result = await node_executor(node, ctx)
            if emitter and attempt > 0:
                await emitter.emit("error_handled", {
                    "nodeName": node_name,
                    "strategy": "retry",
                    "attempt": attempt,
                    "errorSummary": f"Succeeded on attempt {attempt + 1}",
                })
            return result
        except Exception as exc:
            last_error = exc
            if emitter:
                await emitter.emit("error_handled", {
                    "nodeName": node_name,
                    "strategy": "retry",
                    "attempt": attempt + 1,
                    "errorSummary": scrub_error_payload(str(exc)),
                })
            if attempt < max_retries:
                delay_s = (backoff_ms * (backoff_multiplier**attempt)) / 1000
                logger.info(
                    "agency_error_handler_retry",
                    node_name=node_name,
                    attempt=attempt + 1,
                    delay_s=delay_s,
                )
                await asyncio.sleep(delay_s)

    # All retries exhausted
    raise last_error  # type: ignore[misc]


def execute_fallback(
    fallback_node_id: str | None,
    fallback_message: str | None,
    error: Exception,
) -> tuple[str | None, str | None]:
    """Return (result, redirect_node_id).

    If fallbackNodeId exists, return it for the orchestrator to route to.
    Otherwise return fallbackMessage as result.
    Scrub the error before storing in context.
    """
    scrubbed = scrub_error_payload(str(error))

    if fallback_node_id:
        return (None, fallback_node_id)

    message = fallback_message or f"Fallback: {scrubbed}"
    return (message, None)


def execute_skip(skip_message: str | None) -> str:
    """Return the skip message or a default."""
    return skip_message or "Step skipped due to error"


def execute_terminate(node_name: str, error: Exception) -> None:
    """Raise a RunTerminatedError with the failed node name."""
    scrubbed = scrub_error_payload(str(error))
    raise RunTerminatedError(f"Run terminated at node '{node_name}': {scrubbed}")
