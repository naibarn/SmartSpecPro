"""Fenced execution context for legacy Python status projections.

Legacy task functions still expose task-specific status helpers while their
transport is migrated.  In hard cutover those helpers must write a bounded
projection through the canonical lease, never Redis.  A ContextVar keeps the
bridge local to the currently executing task and prevents an arbitrary caller
from reporting against a job it does not own.
"""

from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any

from app.services.job_control_plane import JobControlPlaneClient, LeaseContext


@dataclass(frozen=True)
class ActiveJobExecution:
    job_id: str
    task_ids: frozenset[str]
    user_id: int | None
    client: JobControlPlaneClient
    lease: LeaseContext


_active_execution: ContextVar[ActiveJobExecution | None] = ContextVar(
    "feature_186_active_job_execution",
    default=None,
)


def bind_job_execution(
    *,
    job_id: str,
    task_ids: set[str] | frozenset[str],
    user_id: int | None,
    client: JobControlPlaneClient,
    lease: LeaseContext,
) -> Token[ActiveJobExecution | None]:
    """Bind one canonical lease to the current legacy task invocation."""
    return _active_execution.set(
        ActiveJobExecution(
            job_id=job_id,
            task_ids=frozenset(item for item in task_ids if item),
            user_id=user_id,
            client=client,
            lease=lease,
        )
    )


def reset_job_execution(token: Token[ActiveJobExecution | None]) -> None:
    _active_execution.reset(token)


def current_user_id() -> int | None:
    active = _active_execution.get()
    return active.user_id if active else None


def current_canonical_job() -> tuple[str, str] | None:
    """Return the canonical job and attempt for durable external settlement."""
    active = _active_execution.get()
    if active is None:
        return None
    return active.job_id, active.lease.attempt_id


def report_legacy_status(task_id: str, status: dict[str, Any]) -> bool:
    """Report a legacy status if the task is running under a fenced lease.

    ``False`` means the caller is outside a canonical execution context.  In
    hard cutover callers must treat that as a no-op rather than touching Redis;
    in compatibility mode the task modules retain their existing Redis path.
    """
    active = _active_execution.get()
    if active is None or task_id not in active.task_ids:
        return False
    active.client.report_legacy_status(active.lease, status)
    return True
