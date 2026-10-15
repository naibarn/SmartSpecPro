"""Contract between the Agents SDK model caller and an authenticated server-side Task Control transport.

The transport owns and validates the canonical LeaseContext. This process sends only
WorkUnit/model-call identity and never constructs or serializes a lease token.
"""
from __future__ import annotations

from typing import Any, Protocol


class ModelAdmissionWait(RuntimeError):
    def __init__(self, reason: str, next_eligible_at: str, operation_key: str):
        super().__init__(f"{reason} until {next_eligible_at}")
        self.reason = reason
        self.next_eligible_at = next_eligible_at
        self.operation_key = operation_key


class ModelAdmissionDenied(RuntimeError):
    pass


class CanonicalModelAdmissionTransport(Protocol):
    def reserve(self, request: dict[str, Any]) -> dict[str, Any]: ...
    def dispatching(self, operation_key: str) -> dict[str, Any]: ...
    def thread_created(self, operation_key: str, thread_id: str) -> dict[str, Any]: ...
    def turn_started(self, operation_key: str, thread_id: str, turn_id: str) -> dict[str, Any]: ...
    def settle(self, operation_key: str, usage: dict[str, Any] | None, *, reconcile: bool = False) -> dict[str, Any]: ...
    def wait(self, operation_key: str, reason: str, next_eligible_at: str) -> None: ...


def require_ok(result: dict[str, Any], action: str) -> None:
    if not isinstance(result, dict) or result.get("kind") not in {"reserved", "recorded", "marked", "settled", "duplicate", "unknown", "reconcile_required"}:
        reason = result.get("reason", "invalid_response") if isinstance(result, dict) else "invalid_response"
        raise ModelAdmissionDenied(f"canonical model admission {action} denied: {reason}")
