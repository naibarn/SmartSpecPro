"""Contract between the Agents SDK model caller and an authenticated server-side Task Control transport.

The transport owns and validates the canonical LeaseContext. This process sends only
WorkUnit/model-call identity and never constructs or serializes a lease token.
"""
from __future__ import annotations

import json
import os
import fcntl
import stat
import threading
from typing import Any, Protocol


class ModelAdmissionWait(RuntimeError):
    def __init__(self, reason: str, next_eligible_at: str, operation_key: str):
        super().__init__(f"{reason} until {next_eligible_at}")
        self.reason = reason
        self.next_eligible_at = next_eligible_at
        self.operation_key = operation_key


class ModelAdmissionDenied(RuntimeError):
    pass


def validate_private_admission_fds(response_fd: int, request_fd: int) -> None:
    """Validate the fixed private duplex pipe before entering model execution."""
    if response_fd != 3 or request_fd != 4:
        raise ModelAdmissionDenied("canonical admission requires response FD 3 and request FD 4")
    descriptors = []
    for descriptor, expected_access, label in ((response_fd, os.O_RDONLY, "response"),
                                                (request_fd, os.O_WRONLY, "request")):
        try:
            info = os.fstat(descriptor)
            flags = fcntl.fcntl(descriptor, fcntl.F_GETFL)
        except OSError as exc:
            raise ModelAdmissionDenied(f"canonical admission {label} FD is unavailable") from exc
        if not (stat.S_ISFIFO(info.st_mode) or stat.S_ISSOCK(info.st_mode)):
            raise ModelAdmissionDenied(f"canonical admission {label} FD is not a private pipe")
        descriptors.append((info.st_dev, info.st_ino))
        # Node child_process stdio pipes are duplex socketpairs (O_RDWR) even
        # though this protocol assigns one logical direction to each FD.
        # Anonymous FIFOs do expose their access direction and can be checked.
        if stat.S_ISFIFO(info.st_mode) and flags & os.O_ACCMODE != expected_access:
            raise ModelAdmissionDenied(f"canonical admission {label} FD has the wrong direction")
    if descriptors[0] == descriptors[1]:
        raise ModelAdmissionDenied("canonical admission response and request FDs must be distinct")


class CanonicalModelAdmissionTransport(Protocol):
    def reserve(self, request: dict[str, Any]) -> dict[str, Any]: ...
    def dispatching(self, operation_key: str) -> dict[str, Any]: ...
    def thread_created(self, operation_key: str, thread_id: str) -> dict[str, Any]: ...
    def turn_started(self, operation_key: str, thread_id: str, turn_id: str) -> dict[str, Any]: ...
    def settle(self, operation_key: str, usage: dict[str, Any] | None, *, reconcile: bool = False) -> dict[str, Any]: ...
    def provider_capacity(self, operation_key: str, evidence: dict[str, Any]) -> dict[str, Any]: ...
    def wait(self, operation_key: str, reason: str, next_eligible_at: str, evidence: dict[str, Any] | None = None) -> None: ...


def require_ok(result: dict[str, Any], action: str) -> None:
    if not isinstance(result, dict) or result.get("kind") not in {"reserved", "recorded", "marked", "settled", "duplicate", "unknown", "reconcile_required"}:
        reason = result.get("reason", "invalid_response") if isinstance(result, dict) else "invalid_response"
        raise ModelAdmissionDenied(f"canonical model admission {action} denied: {reason}")


class FdCanonicalModelAdmissionTransport:
    """Private parent/child RPC over an inherited duplex pipe; no lease material crosses it."""

    def __init__(self, read_fd: int = 3, write_fd: int = 4):
        validate_private_admission_fds(read_fd, write_fd)
        self._reader = os.fdopen(read_fd, "r", encoding="utf-8", buffering=1, closefd=False)
        self._writer = os.fdopen(write_fd, "w", encoding="utf-8", buffering=1, closefd=False)
        self._lock = threading.Lock()
        self._request_id = 0

    def _call(self, method: str, **arguments: Any) -> dict[str, Any]:
        with self._lock:
            self._request_id += 1
            request_id = self._request_id
            self._writer.write(json.dumps({"id": request_id, "method": method, "arguments": arguments}, separators=(",", ":")) + "\n")
            self._writer.flush()
            for line in self._reader:
                if len(line.encode("utf-8")) > 64_000:
                    raise ModelAdmissionDenied("canonical admission response exceeded transport limit")
                try:
                    response = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise ModelAdmissionDenied("invalid canonical admission response") from exc
                if not isinstance(response, dict) or response.get("id") != request_id:
                    raise ModelAdmissionDenied("canonical admission response identity mismatch")
                if response.get("error"):
                    raise ModelAdmissionDenied("canonical admission transport operation failed")
                result = response.get("result")
                if not isinstance(result, dict):
                    raise ModelAdmissionDenied("canonical admission returned an invalid result")
                return result
            raise ModelAdmissionDenied("canonical admission transport closed before response")

    def reserve(self, request: dict[str, Any]) -> dict[str, Any]:
        return self._call("reserve", request=request)

    def dispatching(self, operation_key: str) -> dict[str, Any]:
        return self._call("dispatching", operationKey=operation_key)

    def thread_created(self, operation_key: str, thread_id: str) -> dict[str, Any]:
        return self._call("threadCreated", operationKey=operation_key, threadId=thread_id)

    def turn_started(self, operation_key: str, thread_id: str, turn_id: str) -> dict[str, Any]:
        return self._call("turnStarted", operationKey=operation_key, threadId=thread_id, turnId=turn_id)

    def settle(self, operation_key: str, usage: dict[str, Any] | None, *, reconcile: bool = False) -> dict[str, Any]:
        return self._call("settle", operationKey=operation_key, usage=usage, reconcile=reconcile)

    def provider_capacity(self, operation_key: str, evidence: dict[str, Any]) -> dict[str, Any]:
        return self._call("providerCapacity", operationKey=operation_key, evidence=evidence)

    def wait(self, operation_key: str, reason: str, next_eligible_at: str, evidence: dict[str, Any] | None = None) -> None:
        result = self._call("wait", operationKey=operation_key, reason=reason, nextEligibleAt=next_eligible_at, evidence=evidence or {})
        if result.get("kind") != "waiting":
            raise ModelAdmissionDenied("canonical Task Control refused durable wait")
