diff --git a/apps/web/client/src/components/agency/nodes/ParallelFanOutNodeCard.tsx b/apps/web/client/src/components/agency/nodes/ParallelFanOutNodeCard.tsx
new file mode 100644
index 00000000..93b3190f
--- /dev/null
+++ b/apps/web/client/src/components/agency/nodes/ParallelFanOutNodeCard.tsx
@@ -0,0 +1,86 @@
+import { memo } from "react";
+import { Handle, Position } from "reactflow";
+import type { NodeProps } from "reactflow";
+import { Split, AlertCircle } from "lucide-react";
+import { cn } from "@/lib/utils";
+import type { AgencyNodeData } from "./types";
+
+export const ParallelFanOutNodeCard = memo(function ParallelFanOutNodeCard({
+  data,
+  selected,
+}: NodeProps<AgencyNodeData>) {
+  const hasErrors = (data.validationErrors?.length ?? 0) > 0;
+  const branches = (data.nodeConfig?.branches as Array<{ id: string; label?: string }>) ?? [];
+  const mergeStrategy = (data.nodeConfig?.mergeStrategy as string) ?? "wait_all";
+
+  const mergeLabel: Record<string, string> = {
+    wait_all: "Wait All",
+    first_complete: "First",
+    majority: "Majority",
+    custom_prompt: "Custom",
+  };
+
+  return (
+    <div
+      className={cn(
+        "w-52 rounded-lg border-2 bg-white shadow-sm transition-all relative",
+        "border-cyan-300",
+        selected && "ring-2 ring-cyan-500 shadow-md border-cyan-500",
+      )}
+    >
+      {/* Input handle */}
+      <Handle
+        type="target"
+        position={Position.Top}
+        style={{ top: -8 }}
+        className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-white"
+      />
+
+      <div className="px-3 py-2">
+        <div className="flex items-start justify-between gap-1 mb-1">
+          <div className="flex items-center gap-1.5 min-w-0">
+            <Split className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
+            <span className="truncate text-sm font-semibold text-slate-800">{data.name}</span>
+          </div>
+          {hasErrors && <AlertCircle className="h-3 w-3 text-red-500 shrink-0" />}
+        </div>
+
+        <div className="flex items-center gap-1.5 mt-0.5">
+          <span className="text-[10px] bg-cyan-50 text-cyan-700 px-1.5 py-0.5 rounded border border-cyan-200">
+            {mergeLabel[mergeStrategy] ?? mergeStrategy}
+          </span>
+          <span className="text-[11px] text-slate-400">
+            {branches.length} branch{branches.length !== 1 ? "es" : ""}
+          </span>
+        </div>
+      </div>
+
+      {/* Source handles — one per branch, spread evenly at bottom */}
+      {branches.map((branch, i) => {
+        const offset = branches.length > 1
+          ? 20 + (i / (branches.length - 1)) * 60
+          : 50;
+        return (
+          <Handle
+            key={branch.id ?? `branch-${i}`}
+            type="source"
+            position={Position.Bottom}
+            id={branch.id ?? `branch-${i}`}
+            style={{ left: `${offset}%` }}
+            className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-cyan-100"
+          />
+        );
+      })}
+
+      {/* Default output handle when no branches */}
+      {branches.length === 0 && (
+        <Handle
+          type="source"
+          position={Position.Bottom}
+          id="default"
+          className="!h-2.5 !w-2.5 !border-2 !border-cyan-400 !bg-cyan-100"
+        />
+      )}
+    </div>
+  );
+});
diff --git a/apps/web/server/services/__tests__/parallelFanOutValidation.test.ts b/apps/web/server/services/__tests__/parallelFanOutValidation.test.ts
new file mode 100644
index 00000000..36a83643
--- /dev/null
+++ b/apps/web/server/services/__tests__/parallelFanOutValidation.test.ts
@@ -0,0 +1,106 @@
+import { describe, it, expect } from "vitest";
+import { z } from "zod";
+
+/**
+ * Tests for parallel_fan_out nodeConfig validation schemas.
+ */
+
+const branchSchema = z.object({
+  id: z.string().min(1),
+  targetNodeId: z.string().min(1),
+  taskDescription: z.string().max(500).optional(),
+  label: z.string().max(100).optional(),
+});
+
+const parallelFanOutSchema = z.object({
+  branches: z.array(branchSchema).min(2, "At least 2 branches required"),
+  mergeStrategy: z.enum(["wait_all", "first_complete", "majority", "custom_prompt"]),
+  mergePrompt: z.string().max(1000).optional(),
+  timeoutMs: z.number().int().min(1000).max(600000).default(120000),
+  maxConcurrent: z.number().int().min(1).max(10).default(5),
+  continueOnError: z.boolean().default(true),
+}).superRefine((data, ctx) => {
+  if (data.mergeStrategy === "custom_prompt" && !data.mergePrompt?.trim()) {
+    ctx.addIssue({ code: "custom", path: ["mergePrompt"], message: "custom_prompt requires mergePrompt" });
+  }
+});
+
+describe("parallel_fan_out validation", () => {
+  it("validates branches array has >= 2 entries", () => {
+    const oneBranch = parallelFanOutSchema.safeParse({
+      branches: [{ id: "b1", targetNodeId: "n1" }],
+      mergeStrategy: "wait_all",
+    });
+    expect(oneBranch.success).toBe(false);
+
+    const twoBranches = parallelFanOutSchema.safeParse({
+      branches: [
+        { id: "b1", targetNodeId: "n1" },
+        { id: "b2", targetNodeId: "n2" },
+      ],
+      mergeStrategy: "wait_all",
+    });
+    expect(twoBranches.success).toBe(true);
+  });
+
+  it("validates mergeStrategy is one of 4 allowed values", () => {
+    const base = {
+      branches: [
+        { id: "b1", targetNodeId: "n1" },
+        { id: "b2", targetNodeId: "n2" },
+      ],
+    };
+
+    expect(parallelFanOutSchema.safeParse({ ...base, mergeStrategy: "invalid" }).success).toBe(false);
+
+    for (const s of ["wait_all", "first_complete", "majority", "custom_prompt"]) {
+      const result = parallelFanOutSchema.safeParse({
+        ...base,
+        mergeStrategy: s,
+        ...(s === "custom_prompt" ? { mergePrompt: "Summarize" } : {}),
+      });
+      expect(result.success).toBe(true);
+    }
+  });
+
+  it("validates maxConcurrent between 1 and 10", () => {
+    const base = {
+      branches: [
+        { id: "b1", targetNodeId: "n1" },
+        { id: "b2", targetNodeId: "n2" },
+      ],
+      mergeStrategy: "wait_all" as const,
+    };
+
+    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 0 }).success).toBe(false);
+    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 11 }).success).toBe(false);
+    expect(parallelFanOutSchema.safeParse({ ...base, maxConcurrent: 5 }).success).toBe(true);
+  });
+
+  it("validates mergePrompt required when custom_prompt", () => {
+    const base = {
+      branches: [
+        { id: "b1", targetNodeId: "n1" },
+        { id: "b2", targetNodeId: "n2" },
+      ],
+      mergeStrategy: "custom_prompt" as const,
+    };
+
+    expect(parallelFanOutSchema.safeParse(base).success).toBe(false);
+    expect(parallelFanOutSchema.safeParse({ ...base, mergePrompt: "Summarize these results" }).success).toBe(true);
+  });
+
+  it("validates timeoutMs is positive integer with reasonable bounds", () => {
+    const base = {
+      branches: [
+        { id: "b1", targetNodeId: "n1" },
+        { id: "b2", targetNodeId: "n2" },
+      ],
+      mergeStrategy: "wait_all" as const,
+    };
+
+    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 0 }).success).toBe(false);
+    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 600001 }).success).toBe(false);
+    expect(parallelFanOutSchema.safeParse({ ...base, timeoutMs: 120000 }).success).toBe(true);
+  });
+});
diff --git a/python-backend/tests/unit/services/test_parallel_fan_out.py b/python-backend/tests/unit/services/test_parallel_fan_out.py
new file mode 100644
index 00000000..2ad58d3d
--- /dev/null
+++ b/python-backend/tests/unit/services/test_parallel_fan_out.py
@@ -0,0 +1,279 @@
+"""Tests for parallel_fan_out orchestrator logic."""
+
+from __future__ import annotations
+
+import asyncio
+import copy
+import json
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+# Test ExecutionContext.clone() directly
+from app.services.agency_orchestrator import ExecutionContext
+
+
+class TestExecutionContextClone:
+    def test_deep_copies_results(self):
+        ctx = ExecutionContext("hello", "token", "t1")
+        ctx.results["node-a"] = "old"
+        cloned = ctx.clone()
+        cloned.results["node-a"] = "new"
+        assert ctx.results["node-a"] == "old"
+
+    def test_shares_user_token_and_tenant(self):
+        ctx = ExecutionContext("hello", "token", "t1", user_id=42)
+        cloned = ctx.clone()
+        assert cloned.user_token == "token"
+        assert cloned.tenant_id == "t1"
+        assert cloned.user_id == 42
+
+    def test_deep_copies_knowledge(self):
+        ctx = ExecutionContext("hello", "token", "t1")
+        ctx.knowledge = [{"title": "doc1", "content": "abc"}]
+        cloned = ctx.clone()
+        cloned.knowledge[0]["title"] = "modified"
+        assert ctx.knowledge[0]["title"] == "doc1"
+
+    def test_fresh_step_attempts(self):
+        ctx = ExecutionContext("hello", "token", "t1")
+        ctx.step_attempts = [{"cost": 0.1}]
+        cloned = ctx.clone()
+        assert cloned.step_attempts == []
+
+    def test_shares_shared_context(self):
+        ctx = ExecutionContext("hello", "token", "t1")
+        ctx.shared_context = MagicMock()
+        cloned = ctx.clone()
+        assert cloned.shared_context is ctx.shared_context
+
+
+class TestParallelFanOut:
+    """Tests that exercise the orchestrator's parallel fan-out logic."""
+
+    def _make_orchestrator(self, nodes, edges, config=None):
+        """Build a minimal orchestrator mock."""
+        from app.services.agency_orchestrator import AgencyOrchestrator
+        orch = AgencyOrchestrator.__new__(AgencyOrchestrator)
+        orch.nodes = {n["id"]: n for n in nodes}
+        orch.edges = edges
+        orch.agency_config = MagicMock()
+        orch.agency_config.agency_id = "agency-1"
+        orch.event_emitter = None
+        orch.redis_client = None
+        orch.trace_collector = None
+        orch.guardrail_runner = None
+        orch.browser_session_executor = MagicMock()
+        return orch
+
+    @pytest.mark.asyncio
+    async def test_wait_all_merges_all_branches(self):
+        """wait_all returns combined output from all branches."""
+        fan_node = {
+            "id": "fan1",
+            "node_type": "parallel_fan_out",
+            "name": "Fan",
+            "node_config": {
+                "branches": [
+                    {"id": "b1", "targetNodeId": "agent1", "label": "A"},
+                    {"id": "b2", "targetNodeId": "agent2", "label": "B"},
+                ],
+                "mergeStrategy": "wait_all",
+                "timeoutMs": 5000,
+                "maxConcurrent": 5,
+                "continueOnError": True,
+            },
+        }
+        agent1 = {"id": "agent1", "node_type": "agent", "name": "Agent1", "node_config": {}}
+        agent2 = {"id": "agent2", "node_type": "agent", "name": "Agent2", "node_config": {}}
+
+        orch = self._make_orchestrator([fan_node, agent1, agent2], [])
+
+        # Mock _execute_node for agent nodes
+        call_count = 0
+        original_execute = orch._execute_node
+
+        async def mock_execute(node, ctx):
+            nonlocal call_count
+            call_count += 1
+            if node["id"] == "agent1":
+                return "result-A"
+            return "result-B"
+
+        orch._execute_node = mock_execute
+
+        ctx = ExecutionContext("test input", "token", "t1")
+        result = await orch._execute_parallel_fan_out(fan_node, ctx)
+
+        assert "result-A" in result
+        assert "result-B" in result
+        assert call_count == 2
+
+    @pytest.mark.asyncio
+    async def test_continue_on_error_true(self):
+        """With continueOnError=true, other branches succeed even if one fails."""
+        fan_node = {
+            "id": "fan1",
+            "node_type": "parallel_fan_out",
+            "name": "Fan",
+            "node_config": {
+                "branches": [
+                    {"id": "b1", "targetNodeId": "agent1", "label": "Good"},
+                    {"id": "b2", "targetNodeId": "agent2", "label": "Bad"},
+                    {"id": "b3", "targetNodeId": "agent3", "label": "Good2"},
+                ],
+                "mergeStrategy": "wait_all",
+                "timeoutMs": 5000,
+                "maxConcurrent": 5,
+                "continueOnError": True,
+            },
+        }
+        nodes = [
+            fan_node,
+            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
+            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
+            {"id": "agent3", "node_type": "agent", "name": "A3", "node_config": {}},
+        ]
+
+        orch = self._make_orchestrator(nodes, [])
+
+        async def mock_execute(node, ctx):
+            if node["id"] == "agent2":
+                raise RuntimeError("branch failed")
+            return f"ok-{node['id']}"
+
+        orch._execute_node = mock_execute
+
+        ctx = ExecutionContext("test", "token", "t1")
+        result = await orch._execute_parallel_fan_out(fan_node, ctx)
+
+        assert "ok-agent1" in result
+        assert "ok-agent3" in result
+        # agent2 error should be captured, not crash the whole thing
+        assert "error" in result.lower() or "timed out" in result.lower() or "ok-agent2" not in result
+
+    @pytest.mark.asyncio
+    async def test_max_concurrent_clamped(self):
+        """maxConcurrent is clamped at 10 even if config says 25."""
+        fan_node = {
+            "id": "fan1",
+            "node_type": "parallel_fan_out",
+            "name": "Fan",
+            "node_config": {
+                "branches": [
+                    {"id": f"b{i}", "targetNodeId": f"a{i}", "label": f"B{i}"}
+                    for i in range(12)
+                ],
+                "mergeStrategy": "wait_all",
+                "timeoutMs": 5000,
+                "maxConcurrent": 25,  # Should be clamped to 10
+                "continueOnError": True,
+            },
+        }
+        nodes = [fan_node] + [
+            {"id": f"a{i}", "node_type": "agent", "name": f"A{i}", "node_config": {}}
+            for i in range(12)
+        ]
+
+        orch = self._make_orchestrator(nodes, [])
+
+        max_concurrent_seen = 0
+        current = 0
+        lock = asyncio.Lock()
+
+        async def mock_execute(node, ctx):
+            nonlocal max_concurrent_seen, current
+            async with lock:
+                current += 1
+                if current > max_concurrent_seen:
+                    max_concurrent_seen = current
+            await asyncio.sleep(0.01)
+            async with lock:
+                current -= 1
+            return f"ok-{node['id']}"
+
+        orch._execute_node = mock_execute
+
+        ctx = ExecutionContext("test", "token", "t1")
+        await orch._execute_parallel_fan_out(fan_node, ctx)
+
+        assert max_concurrent_seen <= 10
+
+    @pytest.mark.asyncio
+    async def test_credits_tracked_per_branch(self):
+        """Step attempts from each branch get branch_id label."""
+        fan_node = {
+            "id": "fan1",
+            "node_type": "parallel_fan_out",
+            "name": "Fan",
+            "node_config": {
+                "branches": [
+                    {"id": "b1", "targetNodeId": "agent1"},
+                    {"id": "b2", "targetNodeId": "agent2"},
+                ],
+                "mergeStrategy": "wait_all",
+                "timeoutMs": 5000,
+                "maxConcurrent": 5,
+                "continueOnError": True,
+            },
+        }
+        nodes = [
+            fan_node,
+            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
+            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
+        ]
+
+        orch = self._make_orchestrator(nodes, [])
+
+        async def mock_execute(node, ctx):
+            ctx.step_attempts.append({"model": "gpt-4", "cost": 0.05})
+            return f"ok-{node['id']}"
+
+        orch._execute_node = mock_execute
+
+        ctx = ExecutionContext("test", "token", "t1")
+        await orch._execute_parallel_fan_out(fan_node, ctx)
+
+        assert len(ctx.step_attempts) == 2
+        branch_ids = {a["branch_id"] for a in ctx.step_attempts}
+        assert "b1" in branch_ids
+        assert "b2" in branch_ids
+
+    @pytest.mark.asyncio
+    async def test_timeout_per_branch_enforced(self):
+        """Branch exceeding timeout returns error, others succeed."""
+        fan_node = {
+            "id": "fan1",
+            "node_type": "parallel_fan_out",
+            "name": "Fan",
+            "node_config": {
+                "branches": [
+                    {"id": "fast", "targetNodeId": "agent1", "label": "Fast"},
+                    {"id": "slow", "targetNodeId": "agent2", "label": "Slow"},
+                ],
+                "mergeStrategy": "wait_all",
+                "timeoutMs": 200,  # 200ms
+                "maxConcurrent": 5,
+                "continueOnError": True,
+            },
+        }
+        nodes = [
+            fan_node,
+            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
+            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
+        ]
+
+        orch = self._make_orchestrator(nodes, [])
+
+        async def mock_execute(node, ctx):
+            if node["id"] == "agent2":
+                await asyncio.sleep(5)  # Way longer than timeout
+            return f"ok-{node['id']}"
+
+        orch._execute_node = mock_execute
+
+        ctx = ExecutionContext("test", "token", "t1")
+        result = await orch._execute_parallel_fan_out(fan_node, ctx)
+
+        assert "ok-agent1" in result
+        assert "timed out" in result.lower()
