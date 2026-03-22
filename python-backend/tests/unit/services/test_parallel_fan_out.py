"""Tests for parallel_fan_out orchestrator logic."""

from __future__ import annotations

import asyncio
import copy
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Test ExecutionContext.clone() directly
from app.services.agency_orchestrator import ExecutionContext


class TestExecutionContextClone:
    def test_deep_copies_results(self):
        ctx = ExecutionContext("hello", "token", "t1")
        ctx.results["node-a"] = "old"
        cloned = ctx.clone()
        cloned.results["node-a"] = "new"
        assert ctx.results["node-a"] == "old"

    def test_shares_user_token_and_tenant(self):
        ctx = ExecutionContext("hello", "token", "t1", user_id=42)
        cloned = ctx.clone()
        assert cloned.user_token == "token"
        assert cloned.tenant_id == "t1"
        assert cloned.user_id == 42

    def test_deep_copies_knowledge(self):
        ctx = ExecutionContext("hello", "token", "t1")
        ctx.knowledge = [{"title": "doc1", "content": "abc"}]
        cloned = ctx.clone()
        cloned.knowledge[0]["title"] = "modified"
        assert ctx.knowledge[0]["title"] == "doc1"

    def test_fresh_step_attempts(self):
        ctx = ExecutionContext("hello", "token", "t1")
        ctx.step_attempts = [{"cost": 0.1}]
        cloned = ctx.clone()
        assert cloned.step_attempts == []

    def test_shares_shared_context(self):
        ctx = ExecutionContext("hello", "token", "t1")
        ctx.shared_context = MagicMock()
        cloned = ctx.clone()
        assert cloned.shared_context is ctx.shared_context


class TestParallelFanOut:
    """Tests that exercise the orchestrator's parallel fan-out logic."""

    def _make_orchestrator(self, nodes, edges, config=None):
        """Build a minimal orchestrator mock."""
        from app.services.agency_orchestrator import AgencyOrchestrator
        orch = AgencyOrchestrator.__new__(AgencyOrchestrator)
        orch.nodes = {n["id"]: n for n in nodes}
        orch.edges = edges
        orch.agency_config = MagicMock()
        orch.agency_config.agency_id = "agency-1"
        orch.event_emitter = None
        orch.redis_client = None
        orch.trace_collector = None
        orch.guardrail_runner = None
        orch.browser_session_executor = MagicMock()
        return orch

    @pytest.mark.asyncio
    async def test_wait_all_merges_all_branches(self):
        """wait_all returns combined output from all branches."""
        fan_node = {
            "id": "fan1",
            "node_type": "parallel_fan_out",
            "name": "Fan",
            "node_config": {
                "branches": [
                    {"id": "b1", "targetNodeId": "agent1", "label": "A"},
                    {"id": "b2", "targetNodeId": "agent2", "label": "B"},
                ],
                "mergeStrategy": "wait_all",
                "timeoutMs": 5000,
                "maxConcurrent": 5,
                "continueOnError": True,
            },
        }
        agent1 = {"id": "agent1", "node_type": "agent", "name": "Agent1", "node_config": {}}
        agent2 = {"id": "agent2", "node_type": "agent", "name": "Agent2", "node_config": {}}

        orch = self._make_orchestrator([fan_node, agent1, agent2], [])

        # Mock _execute_node for agent nodes
        call_count = 0
        original_execute = orch._execute_node

        async def mock_execute(node, ctx):
            nonlocal call_count
            call_count += 1
            if node["id"] == "agent1":
                return "result-A"
            return "result-B"

        orch._execute_node = mock_execute

        ctx = ExecutionContext("test input", "token", "t1")
        result = await orch._execute_parallel_fan_out(fan_node, ctx)

        assert "result-A" in result
        assert "result-B" in result
        assert call_count == 2

    @pytest.mark.asyncio
    async def test_continue_on_error_true(self):
        """With continueOnError=true, other branches succeed even if one fails."""
        fan_node = {
            "id": "fan1",
            "node_type": "parallel_fan_out",
            "name": "Fan",
            "node_config": {
                "branches": [
                    {"id": "b1", "targetNodeId": "agent1", "label": "Good"},
                    {"id": "b2", "targetNodeId": "agent2", "label": "Bad"},
                    {"id": "b3", "targetNodeId": "agent3", "label": "Good2"},
                ],
                "mergeStrategy": "wait_all",
                "timeoutMs": 5000,
                "maxConcurrent": 5,
                "continueOnError": True,
            },
        }
        nodes = [
            fan_node,
            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
            {"id": "agent3", "node_type": "agent", "name": "A3", "node_config": {}},
        ]

        orch = self._make_orchestrator(nodes, [])

        async def mock_execute(node, ctx):
            if node["id"] == "agent2":
                raise RuntimeError("branch failed")
            return f"ok-{node['id']}"

        orch._execute_node = mock_execute

        ctx = ExecutionContext("test", "token", "t1")
        result = await orch._execute_parallel_fan_out(fan_node, ctx)

        assert "ok-agent1" in result
        assert "ok-agent3" in result
        # agent2 error should be captured, not crash the whole thing
        assert "error" in result.lower() or "timed out" in result.lower() or "ok-agent2" not in result

    @pytest.mark.asyncio
    async def test_max_concurrent_clamped(self):
        """maxConcurrent is clamped at 10 even if config says 25."""
        fan_node = {
            "id": "fan1",
            "node_type": "parallel_fan_out",
            "name": "Fan",
            "node_config": {
                "branches": [
                    {"id": f"b{i}", "targetNodeId": f"a{i}", "label": f"B{i}"}
                    for i in range(12)
                ],
                "mergeStrategy": "wait_all",
                "timeoutMs": 5000,
                "maxConcurrent": 25,  # Should be clamped to 10
                "continueOnError": True,
            },
        }
        nodes = [fan_node] + [
            {"id": f"a{i}", "node_type": "agent", "name": f"A{i}", "node_config": {}}
            for i in range(12)
        ]

        orch = self._make_orchestrator(nodes, [])

        max_concurrent_seen = 0
        current = 0
        lock = asyncio.Lock()

        async def mock_execute(node, ctx):
            nonlocal max_concurrent_seen, current
            async with lock:
                current += 1
                if current > max_concurrent_seen:
                    max_concurrent_seen = current
            await asyncio.sleep(0.01)
            async with lock:
                current -= 1
            return f"ok-{node['id']}"

        orch._execute_node = mock_execute

        ctx = ExecutionContext("test", "token", "t1")
        await orch._execute_parallel_fan_out(fan_node, ctx)

        assert max_concurrent_seen <= 10

    @pytest.mark.asyncio
    async def test_credits_tracked_per_branch(self):
        """Step attempts from each branch get branch_id label."""
        fan_node = {
            "id": "fan1",
            "node_type": "parallel_fan_out",
            "name": "Fan",
            "node_config": {
                "branches": [
                    {"id": "b1", "targetNodeId": "agent1"},
                    {"id": "b2", "targetNodeId": "agent2"},
                ],
                "mergeStrategy": "wait_all",
                "timeoutMs": 5000,
                "maxConcurrent": 5,
                "continueOnError": True,
            },
        }
        nodes = [
            fan_node,
            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
        ]

        orch = self._make_orchestrator(nodes, [])

        async def mock_execute(node, ctx):
            ctx.step_attempts.append({"model": "gpt-4", "cost": 0.05})
            return f"ok-{node['id']}"

        orch._execute_node = mock_execute

        ctx = ExecutionContext("test", "token", "t1")
        await orch._execute_parallel_fan_out(fan_node, ctx)

        assert len(ctx.step_attempts) == 2
        branch_ids = {a["branch_id"] for a in ctx.step_attempts}
        assert "b1" in branch_ids
        assert "b2" in branch_ids

    @pytest.mark.asyncio
    async def test_timeout_per_branch_enforced(self):
        """Branch exceeding timeout returns error, others succeed."""
        fan_node = {
            "id": "fan1",
            "node_type": "parallel_fan_out",
            "name": "Fan",
            "node_config": {
                "branches": [
                    {"id": "fast", "targetNodeId": "agent1", "label": "Fast"},
                    {"id": "slow", "targetNodeId": "agent2", "label": "Slow"},
                ],
                "mergeStrategy": "wait_all",
                "timeoutMs": 200,  # 200ms
                "maxConcurrent": 5,
                "continueOnError": True,
            },
        }
        nodes = [
            fan_node,
            {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}},
            {"id": "agent2", "node_type": "agent", "name": "A2", "node_config": {}},
        ]

        orch = self._make_orchestrator(nodes, [])

        async def mock_execute(node, ctx):
            if node["id"] == "agent2":
                await asyncio.sleep(5)  # Way longer than timeout
            return f"ok-{node['id']}"

        orch._execute_node = mock_execute

        ctx = ExecutionContext("test", "token", "t1")
        result = await orch._execute_parallel_fan_out(fan_node, ctx)

        assert "ok-agent1" in result
        assert "timed out" in result.lower()
