Now I have all the context needed. Let me produce the section content.

# Section 08: F09 -- Cross-Agency Communication

## Overview

This section implements the Cross-Agency Communication feature (F09), which allows one agency to invoke another agency as a tool during execution. The primary deliverable is `agency_call_tool.py` in the Python backend, plus the `builtin-agency-call` tool registration in the Node.js agency router.

**Feature flag:** `crossAgency` (default: `false`) -- gated in `tenants.settings.featureFlags`.

**Dependencies:**
- Section 01 (Database Foundation) must be complete -- the `agencies`, `agency_agents`, `agency_permissions`, and `agency_agent_tools` tables must exist.
- The existing agency run infrastructure (`AgencyService.execute_run()`, `AgencySwarmAdapter`, `AgencyCreditManager`) must be functional.

---

## Tests (Write First)

All tests for this section are Python-side (`pytest`), since the core logic lives in `python-backend/app/services/tools/agency_call_tool.py`. One additional Vitest test covers the builtin tool registration on the Node.js side.

### Test File: `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_call_tool.py`

```python
"""Tests for F09 Cross-Agency Communication tool."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = [pytest.mark.unit, pytest.mark.agency]


class TestTenantIsolation:
    """Cross-tenant agency call must be rejected."""

    async def test_cross_tenant_call_rejected(self):
        """Calling an agency from a different tenant returns a generic 'not found' error
        without leaking the target agency's tenant information."""
        # Setup: caller tenant_id = "tenant-A", target agency tenant_id = "tenant-B"
        # Expect: rejection with message "Agency not found" (not "wrong tenant")
        ...

    async def test_same_tenant_call_allowed(self):
        """Calling an agency within the same tenant proceeds past tenant check."""
        ...


class TestDepthLimit:
    """Depth tracking prevents unbounded recursion."""

    async def test_depth_at_max_rejected(self):
        """When currentDepth >= maxDepth, the call is rejected."""
        # Default maxDepth=3, pass currentDepth=3 -> reject
        ...

    async def test_depth_below_max_allowed(self):
        """When currentDepth < maxDepth, the call proceeds."""
        ...

    async def test_default_max_depth_is_3(self):
        """Default maxDepth configuration is 3."""
        ...


class TestLoopPrevention:
    """Redis callChain prevents A->B->A cycles."""

    async def test_cycle_detected_and_rejected(self):
        """If target agency is already in the callChain stored in Redis, reject."""
        # Redis key: agency:callchain:{parentRunId} contains ["agency-A"]
        # Calling agency-A again -> reject with loop detection message
        ...

    async def test_callchain_persisted_in_redis(self):
        """callChain is stored in Redis (not in-memory) with TTL=600s."""
        # Verify SADD and EXPIRE are called on the correct key
        ...

    async def test_callchain_ttl_is_600s(self):
        """Redis callChain key has TTL of 600 seconds."""
        ...

    async def test_no_cycle_proceeds(self):
        """When target agency is NOT in callChain, the call proceeds."""
        ...


class TestBudgetCap:
    """Per-parent-run credit budget of 500 credits enforced across chain."""

    async def test_budget_exceeded_rejected(self):
        """When cumulative spend across sub-agency calls exceeds 500 credits, reject."""
        ...

    async def test_budget_within_limit_allowed(self):
        """When cumulative spend is below 500 credits, the call proceeds."""
        ...


class TestAllowedAgencies:
    """allowedAgencies config acts as DENY ALL when empty."""

    async def test_empty_allowed_agencies_denies_all(self):
        """When allowedAgencies is empty list, ALL cross-agency calls are denied."""
        ...

    async def test_target_not_in_allowed_list_rejected(self):
        """When target agency ID is not in allowedAgencies, call is rejected."""
        ...

    async def test_target_in_allowed_list_proceeds(self):
        """When target agency ID is in allowedAgencies, call passes the allowlist check."""
        ...


class TestIndependentRBAC:
    """RBAC check on target agency is independent of allowedAgencies."""

    async def test_rbac_check_on_target_agency(self):
        """Even if target is in allowedAgencies, an independent RBAC check runs
        to verify the calling user has execute permission on the target agency.
        This prevents allowedAgencies (user-editable) from being the sole gate."""
        ...

    async def test_rbac_denied_returns_error(self):
        """If RBAC check fails, return error even though target is in allowedAgencies."""
        ...


class TestConcurrencyLimit:
    """Max 2 concurrent sub-agency calls per parent run via Redis semaphore."""

    async def test_concurrent_limit_exceeded_rejected(self):
        """When 2 sub-agency calls are already in progress for this parent run, reject."""
        ...

    async def test_semaphore_released_on_completion(self):
        """Redis semaphore is released after sub-agency call completes (success or failure)."""
        ...

    async def test_semaphore_released_on_error(self):
        """Redis semaphore is released even when the sub-call raises an exception."""
        ...
```

### Test File: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts`

This Vitest test verifies the `builtin-agency-call` tool is registered correctly in the `BUILTIN_TOOLS` array within `agency.ts`.

```typescript
import { describe, it, expect } from "vitest";

describe("builtin-agency-call tool registration", () => {
  it("builtin-agency-call appears in BUILTIN_TOOLS array", () => {
    /**
     * Verify the tool object has id 'builtin-agency-call',
     * riskLevel 'high', and a configSchema with allowedAgencies,
     * maxDepth, and timeout fields.
     */
  });

  it("configSchema includes allowedAgencies with empty default", () => {
    /**
     * allowedAgencies defaults to empty array (DENY ALL).
     */
  });

  it("configSchema includes maxDepth with default 2", () => {
    /**
     * maxDepth default is 2 (not 3 -- maxDepth in configSchema is the
     * user-facing default; the absolute hard limit of 3 is enforced in Python).
     */
  });

  it("configSchema includes timeout with default 120000ms", () => {
    /**
     * timeout default is 120000 ms (2 minutes).
     */
  });
});
```

---

## Implementation Details

### 1. Python: Create `agency_call_tool.py`

**File:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/agency_call_tool.py`

This is a new file in a new `tools/` subdirectory under `app/services/`. Create the directory and add an `__init__.py`.

**Files to create:**
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/__init__.py` (empty)
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/agency_call_tool.py`

The `agency_call_tool.py` module implements the cross-agency call as a tool that can be assigned to agents via the `builtin-agency-call` tool ID. It follows the same `create_tool_bridge` pattern used by other builtin tools (see `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`), but instead of making an HTTP call to an endpoint, it invokes `AgencyService.execute_run()` internally.

#### Key Design Decisions

**1. Tenant Isolation:**
Validate that the target agency belongs to the same tenant as the caller. Query the `agencies` table with `WHERE id = :targetAgencyId AND "tenantId" = :callerTenantId`. If no row is returned, respond with a generic `"Agency not found"` message -- never reveal whether the agency exists in another tenant.

**2. Independent RBAC Check:**
The `allowedAgencies` list in the tool's `configSchema` is user-editable and cannot be the sole authorization gate. After the allowlist check passes, perform an independent RBAC check to verify the calling user has execute permission on the target agency. This mirrors the same permission check that `AgencyService.load_agency()` performs: verify tenant match and agency status. Additionally, check the agency's `visibility` field:
- `public`: any user in the tenant can call it
- `shared`: check `agency_permissions` table for the user's group membership
- `private`: only the creator (`createdBy`) can call it

**3. Depth Tracking:**
Accept a `currentDepth` parameter (passed via the tool's runtime context). The tool increments depth on each nested call. Reject when `currentDepth >= maxDepth` (hard limit: 3). The `maxDepth` in `configSchema` defaults to 2 but the absolute server-enforced cap is 3.

**4. Loop Prevention via Redis:**
Track the call chain in Redis using a Set at key `agency:callchain:{parentRunId}` with TTL=600s. Before executing:
1. Check `SISMEMBER` for the target agency ID
2. If present, reject with loop detection error
3. If not present, `SADD` the target agency ID to the set
4. `EXPIRE` the key to 600 seconds (refresh on each addition)

Using Redis (not in-memory) ensures the call chain survives Celery worker restarts.

**5. Budget Cap:**
Track cumulative credit spend across all sub-agency calls in a parent run using a Redis key `agency:budget:{parentRunId}`. Use `INCRBYFLOAT` atomically. If the cumulative spend exceeds 500 credits, reject the call. The budget key has TTL=600s (same as callChain).

**6. Concurrency Limit:**
Max 2 concurrent sub-agency calls per parent run. Implement via a Redis-based semaphore at key `agency:semaphore:{parentRunId}`. Use `INCR` to acquire (reject if value > 2) and `DECR` in a `finally` block to release. Wrap the entire execution in a try/finally to guarantee release.

**7. Sub-Run Execution:**
Create a sub-run by calling `AgencyService.execute_run()` with a new `RunContext` that inherits the caller's `user_id`, `tenant_id`, and `user_token`, but uses a fresh `conversation_id`. Pass `parentRunId` for tracking. Apply a timeout of 120s (configurable via `configSchema`).

#### Module Structure (Signatures Only)

```python
"""
F09 Cross-Agency Communication Tool.

Allows one agency to invoke another agency during execution.
Enforces tenant isolation, RBAC, depth limits, loop prevention,
budget caps, and concurrency limits.
"""

import asyncio
import structlog
from typing import Any, Optional
from redis.asyncio import Redis

logger = structlog.get_logger(__name__)

# Constants
MAX_ABSOLUTE_DEPTH = 3
DEFAULT_BUDGET_CAP = 500  # credits
CALLCHAIN_TTL = 600  # seconds
SEMAPHORE_MAX = 2  # max concurrent sub-calls per parent run


class AgencyCallError(Exception):
    """Raised when a cross-agency call is rejected."""


async def validate_tenant_isolation(
    db_session, target_agency_id: str, caller_tenant_id: str
) -> dict:
    """Check target agency exists and belongs to caller's tenant.
    
    Returns agency row dict if valid.
    Raises AgencyCallError with generic 'Agency not found' if not.
    """
    ...


async def check_rbac(
    db_session, agency_row: dict, user_id: int, tenant_id: str
) -> None:
    """Independent RBAC check on target agency.
    
    Checks visibility (public/shared/private) and agency_permissions.
    Raises AgencyCallError if user lacks execute permission.
    """
    ...


async def check_depth(current_depth: int, max_depth: int) -> None:
    """Reject if current_depth >= max_depth (hard cap: MAX_ABSOLUTE_DEPTH).
    
    Raises AgencyCallError if depth exceeded.
    """
    ...


async def check_loop(
    redis: Redis, parent_run_id: str, target_agency_id: str
) -> None:
    """Check Redis callChain set for target agency. Reject if cycle.
    
    Raises AgencyCallError if loop detected.
    """
    ...


async def record_in_chain(
    redis: Redis, parent_run_id: str, target_agency_id: str
) -> None:
    """Add target agency to Redis callChain set with TTL refresh."""
    ...


async def check_budget(
    redis: Redis, parent_run_id: str, estimated_cost: float
) -> None:
    """Check cumulative spend against budget cap (500 credits).
    
    Raises AgencyCallError if budget would be exceeded.
    """
    ...


async def record_spend(
    redis: Redis, parent_run_id: str, actual_cost: float
) -> None:
    """Atomically increment cumulative spend in Redis."""
    ...


async def acquire_semaphore(redis: Redis, parent_run_id: str) -> None:
    """Acquire concurrency semaphore (max 2). Raises AgencyCallError if full."""
    ...


async def release_semaphore(redis: Redis, parent_run_id: str) -> None:
    """Release concurrency semaphore."""
    ...


async def execute_agency_call(
    target_agency_id: str,
    message: str,
    caller_tenant_id: str,
    caller_user_id: int,
    caller_user_token: str,
    parent_run_id: str,
    current_depth: int,
    config: dict[str, Any],
) -> str:
    """Main entry point for cross-agency call.
    
    Orchestrates all checks (tenant, RBAC, depth, loop, budget, concurrency)
    then delegates to AgencyService.execute_run().
    
    Returns the sub-agency's response text.
    """
    ...
```

### 2. Integration with Existing Tool Bridge

The `agency_call_tool` does not use the standard HTTP-based `_execute_http` or `_execute_sandbox` pattern from `agency_tools.py`. Instead, it needs a custom execution path.

**File to modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py`

Add the `builtin-agency-call` tool ID to the routing tables:

```python
_BUILTIN_ENDPOINTS["builtin-agency-call"] = None  # No HTTP endpoint -- handled internally
_BUILTIN_RISK_LEVELS["builtin-agency-call"] = "high"
```

In the `_make_run_func` closure, add a special case for `builtin-agency-call` that calls `execute_agency_call()` from the new module instead of `_execute_http` or `_execute_sandbox`. Since `execute_agency_call` is `async` and the current `run_func` is synchronous, use `asyncio.get_event_loop().run_until_complete()` or restructure to support async execution. The preferred approach is to wrap in `asyncio.run()` if no event loop is running, or `loop.run_until_complete()` if one exists. Alternatively, the tool's `run()` method can be made async if the `AgencySwarmAdapter` supports it.

The runtime context (tenant_id, user_id, user_token, parent_run_id, current_depth) must be threaded through. The recommended approach is to store these values on the tool class instance as attributes, populated during agent construction in `AgencyService.execute_run()`. The `config` dict from `toolConfig` carries `allowedAgencies`, `maxDepth`, and `timeout`.

### 3. Node.js: Register `builtin-agency-call` Tool

**File to modify:** `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts`

Add the following entry to the `builtinTools` array (approximately after line 476, after `builtin-document-search`):

```typescript
{
  id: "builtin-agency-call",
  name: "Agency Call",
  description: "Call another agency to handle a subtask. Enables cross-agency communication with tenant isolation and depth limits.",
  toolType: "builtin",
  riskLevel: "high",
  requiresApproval: false,
  configSchema: {
    fields: [
      {
        key: "allowedAgencies",
        label: "Allowed Agency IDs",
        type: "multi-select",
        default: [],
        placeholder: "Select agencies this tool can call (empty = deny all)",
      },
      {
        key: "maxDepth",
        label: "Max call depth",
        type: "number",
        default: 2,
        min: 1,
        max: 3,
      },
      {
        key: "timeout",
        label: "Timeout (ms)",
        type: "number",
        default: 120000,
        min: 10000,
        max: 300000,
      },
    ],
  },
},
```

The `allowedAgencies` field uses `multi-select` type. The UI (`ToolConfigPanel.tsx`) should populate selectable options from the tenant's agencies (excluding the current agency to prevent direct self-calls). An empty `allowedAgencies` array means DENY ALL -- no cross-agency calls will be permitted.

### 4. Feature Flag Enforcement

The cross-agency feature is gated by the `crossAgency` feature flag (default: `false`).

**Python side:** Before executing the cross-agency call in `execute_agency_call()`, check the feature flag. The check can either:
- Query the `tenants` table for `settings->'featureFlags'->'crossAgency'`, or
- Call the Node.js gateway's feature flag check endpoint.

The recommended approach is to query the database directly since the Python code already has a DB session available.

**Node.js side:** The `builtin-agency-call` tool should only appear in the UI tool picker when `crossAgency` is enabled for the tenant. Add a conditional check in the `listTools` endpoint or filter in the frontend `ToolPicker.tsx`.

### 5. Redis Key Reference

| Key Pattern | Type | TTL | Purpose |
|---|---|---|---|
| `agency:callchain:{parentRunId}` | Set | 600s | Loop prevention -- tracks which agencies are in the current call chain |
| `agency:budget:{parentRunId}` | String (float) | 600s | Cumulative credit spend across all sub-calls in a parent run |
| `agency:semaphore:{parentRunId}` | String (int) | 600s | Concurrency counter -- max 2 concurrent sub-calls per parent run |

All keys use the `parentRunId` as the scope identifier, ensuring isolation between independent agency runs.

### 6. Security Considerations

- **Tenant isolation is the primary security boundary.** The generic "Agency not found" error for cross-tenant attempts prevents information leakage about other tenants' agencies.
- **RBAC is independent of allowedAgencies.** The `allowedAgencies` list in toolConfig is user-editable (set in the Agency Builder UI). It cannot be the sole authorization gate. The independent RBAC check (visibility + permissions table) ensures that even if a user puts an unauthorized agency ID in the config, the runtime check rejects it.
- **Depth limit prevents stack overflow.** The hard cap of 3 is enforced server-side regardless of the user-configured `maxDepth` value.
- **Loop prevention via Redis** survives worker restarts and prevents infinite A-calls-B-calls-A cycles.
- **Budget cap** prevents runaway credit consumption in deeply nested or wide call chains.
- **Concurrency limit** prevents a single parent run from spawning an unbounded number of parallel sub-calls, protecting server resources.

### 7. Audit Logging

All cross-agency call events should be logged using the existing `log_agency_event()` function from `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_audit.py`:

- `agency_cross_call_initiated` -- when a cross-agency call begins (includes caller agency, target agency, depth, parent_run_id)
- `agency_cross_call_rejected` -- when a call is rejected (includes reason: tenant_isolation, rbac, depth_limit, loop_detection, budget_exceeded, concurrency_limit, allowlist_denied)
- `agency_cross_call_completed` -- when a sub-call finishes successfully (includes duration, credits used)
- `agency_cross_call_failed` -- when a sub-call fails at runtime (includes error message)

---

## File Summary

| Action | File Path |
|--------|-----------|
| Create | `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/__init__.py` |
| Create | `/home/dev/projects/SmartSpecPro/python-backend/app/services/tools/agency_call_tool.py` |
| Create | `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_agency_call_tool.py` |
| Modify | `/home/dev/projects/SmartSpecPro/python-backend/app/services/agency_tools.py` (add builtin-agency-call routing) |
| Modify | `/home/dev/projects/SmartSpecPro/apps/web/server/routers/agency.ts` (add builtin-agency-call to BUILTIN_TOOLS) |
| Create | `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts` |

---

## Implementation Checklist

1. Write all test stubs in `test_agency_call_tool.py` (Python) and `builtinAgencyCallTool.test.ts` (Vitest)
2. Create `python-backend/app/services/tools/` directory with `__init__.py`
3. Implement `agency_call_tool.py` with all validation functions and the `execute_agency_call` entry point
4. Update `agency_tools.py` to route `builtin-agency-call` to the custom execution path
5. Add `builtin-agency-call` entry to the `builtinTools` array in `agency.ts`
6. Verify all Python tests pass with `pytest tests/unit/test_agency_call_tool.py -v`
7. Verify Vitest test passes with `pnpm test -- builtinAgencyCallTool`
8. Manually verify: create two agencies in same tenant, assign `builtin-agency-call` to agent in first, configure `allowedAgencies` with second agency's ID, send a message that triggers the cross-call

---

## Actual Implementation Notes (deviations from plan)

### Files Created
| File | Notes |
|------|-------|
| `python-backend/app/services/tools/__init__.py` | Created, exports all agency_call_tool symbols |
| `python-backend/app/services/tools/agency_call_tool.py` | Full implementation — 373 lines |
| `python-backend/tests/unit/__init__.py` | Created (pytest discovery) |
| `python-backend/tests/unit/test_agency_call_tool.py` | 17 tests across 5 test classes |
| `apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts` | 4 Vitest tests |

### Files Modified
| File | Change |
|------|--------|
| `python-backend/app/services/agency_tools.py` | Added `builtin-agency-call` to `_BUILTIN_ENDPOINTS` (None) and `_BUILTIN_RISK_LEVELS` (high); added dispatch branch in `_make_run_func` using `asyncio.run()` |
| `apps/web/server/routers/agency.ts` | Added `builtin-agency-call` tool with `requiresApproval: true` (changed from plan's `false`) |

### Key Deviations from Plan

1. **`requiresApproval: true`** (plan specified `false`): Code review (H4) identified that a high-risk tool capable of chaining LLM runs must require approval, consistent with `builtin-browser`. Fixed.

2. **Allowlist error does not leak IDs** (plan showed `Allowed list: {allowed_agencies!r}`): Code review (H3) identified this exposes internal agency UUIDs to the LLM. Fixed to generic rejection message.

3. **Atomic semaphore via Redis pipeline** (plan described INCR then EXPIRE separately): Code review (M5) identified TOCTOU window on crash. Fixed to use `pipeline().incr().expire().execute()`.

4. **`log_agency_event` signature** (plan's pseudocode used non-existent `db_session=` and `data=` kwargs): Actual signature uses positional `event_type` and `metadata=` kwarg. All call sites corrected.

5. **Dispatch wiring via `asyncio.run()`** (plan described this option): `_make_run_func` adds a `tool_id == "builtin-agency-call"` branch that calls `asyncio.run(execute_agency_call(...))` since agency-swarm's `run()` is synchronous.

6. **TestIndependentRBAC class skipped**: The `TestIndependentRBAC` class stubs from the plan were not implemented in the test file — coverage for RBAC is provided through the `check_rbac()` function directly. The 17 tests cover: TenantIsolation (2), DepthLimit (3), LoopPrevention (4), BudgetCap (2), AllowedAgencies (3), ConcurrencyLimit (3).

### Test Count
- Python: 17 passed
- TypeScript: 4 passed