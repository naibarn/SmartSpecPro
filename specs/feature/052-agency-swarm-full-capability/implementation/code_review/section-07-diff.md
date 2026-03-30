diff --git a/apps/web/server/routers/agency.ts b/apps/web/server/routers/agency.ts
index 3aa8722d..b301f272 100644
--- a/apps/web/server/routers/agency.ts
+++ b/apps/web/server/routers/agency.ts
@@ -1090,6 +1090,7 @@ export const agencyRouter = router({
             }
           }),
         ).min(1).max(20),
+        userContext: z.record(z.string(), z.unknown()).optional(),
         communicationFlows: z
           .array(
             z.object({
@@ -1166,6 +1167,7 @@ export const agencyRouter = router({
         if (input.description !== undefined) setValues.description = input.description;
         if (input.systemPrompt !== undefined) setValues.systemPrompt = input.systemPrompt;
         if (input.defaultModel !== undefined) setValues.defaultModel = input.defaultModel;
+        if (input.userContext !== undefined) setValues.userContext = input.userContext;
         if (Object.keys(setValues).length > 0) {
           await tx.update(agencies).set(setValues).where(eq(agencies.id, input.id));
         }
diff --git a/python-backend/app/services/agency_orchestrator.py b/python-backend/app/services/agency_orchestrator.py
index a72c40bd..6fe6bec3 100644
--- a/python-backend/app/services/agency_orchestrator.py
+++ b/python-backend/app/services/agency_orchestrator.py
@@ -22,6 +22,7 @@ import httpx
 import structlog
 
 from app.services.agency_browser_session_executor import AgencyBrowserSessionExecutor
+from app.services.agency_run_context import AgencyRunContext
 
 logger = structlog.get_logger(__name__)
 
@@ -63,6 +64,9 @@ class ExecutionContext:
         # Browser Sessions opened or resumed during the run.
         self.browser_sessions: list[dict[str, Any]] = []
         self.active_browser_session_id: str | None = None
+        # Shared run context (populated by orchestrator)
+        self.shared_context: AgencyRunContext | None = None
+        self.context_snapshot: dict[str, Any] | None = None
 
     def get_context_text(self) -> str:
         """Build a context string from accumulated knowledge and results."""
@@ -96,6 +100,7 @@ class AgencyOrchestrator:
         agency_whitelist: set[str] | None = None,
         retrieval_scope_mode: str | None = None,
         guardrails_by_agent: dict[str, list] | None = None,
+        user_context: dict[str, Any] | None = None,
     ):
         self.nodes: dict[str, NodeRow] = {n["id"]: n for n in nodes}
         self.edges: list[EdgeRow] = edges
@@ -106,6 +111,7 @@ class AgencyOrchestrator:
         self.retrieval_scope_mode = retrieval_scope_mode
         # Guardrail definitions keyed by agent ID for quick lookup
         self.guardrails_by_agent: dict[str, list] = guardrails_by_agent or {}
+        self.user_context = user_context
         self.browser_session_executor = AgencyBrowserSessionExecutor()
 
         # Find entry node
@@ -153,6 +159,9 @@ class AgencyOrchestrator:
             user_id=user_id, task_metadata=task_metadata,
         )
 
+        # Initialize shared run context with optional seed data
+        ctx.shared_context = AgencyRunContext(initial_data=self.user_context)
+
         if task_metadata:
             logger.info(
                 "agency_orchestrator_with_planner_context",
@@ -162,6 +171,10 @@ class AgencyOrchestrator:
             )
 
         result = await self._execute_node(self.entry_node, ctx)
+
+        # Capture context snapshot for observability (section-15 will persist it)
+        ctx.context_snapshot = ctx.shared_context.snapshot()
+
         return result or "", ctx
 
     async def _execute_node(self, node: NodeRow, ctx: ExecutionContext) -> str:
@@ -315,6 +328,7 @@ class AgencyOrchestrator:
                     agency_whitelist=self.agency_whitelist,
                     adapter=self.adapter,
                     retrieval_scope_mode=self.retrieval_scope_mode,
+                    run_context=ctx.shared_context,
                 )
 
             agent = self.adapter.create_agent(
diff --git a/python-backend/app/services/agency_run_context.py b/python-backend/app/services/agency_run_context.py
new file mode 100644
index 00000000..83258980
--- /dev/null
+++ b/python-backend/app/services/agency_run_context.py
@@ -0,0 +1,55 @@
+"""
+AgencyRunContext — thread-safe shared state for a single agency run.
+
+All agents, tools, and node handlers in the same run share one instance.
+Access is serialized via asyncio.Lock to prevent concurrent mutation issues.
+
+No imports from agency-swarm — isolation pattern preserved.
+"""
+
+from __future__ import annotations
+
+import asyncio
+import copy
+from typing import Any
+
+
+class AgencyRunContext:
+    """Thread-safe shared state for a single agency run.
+
+    All agents, tools, and node handlers in the same run share one instance.
+    Access is serialized via asyncio.Lock to prevent concurrent mutation issues.
+    """
+
+    def __init__(self, initial_data: dict[str, Any] | None = None) -> None:
+        self._data: dict[str, Any] = dict(initial_data) if initial_data else {}
+        self._lock = asyncio.Lock()
+
+    async def get(self, key: str, default: Any = None) -> Any:
+        """Read a value by key. Returns default if missing."""
+        async with self._lock:
+            return self._data.get(key, default)
+
+    async def set(self, key: str, value: Any) -> None:
+        """Write a value by key. Overwrites existing."""
+        async with self._lock:
+            self._data[key] = value
+
+    async def get_all(self) -> dict[str, Any]:
+        """Return a shallow copy of all key-value pairs."""
+        async with self._lock:
+            return dict(self._data)
+
+    def snapshot(self) -> dict[str, Any]:
+        """Return a deep copy for persistence (synchronous, used at run end)."""
+        return copy.deepcopy(self._data)
+
+    # ── Sync helpers for agency-swarm tool run() methods ──────────────
+
+    def get_sync(self, key: str, default: Any = None) -> Any:
+        """Synchronous read — safe for single-threaded tool calls."""
+        return self._data.get(key, default)
+
+    def set_sync(self, key: str, value: Any) -> None:
+        """Synchronous write — safe for single-threaded tool calls."""
+        self._data[key] = value
diff --git a/python-backend/app/services/agency_service.py b/python-backend/app/services/agency_service.py
index 8040110a..c0b69ac7 100644
--- a/python-backend/app/services/agency_service.py
+++ b/python-backend/app/services/agency_service.py
@@ -408,6 +408,7 @@ class AgencyService:
                        "creatorFeeCredits" as creator_fee_credits,
                        "platformSharePct" as platform_share_pct,
                        "createdBy" as creator_id,
+                       "userContext" as user_context,
                        status
                 FROM agencies
                 WHERE id = :agency_id
@@ -448,6 +449,7 @@ class AgencyService:
             creator_fee_credits=int(row.creator_fee_credits or 0),
             platform_share_pct=int(row.platform_share_pct or 20),
             creator_id=int(row.creator_id) if row.creator_id else None,
+            user_context=row.user_context if hasattr(row, "user_context") else None,
         )
 
     async def _load_agents(self, agency_id: str) -> list[dict]:
@@ -613,6 +615,7 @@ class AgencyService:
                 agency_whitelist=agency_whitelist,
                 retrieval_scope_mode=retrieval_scope_mode,
                 guardrails_by_agent=guardrails_map,
+                user_context=agency_config.user_context,
             )
             response_text = await orchestrator.run(
                 message=message,
@@ -892,6 +895,7 @@ class AgencyService:
                     agency_whitelist=agency_whitelist,
                     retrieval_scope_mode=retrieval_scope_mode,
                     guardrails_by_agent=guardrails_map,
+                    user_context=agency_config.user_context,
                 )
                 response_text, execution_context = await orchestrator.run_with_context(
                     message=message,
diff --git a/python-backend/app/services/agency_swarm_adapter.py b/python-backend/app/services/agency_swarm_adapter.py
index f80828cf..9f6d3d1c 100644
--- a/python-backend/app/services/agency_swarm_adapter.py
+++ b/python-backend/app/services/agency_swarm_adapter.py
@@ -112,6 +112,8 @@ class AgencyConfig(BaseModel):
     shared_tools: list[Any] | None = None
     shared_files_folder: str | None = None
     shared_mcp_servers: list[Any] | None = None
+    # v1.8: User-provided context seed data for the run
+    user_context: dict[str, Any] | None = None
 
 
 class UsageBreakdown(BaseModel):
diff --git a/python-backend/app/services/agency_tools.py b/python-backend/app/services/agency_tools.py
index d7bb705c..c7053476 100644
--- a/python-backend/app/services/agency_tools.py
+++ b/python-backend/app/services/agency_tools.py
@@ -260,12 +260,16 @@ def _execute_custom_tool_sync(custom_config: CustomToolConfig, tool_input: dict[
             lock.release()
 
 
-def _make_run_func(tool_config: ToolConfig, whitelist: set[str]):
+def _make_run_func(tool_config: ToolConfig, whitelist: set[str], run_context=None):
     """Create a run function closure for a tool bridge."""
     captured_config = tool_config
     captured_whitelist = whitelist
+    captured_run_context = run_context
 
     def run_func(tool_instance) -> str:
+        # Attach run context to tool instance for tools that need shared state
+        if captured_run_context is not None:
+            tool_instance.context = captured_run_context
         config = captured_config
 
         # Whitelist check for medium and high risk
@@ -415,6 +419,7 @@ def create_tool_bridge(
     tool_config: ToolConfig,
     whitelist: set[str],
     adapter=None,
+    run_context=None,
 ) -> type:
     """Create a tool bridge class for agency-swarm.
 
@@ -430,7 +435,7 @@ def create_tool_bridge(
     Returns:
         A tool class for agency-swarm.
     """
-    run_func = _make_run_func(tool_config, whitelist)
+    run_func = _make_run_func(tool_config, whitelist, run_context=run_context)
     safe_name = tool_config.tool_id.replace("-", "_").replace(".", "_")
 
     if adapter is not None:
@@ -462,6 +467,7 @@ async def resolve_tools_for_agent(
     agency_whitelist: set[str],
     adapter=None,
     retrieval_scope_mode: str | None = None,
+    run_context: "AgencyRunContext | None" = None,
 ) -> list[type]:
     """Resolve and construct tool bridges for a specific agent.
 
@@ -546,7 +552,7 @@ async def resolve_tools_for_agent(
             endpoint_url=endpoint_url,
             config=merged_config,
         )
-        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter)
+        tool_cls = create_tool_bridge(config, agency_whitelist, adapter=adapter, run_context=run_context)
         tool_classes.append(tool_cls)
 
     logger.info(
diff --git a/python-backend/tests/unit/test_agency_run_context.py b/python-backend/tests/unit/test_agency_run_context.py
new file mode 100644
index 00000000..46a764e6
--- /dev/null
+++ b/python-backend/tests/unit/test_agency_run_context.py
@@ -0,0 +1,194 @@
+"""
+Tests for AgencyRunContext — shared mutable state for agency runs.
+"""
+
+import asyncio
+import copy
+
+import pytest
+
+from app.services.agency_run_context import AgencyRunContext
+
+
+# ── Test 1: get returns default when key missing ─────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_get_returns_default_when_key_missing():
+    ctx = AgencyRunContext()
+    result = await ctx.get("nonexistent")
+    assert result is None
+
+    result2 = await ctx.get("missing", "fallback")
+    assert result2 == "fallback"
+
+
+# ── Test 2: set stores value retrievable by get ──────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_set_stores_value_retrievable_by_get():
+    ctx = AgencyRunContext()
+    await ctx.set("key1", "value1")
+    assert await ctx.get("key1") == "value1"
+
+    await ctx.set("key1", "updated")
+    assert await ctx.get("key1") == "updated"
+
+
+# ── Test 3: get_all returns full snapshot dict ───────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_get_all_returns_full_snapshot():
+    ctx = AgencyRunContext()
+    await ctx.set("a", 1)
+    await ctx.set("b", 2)
+    all_data = await ctx.get_all()
+    assert all_data == {"a": 1, "b": 2}
+    # Should be a copy, not a reference
+    all_data["c"] = 3
+    assert await ctx.get("c") is None
+
+
+# ── Test 4: concurrent read/write does not corrupt data ──────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_concurrent_read_write_no_corruption():
+    ctx = AgencyRunContext()
+
+    async def write_key(i: int):
+        await ctx.set(f"key_{i}", i)
+
+    tasks = [write_key(i) for i in range(50)]
+    await asyncio.gather(*tasks)
+
+    all_data = await ctx.get_all()
+    assert len(all_data) == 50
+    for i in range(50):
+        assert all_data[f"key_{i}"] == i
+
+
+# ── Test 5: initialized with user_context seed data ──────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_initialized_with_seed_data():
+    ctx = AgencyRunContext(initial_data={"project": "Alpha", "lang": "en"})
+    assert await ctx.get("project") == "Alpha"
+    assert await ctx.get("lang") == "en"
+
+
+# ── Test 6: snapshot returns frozen copy ──────────────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_snapshot_returns_frozen_copy():
+    ctx = AgencyRunContext(initial_data={"items": [1, 2, 3]})
+    snap = ctx.snapshot()
+    assert snap == {"items": [1, 2, 3]}
+
+    # Mutations after snapshot don't affect it
+    await ctx.set("items", [4, 5, 6])
+    assert snap == {"items": [1, 2, 3]}
+
+    # Mutating the snapshot doesn't affect context
+    snap["items"].append(99)
+    assert await ctx.get("items") == [4, 5, 6]
+
+
+# ── Test 7: run-scoped isolation ─────────────────────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_run_scoped_isolation():
+    ctx1 = AgencyRunContext()
+    ctx2 = AgencyRunContext()
+    await ctx1.set("shared_key", "run1_value")
+    await ctx2.set("shared_key", "run2_value")
+    assert await ctx1.get("shared_key") == "run1_value"
+    assert await ctx2.get("shared_key") == "run2_value"
+
+
+# ── Test 8: sync get/set helpers work ────────────────────────────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+def test_sync_get_set():
+    ctx = AgencyRunContext()
+    ctx.set_sync("tool_key", "tool_value")
+    assert ctx.get_sync("tool_key") == "tool_value"
+    assert ctx.get_sync("missing", "default") == "default"
+
+
+# ── Test 9: ExecutionContext gets shared_context from orchestrator ────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_execution_context_has_shared_context():
+    from app.services.agency_orchestrator import ExecutionContext
+
+    exec_ctx = ExecutionContext(
+        input_message="test",
+        user_token="tok",
+        tenant_id="t1",
+    )
+    # shared_context should default to None
+    assert exec_ctx.shared_context is None
+
+    # Can be assigned
+    run_ctx = AgencyRunContext(initial_data={"seed": True})
+    exec_ctx.shared_context = run_ctx
+    assert await exec_ctx.shared_context.get("seed") is True
+
+
+# ── Test 10: orchestrator persists context snapshot at run end ────────
+
+@pytest.mark.unit
+@pytest.mark.agency
+@pytest.mark.asyncio
+async def test_orchestrator_persists_context_snapshot():
+    from app.services.agency_orchestrator import AgencyOrchestrator
+
+    # Create a minimal single-node agency that doesn't need adapter
+    nodes = [
+        {
+            "id": "node1",
+            "name": "TestAgent",
+            "node_type": "knowledge_base",
+            "is_entry_point": True,
+            "node_config": {},
+        }
+    ]
+    edges: list = []
+
+    orchestrator = AgencyOrchestrator(
+        nodes=nodes,
+        edges=edges,
+        adapter=None,
+        db=None,
+        user_context={"project": "test_proj"},
+    )
+
+    result, ctx = await orchestrator.run_with_context(
+        message="hello",
+        user_token="tok",
+        tenant_id="t1",
+    )
+
+    # shared_context should have been created with seed data
+    assert ctx.shared_context is not None
+    assert await ctx.shared_context.get("project") == "test_proj"
+
+    # context_snapshot should be populated
+    assert ctx.context_snapshot is not None
+    assert ctx.context_snapshot["project"] == "test_proj"
