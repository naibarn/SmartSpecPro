"""
F09 Cross-Agency Communication Tool.

Allows one agency to invoke another agency as a sub-agent during execution.
Enforces:
  - Tenant isolation (generic "not found" response to prevent info leakage)
  - RBAC (visibility check + agency_permissions table)
  - Allowlist (user-configured list of permitted target agencies)
  - Depth limit (hard cap: MAX_ABSOLUTE_DEPTH = 3)
  - Loop prevention (Redis callChain set, TTL=600s)
  - Budget cap (Redis INCRBYFLOAT, 500 credits per parent run)
  - Concurrency limit (Redis semaphore, max 2 per parent run)

Feature flag: `crossAgency` (default: false) — checked by the caller
(Node.js agency.ts passes feature flag state through toolConfig).
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any, Optional

import structlog
from sqlalchemy import text

from app.services.agency_audit import log_agency_event

logger = structlog.get_logger(__name__)

# ── Constants ──────────────────────────────────────────────────────────────

MAX_ABSOLUTE_DEPTH = 3
DEFAULT_BUDGET_CAP = 500  # credits
CALLCHAIN_TTL = 600       # seconds
SEMAPHORE_MAX = 2         # max concurrent sub-calls per parent run
DEFAULT_TIMEOUT = 120     # seconds
SEM_TTL = 600             # seconds


class AgencyCallError(Exception):
    """Raised when a cross-agency call is rejected (tenant, RBAC, depth, loop, budget, concurrency, allowlist)."""


# ── Validation functions ───────────────────────────────────────────────────


async def validate_tenant_isolation(
    db_session: Any,
    target_agency_id: str,
    caller_tenant_id: str,
) -> dict:
    """Check target agency exists and belongs to caller's tenant.

    Returns the agency row as a dict if valid.
    Raises AgencyCallError with generic 'Agency not found' to prevent
    cross-tenant information leakage.
    """
    result = await db_session.execute(
        text(
            'SELECT id, "tenantId", visibility, "createdBy", status '
            'FROM agencies WHERE id = :agency_id AND "tenantId" = :tenant_id'
        ),
        {"agency_id": target_agency_id, "tenant_id": caller_tenant_id},
    )
    row = result.fetchone()
    if row is None:
        raise AgencyCallError("Agency not found.")

    # Convert Row to dict
    if hasattr(row, "_mapping"):
        return dict(row._mapping)
    return dict(row)


async def check_rbac(
    db_session: Any,
    agency_row: dict,
    user_id: int,
    tenant_id: str,
) -> None:
    """Independent RBAC check on target agency based on visibility.

    - public: any user in the tenant can call it
    - shared: user must be in a group with agency_permissions entry
    - private: only the creator can call it

    Raises AgencyCallError if user lacks execute permission.
    """
    visibility = agency_row.get("visibility", "private")
    status = agency_row.get("status", "draft")

    if status not in ("active", "draft"):
        raise AgencyCallError("Agency not found.")

    if visibility == "public":
        return  # any tenant user

    if visibility == "private":
        if agency_row.get("createdBy") != user_id:
            raise AgencyCallError("Access denied: insufficient permissions to call this agency.")
        return

    if visibility == "shared":
        # Check agency_permissions: user must be in a group that has permission
        result = await db_session.execute(
            text(
                "SELECT 1 FROM agency_permissions ap "
                "JOIN user_group_members ugm ON ugm.group_id = ap.group_id "
                'WHERE ap."agencyId" = :agency_id AND ugm.user_id = :user_id LIMIT 1'
            ),
            {"agency_id": agency_row["id"], "user_id": user_id},
        )
        if result.fetchone() is None:
            raise AgencyCallError("Access denied: insufficient permissions to call this agency.")
        return

    raise AgencyCallError(f"Unknown agency visibility: {visibility!r}")


async def check_allowed_agencies(
    allowed_agencies: list[str],
    target_agency_id: str,
) -> None:
    """Check target agency is in the user-configured allowlist.

    Empty allowedAgencies = DENY ALL (safe default).

    Raises AgencyCallError if target is not in the list.
    """
    if not allowed_agencies:
        raise AgencyCallError(
            "No allowed agencies configured — all cross-agency calls denied. "
            "Configure allowedAgencies in the tool settings."
        )
    if target_agency_id not in allowed_agencies:
        raise AgencyCallError(
            f"Agency '{target_agency_id}' is not allowed by the configured allowedAgencies list."
        )


async def check_depth(current_depth: int, max_depth: int) -> None:
    """Reject if current_depth >= max_depth (hard cap: MAX_ABSOLUTE_DEPTH).

    Raises AgencyCallError if depth is at or exceeds the limit.
    """
    effective_max = min(max_depth, MAX_ABSOLUTE_DEPTH)
    if current_depth >= effective_max:
        raise AgencyCallError(
            f"Cross-agency depth limit reached: currentDepth={current_depth}, "
            f"maxDepth={effective_max}. Increase maxDepth or reduce nesting."
        )


async def check_loop(
    redis: Any,
    parent_run_id: str,
    target_agency_id: str,
) -> None:
    """Check Redis callChain set for the target agency. Reject if cycle detected.

    Raises AgencyCallError if the target agency is already in the call chain.
    """
    key = f"agency:callchain:{parent_run_id}"
    is_in_chain = await redis.sismember(key, target_agency_id)
    if is_in_chain:
        raise AgencyCallError(
            f"Loop detected: agency '{target_agency_id}' is already in the "
            f"call chain for run '{parent_run_id}'."
        )


async def record_in_chain(
    redis: Any,
    parent_run_id: str,
    target_agency_id: str,
) -> None:
    """Add target agency to the Redis callChain set with TTL refresh."""
    key = f"agency:callchain:{parent_run_id}"
    await redis.sadd(key, target_agency_id)
    await redis.expire(key, CALLCHAIN_TTL)


async def check_budget(
    redis: Any,
    parent_run_id: str,
    estimated_cost: float,
) -> None:
    """Check cumulative spend against budget cap (DEFAULT_BUDGET_CAP).

    Raises AgencyCallError if adding estimated_cost would exceed the cap.
    """
    budget_key = f"agency:budget:{parent_run_id}"
    current_raw = await redis.get(budget_key)
    current = float(current_raw or 0)

    if current + estimated_cost > DEFAULT_BUDGET_CAP:
        raise AgencyCallError(
            f"Budget limit exceeded: {current:.1f} credits used, "
            f"cap is {DEFAULT_BUDGET_CAP}."
        )


async def record_spend(
    redis: Any,
    parent_run_id: str,
    actual_cost: float,
) -> None:
    """Atomically increment cumulative spend in Redis."""
    budget_key = f"agency:budget:{parent_run_id}"
    await redis.incrbyfloat(budget_key, actual_cost)
    await redis.expire(budget_key, CALLCHAIN_TTL)


async def acquire_semaphore(redis: Any, parent_run_id: str) -> None:
    """Acquire concurrency semaphore (max SEMAPHORE_MAX).

    Uses Redis pipeline for atomic INCR+EXPIRE to prevent TTL-miss on crash.
    Raises AgencyCallError if the limit is reached.
    """
    sem_key = f"agency:semaphore:{parent_run_id}"
    pipe = redis.pipeline()
    pipe.incr(sem_key)
    pipe.expire(sem_key, SEM_TTL)
    results = await pipe.execute()
    count = results[0]

    if count > SEMAPHORE_MAX:
        await redis.decr(sem_key)
        raise AgencyCallError(
            f"Concurrency limit reached: max {SEMAPHORE_MAX} concurrent "
            f"sub-agency calls per parent run."
        )


async def release_semaphore(redis: Any, parent_run_id: str) -> None:
    """Release the concurrency semaphore."""
    sem_key = f"agency:semaphore:{parent_run_id}"
    remaining = await redis.decr(sem_key)
    if remaining < 0:
        await redis.set(sem_key, 0, ex=SEM_TTL)


# ── Main entry point ───────────────────────────────────────────────────────


async def execute_agency_call(
    target_agency_id: str,
    message: str,
    caller_tenant_id: str,
    caller_user_id: int,
    caller_user_token: str,
    parent_run_id: str,
    current_depth: int,
    config: dict[str, Any],
    db_session: Optional[Any] = None,
    redis: Optional[Any] = None,
) -> str:
    """Main entry point for cross-agency call.

    Orchestrates all safety checks then delegates to AgencyService.execute_run().
    Returns the sub-agency's response text.

    Raises AgencyCallError if any check fails.
    """
    allowed_agencies: list[str] = config.get("allowedAgencies") or []
    max_depth: int = min(int(config.get("maxDepth", 2)), MAX_ABSOLUTE_DEPTH)
    timeout: int = int(config.get("timeout", DEFAULT_TIMEOUT * 1000)) // 1000

    log_agency_event(
        "agency_cross_call_initiated",
        agency_id=target_agency_id,
        run_id=parent_run_id,
        metadata={
            "target_agency_id": target_agency_id,
            "current_depth": current_depth,
            "parent_run_id": parent_run_id,
        },
    )

    # 1. Allowlist check (fast, no DB)
    await check_allowed_agencies(allowed_agencies, target_agency_id)

    # 2. Depth check
    await check_depth(current_depth, max_depth)

    # 3. Tenant isolation check
    if db_session is None:
        raise AgencyCallError("Database session not available for tenant isolation check.")
    agency_row = await validate_tenant_isolation(db_session, target_agency_id, caller_tenant_id)

    # 4. RBAC check
    await check_rbac(db_session, agency_row, caller_user_id, caller_tenant_id)

    if redis is None:
        raise AgencyCallError("Redis client not available for loop/budget/concurrency checks.")

    # 5. Loop prevention
    await check_loop(redis, parent_run_id, target_agency_id)

    # 6. Budget check (estimate = 10 credits per sub-call as pre-check)
    await check_budget(redis, parent_run_id, estimated_cost=10.0)

    # 7. Concurrency semaphore
    await acquire_semaphore(redis, parent_run_id)

    try:
        # Record agency in call chain BEFORE execution
        await record_in_chain(redis, parent_run_id, target_agency_id)

        # 8. Execute sub-agency run
        from app.services.agency_service import AgencyService, RunContext

        sub_run_id = str(uuid.uuid4())
        context = RunContext(
            user_id=caller_user_id,
            tenant_id=caller_tenant_id,
            conversation_id=sub_run_id,
            user_token=caller_user_token,
        )

        service = AgencyService(db=db_session)
        result = await asyncio.wait_for(
            service.execute_run(
                agency_id=target_agency_id,
                message=message,
                context=context,
            ),
            timeout=timeout,
        )

        actual_cost = getattr(result, "credits_used", 0) or 0
        await record_spend(redis, parent_run_id, actual_cost)

        log_agency_event(
            "agency_cross_call_completed",
            agency_id=target_agency_id,
            run_id=parent_run_id,
            metadata={"actual_cost": actual_cost, "parent_run_id": parent_run_id},
        )

        return str(getattr(result, "response", "") or "")

    except AgencyCallError:
        log_agency_event(
            "agency_cross_call_rejected",
            agency_id=target_agency_id,
            run_id=parent_run_id,
            metadata={"reason": "runtime_error"},
        )
        raise
    except asyncio.TimeoutError:
        msg = f"Cross-agency call to '{target_agency_id}' timed out after {timeout}s."
        log_agency_event(
            "agency_cross_call_failed",
            agency_id=target_agency_id,
            run_id=parent_run_id,
            metadata={"error": msg},
        )
        raise AgencyCallError(msg)
    except Exception as exc:
        log_agency_event(
            "agency_cross_call_failed",
            agency_id=target_agency_id,
            run_id=parent_run_id,
            metadata={"error": str(exc)},
        )
        raise AgencyCallError(f"Cross-agency call failed: {exc}") from exc
    finally:
        await release_semaphore(redis, parent_run_id)
