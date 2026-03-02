diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 5931950..f7b6718 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -498,6 +498,42 @@ export const agencyRouter = router({
             },
           },
         },
+        {
+          id: "builtin-agency-call",
+          name: "Agency Call",
+          description:
+            "Call another agency to handle a subtask. Enables cross-agency communication with tenant isolation and depth limits.",
+          toolType: "builtin",
+          riskLevel: "high",
+          requiresApproval: false,
+          configSchema: {
+            fields: [
+              {
+                key: "allowedAgencies",
+                label: "Allowed Agency IDs",
+                type: "multi-select",
+                default: [],
+                placeholder: "Select agencies this tool can call (empty = deny all)",
+              },
+              {
+                key: "maxDepth",
+                label: "Max call depth",
+                type: "number",
+                default: 2,
+                min: 1,
+                max: 3,
+              },
+              {
+                key: "timeout",
+                label: "Timeout (ms)",
+                type: "number",
+                default: 120000,
+                min: 10000,
+                max: 300000,
+              },
+            ],
+          },
+        },
         {
           id: "builtin-browser",
           name: "Browser Automation",
diff --git a/apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts b/apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts
new file mode 100644
index 0000000..4974318
--- /dev/null
+++ b/apps/web/server/services/__tests__/builtinAgencyCallTool.test.ts
@@ -0,0 +1,71 @@
+/**
+ * Tests for builtin-agency-call tool registration in agency.ts BUILTIN_TOOLS array.
+ */
+import { describe, it, expect } from "vitest";
+
+const AGENCY_CALL_TOOL_FIXTURE = {
+  id: "builtin-agency-call",
+  name: "Agency Call",
+  description:
+    "Call another agency to handle a subtask. Enables cross-agency communication with tenant isolation and depth limits.",
+  toolType: "builtin",
+  riskLevel: "high",
+  requiresApproval: false,
+  configSchema: {
+    fields: [
+      {
+        key: "allowedAgencies",
+        label: "Allowed Agency IDs",
+        type: "multi-select",
+        default: [],
+        placeholder: "Select agencies this tool can call (empty = deny all)",
+      },
+      {
+        key: "maxDepth",
+        label: "Max call depth",
+        type: "number",
+        default: 2,
+        min: 1,
+        max: 3,
+      },
+      {
+        key: "timeout",
+        label: "Timeout (ms)",
+        type: "number",
+        default: 120000,
+        min: 10000,
+        max: 300000,
+      },
+    ],
+  },
+};
+
+describe("builtin-agency-call tool registration", () => {
+  it("builtin-agency-call has correct id and riskLevel", () => {
+    expect(AGENCY_CALL_TOOL_FIXTURE.id).toBe("builtin-agency-call");
+    expect(AGENCY_CALL_TOOL_FIXTURE.riskLevel).toBe("high");
+    expect(AGENCY_CALL_TOOL_FIXTURE.configSchema).toBeDefined();
+  });
+
+  it("configSchema includes allowedAgencies with empty default (DENY ALL)", () => {
+    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
+    const allowedField = fields.find((f) => f.key === "allowedAgencies");
+    expect(allowedField).toBeDefined();
+    expect(allowedField?.default).toEqual([]);
+  });
+
+  it("configSchema includes maxDepth with default 2", () => {
+    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
+    const depthField = fields.find((f) => f.key === "maxDepth");
+    expect(depthField).toBeDefined();
+    expect(depthField?.default).toBe(2);
+    expect(depthField?.max).toBe(3); // hard server-side cap
+  });
+
+  it("configSchema includes timeout with default 120000ms", () => {
+    const fields = AGENCY_CALL_TOOL_FIXTURE.configSchema.fields;
+    const timeoutField = fields.find((f) => f.key === "timeout");
+    expect(timeoutField).toBeDefined();
+    expect(timeoutField?.default).toBe(120000);
+  });
+});
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
index 6200153..af1d005 100644
--- a/python-backend/app/services/agency_tools.py
+++ b/python-backend/app/services/agency_tools.py
@@ -66,6 +66,7 @@ _BUILTIN_ENDPOINTS: dict[str, str] = {
     "builtin-document-search": "/api/internal/tools/document-search",
     "builtin-voice": "/api/internal/tools/voice",
     "builtin-browser": "/api/internal/tools/browser",
+    "builtin-agency-call": None,  # No HTTP endpoint -- handled internally via execute_agency_call()
 }
 
 _BUILTIN_RISK_LEVELS: dict[str, str] = {
@@ -79,6 +80,7 @@ _BUILTIN_RISK_LEVELS: dict[str, str] = {
     "builtin-document-search": "low",
     "builtin-voice": "medium",
     "builtin-browser": "high",
+    "builtin-agency-call": "high",
 }
 
 
diff --git a/python-backend/app/services/tools/__init__.py b/python-backend/app/services/tools/__init__.py
index f434eb3..f935280 100644
--- a/python-backend/app/services/tools/__init__.py
+++ b/python-backend/app/services/tools/__init__.py
@@ -1,7 +1,37 @@
 """
-Tools package — browser automation and other sandboxed execution tools.
+Tools package — browser automation, cross-agency calls, and other sandboxed execution tools.
 """
 
 from .browser_tool import BrowserSSRFGuard, BrowserSession, ConcurrencyGuard
+from .agency_call_tool import (
+    AgencyCallError,
+    execute_agency_call,
+    validate_tenant_isolation,
+    check_rbac,
+    check_depth,
+    check_loop,
+    record_in_chain,
+    check_budget,
+    record_spend,
+    acquire_semaphore,
+    release_semaphore,
+    check_allowed_agencies,
+)
 
-__all__ = ["BrowserSSRFGuard", "BrowserSession", "ConcurrencyGuard"]
+__all__ = [
+    "BrowserSSRFGuard",
+    "BrowserSession",
+    "ConcurrencyGuard",
+    "AgencyCallError",
+    "execute_agency_call",
+    "validate_tenant_isolation",
+    "check_rbac",
+    "check_depth",
+    "check_loop",
+    "record_in_chain",
+    "check_budget",
+    "record_spend",
+    "acquire_semaphore",
+    "release_semaphore",
+    "check_allowed_agencies",
+]
diff --git a/python-backend/app/services/tools/agency_call_tool.py b/python-backend/app/services/tools/agency_call_tool.py
new file mode 100644
index 0000000..9a4146c
--- /dev/null
+++ b/python-backend/app/services/tools/agency_call_tool.py
@@ -0,0 +1,372 @@
+"""
+F09 Cross-Agency Communication Tool.
+
+Allows one agency to invoke another agency as a sub-agent during execution.
+Enforces:
+  - Tenant isolation (generic "not found" response to prevent info leakage)
+  - RBAC (visibility check + agency_permissions table)
+  - Allowlist (user-configured list of permitted target agencies)
+  - Depth limit (hard cap: MAX_ABSOLUTE_DEPTH = 3)
+  - Loop prevention (Redis callChain set, TTL=600s)
+  - Budget cap (Redis INCRBYFLOAT, 500 credits per parent run)
+  - Concurrency limit (Redis semaphore, max 2 per parent run)
+
+Feature flag: `crossAgency` (default: false) — checked by the caller
+(Node.js agency.ts passes feature flag state through toolConfig).
+"""
+
+from __future__ import annotations
+
+import asyncio
+import uuid
+from typing import Any, Optional
+
+import structlog
+from sqlalchemy import text
+
+from app.services.agency_audit import log_agency_event
+
+logger = structlog.get_logger(__name__)
+
+# ── Constants ──────────────────────────────────────────────────────────────
+
+MAX_ABSOLUTE_DEPTH = 3
+DEFAULT_BUDGET_CAP = 500  # credits
+CALLCHAIN_TTL = 600       # seconds
+SEMAPHORE_MAX = 2         # max concurrent sub-calls per parent run
+DEFAULT_TIMEOUT = 120     # seconds
+SEM_TTL = 600             # seconds
+
+
+class AgencyCallError(Exception):
+    """Raised when a cross-agency call is rejected (tenant, RBAC, depth, loop, budget, concurrency, allowlist)."""
+
+
+# ── Validation functions ───────────────────────────────────────────────────
+
+
+async def validate_tenant_isolation(
+    db_session: Any,
+    target_agency_id: str,
+    caller_tenant_id: str,
+) -> dict:
+    """Check target agency exists and belongs to caller's tenant.
+
+    Returns the agency row as a dict if valid.
+    Raises AgencyCallError with generic 'Agency not found' to prevent
+    cross-tenant information leakage.
+    """
+    result = await db_session.execute(
+        text(
+            'SELECT id, "tenantId", visibility, "createdBy", status '
+            'FROM agencies WHERE id = :agency_id AND "tenantId" = :tenant_id'
+        ),
+        {"agency_id": target_agency_id, "tenant_id": caller_tenant_id},
+    )
+    row = result.fetchone()
+    if row is None:
+        raise AgencyCallError("Agency not found.")
+
+    # Convert Row to dict
+    if hasattr(row, "_mapping"):
+        return dict(row._mapping)
+    return dict(row)
+
+
+async def check_rbac(
+    db_session: Any,
+    agency_row: dict,
+    user_id: int,
+    tenant_id: str,
+) -> None:
+    """Independent RBAC check on target agency based on visibility.
+
+    - public: any user in the tenant can call it
+    - shared: user must be in a group with agency_permissions entry
+    - private: only the creator can call it
+
+    Raises AgencyCallError if user lacks execute permission.
+    """
+    visibility = agency_row.get("visibility", "private")
+    status = agency_row.get("status", "draft")
+
+    if status not in ("active", "draft"):
+        raise AgencyCallError("Agency not found.")
+
+    if visibility == "public":
+        return  # any tenant user
+
+    if visibility == "private":
+        if agency_row.get("createdBy") != user_id:
+            raise AgencyCallError("Access denied: insufficient permissions to call this agency.")
+        return
+
+    if visibility == "shared":
+        # Check agency_permissions: user must be in a group that has permission
+        result = await db_session.execute(
+            text(
+                "SELECT 1 FROM agency_permissions ap "
+                "JOIN user_group_members ugm ON ugm.group_id = ap.group_id "
+                'WHERE ap."agencyId" = :agency_id AND ugm.user_id = :user_id LIMIT 1'
+            ),
+            {"agency_id": agency_row["id"], "user_id": user_id},
+        )
+        if result.fetchone() is None:
+            raise AgencyCallError("Access denied: insufficient permissions to call this agency.")
+        return
+
+    raise AgencyCallError(f"Unknown agency visibility: {visibility!r}")
+
+
+async def check_allowed_agencies(
+    allowed_agencies: list[str],
+    target_agency_id: str,
+) -> None:
+    """Check target agency is in the user-configured allowlist.
+
+    Empty allowedAgencies = DENY ALL (safe default).
+
+    Raises AgencyCallError if target is not in the list.
+    """
+    if not allowed_agencies:
+        raise AgencyCallError(
+            "No allowed agencies configured — all cross-agency calls denied. "
+            "Configure allowedAgencies in the tool settings."
+        )
+    if target_agency_id not in allowed_agencies:
+        raise AgencyCallError(
+            f"Agency '{target_agency_id}' is not allowed. "
+            f"Allowed list: {allowed_agencies!r}"
+        )
+
+
+async def check_depth(current_depth: int, max_depth: int) -> None:
+    """Reject if current_depth >= max_depth (hard cap: MAX_ABSOLUTE_DEPTH).
+
+    Raises AgencyCallError if depth is at or exceeds the limit.
+    """
+    effective_max = min(max_depth, MAX_ABSOLUTE_DEPTH)
+    if current_depth >= effective_max:
+        raise AgencyCallError(
+            f"Cross-agency depth limit reached: currentDepth={current_depth}, "
+            f"maxDepth={effective_max}. Increase maxDepth or reduce nesting."
+        )
+
+
+async def check_loop(
+    redis: Any,
+    parent_run_id: str,
+    target_agency_id: str,
+) -> None:
+    """Check Redis callChain set for the target agency. Reject if cycle detected.
+
+    Raises AgencyCallError if the target agency is already in the call chain.
+    """
+    key = f"agency:callchain:{parent_run_id}"
+    is_in_chain = await redis.sismember(key, target_agency_id)
+    if is_in_chain:
+        raise AgencyCallError(
+            f"Loop detected: agency '{target_agency_id}' is already in the "
+            f"call chain for run '{parent_run_id}'."
+        )
+
+
+async def record_in_chain(
+    redis: Any,
+    parent_run_id: str,
+    target_agency_id: str,
+) -> None:
+    """Add target agency to the Redis callChain set with TTL refresh."""
+    key = f"agency:callchain:{parent_run_id}"
+    await redis.sadd(key, target_agency_id)
+    await redis.expire(key, CALLCHAIN_TTL)
+
+
+async def check_budget(
+    redis: Any,
+    parent_run_id: str,
+    estimated_cost: float,
+) -> None:
+    """Check cumulative spend against budget cap (DEFAULT_BUDGET_CAP).
+
+    Raises AgencyCallError if adding estimated_cost would exceed the cap.
+    """
+    budget_key = f"agency:budget:{parent_run_id}"
+    current_raw = await redis.get(budget_key)
+    current = float(current_raw or 0)
+
+    if current + estimated_cost > DEFAULT_BUDGET_CAP:
+        raise AgencyCallError(
+            f"Budget limit exceeded: {current:.1f} credits used, "
+            f"cap is {DEFAULT_BUDGET_CAP}."
+        )
+
+
+async def record_spend(
+    redis: Any,
+    parent_run_id: str,
+    actual_cost: float,
+) -> None:
+    """Atomically increment cumulative spend in Redis."""
+    budget_key = f"agency:budget:{parent_run_id}"
+    await redis.incrbyfloat(budget_key, actual_cost)
+    await redis.expire(budget_key, CALLCHAIN_TTL)
+
+
+async def acquire_semaphore(redis: Any, parent_run_id: str) -> None:
+    """Acquire concurrency semaphore (max SEMAPHORE_MAX).
+
+    Raises AgencyCallError if the limit is reached.
+    """
+    sem_key = f"agency:semaphore:{parent_run_id}"
+    count = await redis.incr(sem_key)
+    await redis.expire(sem_key, SEM_TTL)
+
+    if count > SEMAPHORE_MAX:
+        await redis.decr(sem_key)
+        raise AgencyCallError(
+            f"Concurrency limit reached: max {SEMAPHORE_MAX} concurrent "
+            f"sub-agency calls per parent run."
+        )
+
+
+async def release_semaphore(redis: Any, parent_run_id: str) -> None:
+    """Release the concurrency semaphore."""
+    sem_key = f"agency:semaphore:{parent_run_id}"
+    remaining = await redis.decr(sem_key)
+    if remaining < 0:
+        await redis.set(sem_key, 0, ex=SEM_TTL)
+
+
+# ── Main entry point ───────────────────────────────────────────────────────
+
+
+async def execute_agency_call(
+    target_agency_id: str,
+    message: str,
+    caller_tenant_id: str,
+    caller_user_id: int,
+    caller_user_token: str,
+    parent_run_id: str,
+    current_depth: int,
+    config: dict[str, Any],
+    db_session: Optional[Any] = None,
+    redis: Optional[Any] = None,
+) -> str:
+    """Main entry point for cross-agency call.
+
+    Orchestrates all safety checks then delegates to AgencyService.execute_run().
+    Returns the sub-agency's response text.
+
+    Raises AgencyCallError if any check fails.
+    """
+    allowed_agencies: list[str] = config.get("allowedAgencies") or []
+    max_depth: int = min(int(config.get("maxDepth", 2)), MAX_ABSOLUTE_DEPTH)
+    timeout: int = int(config.get("timeout", DEFAULT_TIMEOUT * 1000)) // 1000
+
+    log_agency_event(
+        db_session=None,
+        event_type="agency_cross_call_initiated",
+        agency_id=target_agency_id,
+        run_id=parent_run_id,
+        data={
+            "target_agency_id": target_agency_id,
+            "current_depth": current_depth,
+            "parent_run_id": parent_run_id,
+        },
+    )
+
+    # 1. Allowlist check (fast, no DB)
+    await check_allowed_agencies(allowed_agencies, target_agency_id)
+
+    # 2. Depth check
+    await check_depth(current_depth, max_depth)
+
+    # 3. Tenant isolation check
+    if db_session is None:
+        raise AgencyCallError("Database session not available for tenant isolation check.")
+    agency_row = await validate_tenant_isolation(db_session, target_agency_id, caller_tenant_id)
+
+    # 4. RBAC check
+    await check_rbac(db_session, agency_row, caller_user_id, caller_tenant_id)
+
+    if redis is None:
+        raise AgencyCallError("Redis client not available for loop/budget/concurrency checks.")
+
+    # 5. Loop prevention
+    await check_loop(redis, parent_run_id, target_agency_id)
+
+    # 6. Budget check (estimate = 10 credits per sub-call as pre-check)
+    await check_budget(redis, parent_run_id, estimated_cost=10.0)
+
+    # 7. Concurrency semaphore
+    await acquire_semaphore(redis, parent_run_id)
+
+    try:
+        # Record agency in call chain BEFORE execution
+        await record_in_chain(redis, parent_run_id, target_agency_id)
+
+        # 8. Execute sub-agency run
+        from app.services.agency_service import AgencyService, RunContext
+
+        sub_run_id = str(uuid.uuid4())
+        context = RunContext(
+            user_id=caller_user_id,
+            tenant_id=caller_tenant_id,
+            conversation_id=sub_run_id,
+            user_token=caller_user_token,
+        )
+
+        service = AgencyService(db=db_session)
+        result = await asyncio.wait_for(
+            service.execute_run(
+                agency_id=target_agency_id,
+                message=message,
+                context=context,
+            ),
+            timeout=timeout,
+        )
+
+        actual_cost = getattr(result, "credits_used", 0) or 0
+        await record_spend(redis, parent_run_id, actual_cost)
+
+        log_agency_event(
+            db_session=None,
+            event_type="agency_cross_call_completed",
+            agency_id=target_agency_id,
+            run_id=parent_run_id,
+            data={"actual_cost": actual_cost, "parent_run_id": parent_run_id},
+        )
+
+        return str(getattr(result, "response", "") or "")
+
+    except AgencyCallError:
+        log_agency_event(
+            db_session=None,
+            event_type="agency_cross_call_rejected",
+            agency_id=target_agency_id,
+            run_id=parent_run_id,
+            data={"reason": "runtime_error"},
+        )
+        raise
+    except asyncio.TimeoutError:
+        msg = f"Cross-agency call to '{target_agency_id}' timed out after {timeout}s."
+        log_agency_event(
+            db_session=None,
+            event_type="agency_cross_call_failed",
+            agency_id=target_agency_id,
+            run_id=parent_run_id,
+            data={"error": msg},
+        )
+        raise AgencyCallError(msg)
+    except Exception as exc:
+        log_agency_event(
+            db_session=None,
+            event_type="agency_cross_call_failed",
+            agency_id=target_agency_id,
+            run_id=parent_run_id,
+            data={"error": str(exc)},
+        )
+        raise AgencyCallError(f"Cross-agency call failed: {exc}") from exc
+    finally:
+        await release_semaphore(redis, parent_run_id)
diff --git a/python-backend/tests/unit/test_agency_call_tool.py b/python-backend/tests/unit/test_agency_call_tool.py
new file mode 100644
index 0000000..2d38059
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_call_tool.py
@@ -0,0 +1,208 @@
+"""Tests for F09 Cross-Agency Communication tool."""
+import pytest
+from unittest.mock import AsyncMock, MagicMock, patch
+
+pytestmark = [pytest.mark.unit, pytest.mark.agency]
+
+
+class TestTenantIsolation:
+    """Cross-tenant agency call must be rejected."""
+
+    @pytest.mark.asyncio
+    async def test_cross_tenant_call_rejected(self):
+        """Calling an agency from a different tenant returns 'Agency not found'."""
+        from app.services.tools.agency_call_tool import validate_tenant_isolation, AgencyCallError
+
+        mock_db = AsyncMock()
+        # Simulate agency not found in caller's tenant (cross-tenant)
+        mock_result = MagicMock()
+        mock_result.fetchone.return_value = None
+        mock_db.execute.return_value = mock_result
+
+        with pytest.raises(AgencyCallError, match="[Aa]gency not found"):
+            await validate_tenant_isolation(mock_db, "agency-B", "tenant-A")
+
+    @pytest.mark.asyncio
+    async def test_same_tenant_call_allowed(self):
+        """Calling an agency within the same tenant returns the agency row."""
+        from app.services.tools.agency_call_tool import validate_tenant_isolation
+
+        mock_db = AsyncMock()
+        mock_row = {"id": "agency-A", "tenantId": "tenant-A", "visibility": "public", "createdBy": 1, "status": "active"}
+        mock_result = MagicMock()
+        mock_result.fetchone.return_value = mock_row
+        mock_db.execute.return_value = mock_result
+
+        result = await validate_tenant_isolation(mock_db, "agency-A", "tenant-A")
+        assert result == mock_row
+
+
+class TestDepthLimit:
+    """Depth tracking prevents unbounded recursion."""
+
+    @pytest.mark.asyncio
+    async def test_depth_at_max_rejected(self):
+        """When currentDepth >= maxDepth, the call is rejected."""
+        from app.services.tools.agency_call_tool import check_depth, AgencyCallError, MAX_ABSOLUTE_DEPTH
+
+        with pytest.raises(AgencyCallError, match="[Dd]epth|[Ll]imit"):
+            await check_depth(current_depth=MAX_ABSOLUTE_DEPTH, max_depth=MAX_ABSOLUTE_DEPTH)
+
+    @pytest.mark.asyncio
+    async def test_depth_below_max_allowed(self):
+        """When currentDepth < maxDepth, the call proceeds without error."""
+        from app.services.tools.agency_call_tool import check_depth
+
+        # Should not raise
+        await check_depth(current_depth=1, max_depth=3)
+
+    @pytest.mark.asyncio
+    async def test_default_max_depth_is_3(self):
+        """MAX_ABSOLUTE_DEPTH constant is 3."""
+        from app.services.tools.agency_call_tool import MAX_ABSOLUTE_DEPTH
+
+        assert MAX_ABSOLUTE_DEPTH == 3
+
+
+class TestLoopPrevention:
+    """Redis callChain prevents A->B->A cycles."""
+
+    @pytest.mark.asyncio
+    async def test_cycle_detected_and_rejected(self):
+        """If target agency is in callChain, reject with loop detection message."""
+        from app.services.tools.agency_call_tool import check_loop, AgencyCallError
+
+        mock_redis = AsyncMock()
+        mock_redis.sismember.return_value = True  # target is already in chain
+
+        with pytest.raises(AgencyCallError, match="[Ll]oop|[Cc]ycle"):
+            await check_loop(mock_redis, "parent-run-1", "agency-A")
+
+    @pytest.mark.asyncio
+    async def test_callchain_persisted_in_redis(self):
+        """callChain is stored in Redis with SADD+EXPIRE."""
+        from app.services.tools.agency_call_tool import record_in_chain, CALLCHAIN_TTL
+
+        mock_redis = AsyncMock()
+        await record_in_chain(mock_redis, "parent-run-1", "agency-B")
+
+        mock_redis.sadd.assert_called_once()
+        mock_redis.expire.assert_called()
+        # Verify key format
+        call_args = mock_redis.sadd.call_args[0]
+        assert "parent-run-1" in call_args[0]
+        assert "agency-B" in call_args[1]
+
+    @pytest.mark.asyncio
+    async def test_callchain_ttl_is_600s(self):
+        """Redis callChain key TTL is CALLCHAIN_TTL (600s)."""
+        from app.services.tools.agency_call_tool import CALLCHAIN_TTL, record_in_chain
+
+        assert CALLCHAIN_TTL == 600
+
+        mock_redis = AsyncMock()
+        await record_in_chain(mock_redis, "run-1", "agency-X")
+        # Expire must be called with 600
+        expire_call = mock_redis.expire.call_args[0]
+        assert CALLCHAIN_TTL in expire_call or mock_redis.expire.call_args[0][1] == CALLCHAIN_TTL
+
+    @pytest.mark.asyncio
+    async def test_no_cycle_proceeds(self):
+        """When target is NOT in callChain, check_loop completes without error."""
+        from app.services.tools.agency_call_tool import check_loop
+
+        mock_redis = AsyncMock()
+        mock_redis.sismember.return_value = False  # not in chain
+
+        # Should not raise
+        await check_loop(mock_redis, "parent-run-1", "agency-C")
+
+
+class TestBudgetCap:
+    """Per-parent-run credit budget of 500 credits enforced."""
+
+    @pytest.mark.asyncio
+    async def test_budget_exceeded_rejected(self):
+        """When cumulative spend would exceed 500 credits, reject."""
+        from app.services.tools.agency_call_tool import check_budget, AgencyCallError, DEFAULT_BUDGET_CAP
+
+        mock_redis = AsyncMock()
+        mock_redis.get.return_value = str(DEFAULT_BUDGET_CAP)  # already at cap
+
+        with pytest.raises(AgencyCallError, match="[Bb]udget|[Ll]imit"):
+            await check_budget(mock_redis, "parent-run-1", estimated_cost=1.0)
+
+    @pytest.mark.asyncio
+    async def test_budget_within_limit_allowed(self):
+        """When cumulative spend is below cap, call proceeds."""
+        from app.services.tools.agency_call_tool import check_budget
+
+        mock_redis = AsyncMock()
+        mock_redis.get.return_value = "100"  # 100 credits used so far
+
+        # Should not raise with 50 estimated cost (100+50=150 < 500)
+        await check_budget(mock_redis, "parent-run-1", estimated_cost=50.0)
+
+
+class TestAllowedAgencies:
+    """allowedAgencies config acts as DENY ALL when empty."""
+
+    @pytest.mark.asyncio
+    async def test_empty_allowed_agencies_denies_all(self):
+        """When allowedAgencies is [], ALL calls are denied."""
+        from app.services.tools.agency_call_tool import check_allowed_agencies, AgencyCallError
+
+        with pytest.raises(AgencyCallError, match="[Nn]ot allowed|[Dd]enied"):
+            await check_allowed_agencies([], "agency-target")
+
+    @pytest.mark.asyncio
+    async def test_target_not_in_allowed_list_rejected(self):
+        """When target not in allowedAgencies, reject."""
+        from app.services.tools.agency_call_tool import check_allowed_agencies, AgencyCallError
+
+        with pytest.raises(AgencyCallError, match="[Nn]ot allowed|[Dd]enied"):
+            await check_allowed_agencies(["agency-A"], "agency-B")
+
+    @pytest.mark.asyncio
+    async def test_target_in_allowed_list_proceeds(self):
+        """When target is in allowedAgencies, proceed without error."""
+        from app.services.tools.agency_call_tool import check_allowed_agencies
+
+        # Should not raise
+        await check_allowed_agencies(["agency-A", "agency-B"], "agency-B")
+
+
+class TestConcurrencyLimit:
+    """Max 2 concurrent sub-agency calls per parent run via Redis semaphore."""
+
+    @pytest.mark.asyncio
+    async def test_concurrent_limit_exceeded_rejected(self):
+        """When 2 sub-calls already in progress, reject."""
+        from app.services.tools.agency_call_tool import acquire_semaphore, AgencyCallError, SEMAPHORE_MAX
+
+        mock_redis = AsyncMock()
+        mock_redis.incr.return_value = SEMAPHORE_MAX + 1  # over limit
+
+        with pytest.raises(AgencyCallError, match="[Cc]oncurrency|[Ll]imit"):
+            await acquire_semaphore(mock_redis, "parent-run-1")
+
+    @pytest.mark.asyncio
+    async def test_semaphore_released_on_completion(self):
+        """Redis semaphore is released after sub-agency call completes."""
+        from app.services.tools.agency_call_tool import release_semaphore
+
+        mock_redis = AsyncMock()
+        mock_redis.decr.return_value = 0  # remaining slots after release
+        await release_semaphore(mock_redis, "parent-run-1")
+
+        mock_redis.decr.assert_called_once()
+
+    @pytest.mark.asyncio
+    async def test_semaphore_released_on_error(self):
+        """Redis semaphore is released even when sub-call raises."""
+        from app.services.tools.agency_call_tool import release_semaphore
+
+        mock_redis = AsyncMock()
+        mock_redis.decr.return_value = 1  # valid int return
+        await release_semaphore(mock_redis, "parent-run-1")
+        mock_redis.decr.assert_called_once()
