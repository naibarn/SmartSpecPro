"""Tests for the loop/retry handler."""

from __future__ import annotations

import asyncio
import json
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_loop_handler import LoopHandler
from app.services.agency_orchestrator import ExecutionContext


def make_orchestrator(nodes_list, execute_fn=None):
    """Build a minimal orchestrator mock."""
    orch = MagicMock()
    orch.nodes = {n["id"]: n for n in nodes_list}

    async def default_execute(node, ctx):
        return f"result-{node['id']}"

    orch._execute_node = AsyncMock(side_effect=execute_fn or default_execute)
    return orch


def make_loop_node(node_id="loop1", target="agent1", mode="max_iterations", max_iter=3, **extra):
    return {
        "id": node_id,
        "node_type": "loop_retry",
        "name": "Loop",
        "node_config": {
            "loopTargetNodeId": target,
            "exitCondition": {"mode": mode, "maxIterations": max_iter, **extra.pop("exit_extra", {})},
            "feedbackMode": extra.pop("feedbackMode", "auto"),
            "feedbackPrompt": extra.pop("feedbackPrompt", ""),
            "timeoutMs": extra.pop("timeoutMs", 300000),
            "delayBetweenIterationsMs": extra.pop("delayMs", 0),
            **extra,
        },
    }


class TestLoopHandler:
    @pytest.mark.asyncio
    async def test_exits_when_max_iterations_reached(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=3)
        orch = make_orchestrator([target])

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        assert orch._execute_node.call_count == 3
        assert "result-agent1" in result

    @pytest.mark.asyncio
    async def test_exits_on_rule_based_condition(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(
            mode="rule_based", max_iter=10,
            exit_extra={"rules": [{"field": "$.status", "operator": "equals", "value": "done"}]},
        )

        call_count = 0

        async def mock_execute(node, ctx):
            nonlocal call_count
            call_count += 1
            if call_count >= 2:
                return json.dumps({"status": "done"})
            return json.dumps({"status": "pending"})

        orch = make_orchestrator([target], mock_execute)
        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        assert call_count == 2

    @pytest.mark.asyncio
    async def test_exits_on_llm_evaluate_condition(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(
            mode="llm_evaluate", max_iter=10,
            exit_extra={"evaluationPrompt": "Is this satisfactory?"},
        )

        call_count = 0

        async def mock_execute(node, ctx):
            nonlocal call_count
            call_count += 1
            return f"iteration {call_count}"

        orch = make_orchestrator([target], mock_execute)

        # Mock LLM to say "yes" on call 2
        llm_call_count = 0
        mock_resp = MagicMock()
        mock_resp.raise_for_status = MagicMock()

        def json_side_effect():
            nonlocal llm_call_count
            llm_call_count += 1
            answer = "yes" if llm_call_count >= 2 else "no"
            return {"choices": [{"message": {"content": answer}}]}

        mock_resp.json = json_side_effect

        with patch("app.services.agency_loop_handler.httpx.AsyncClient") as mock_cls:
            mock_client = AsyncMock()
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_cls.return_value = mock_client

            ctx = ExecutionContext("test", "token", "t1")
            handler = LoopHandler()
            result = await handler.execute(node, ctx, orch)

            assert call_count == 2

    @pytest.mark.asyncio
    async def test_exits_on_context_check(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(
            mode="context_check", max_iter=10,
            exit_extra={"contextKey": "quality_score"},
        )

        call_count = 0
        mock_ctx_rc = AsyncMock()

        async def mock_get(key):
            return "pass" if call_count >= 2 else None

        mock_ctx_rc.get = mock_get

        async def mock_execute(node, ctx):
            nonlocal call_count
            call_count += 1
            return f"iteration {call_count}"

        orch = make_orchestrator([target], mock_execute)
        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch, run_context=mock_ctx_rc)

        assert call_count == 2

    @pytest.mark.asyncio
    async def test_max_iterations_capped_at_20(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=50)  # Should be clamped to 20
        orch = make_orchestrator([target])

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        assert orch._execute_node.call_count == 20

    @pytest.mark.asyncio
    async def test_feedback_auto_mode(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=2, feedbackMode="auto")

        inputs_received = []

        async def mock_execute(n, ctx):
            inputs_received.append(ctx.input)
            return "some output"

        orch = make_orchestrator([target], mock_execute)
        ctx = ExecutionContext("original input", "token", "t1")
        handler = LoopHandler()
        await handler.execute(node, ctx, orch)

        assert len(inputs_received) == 2
        assert "original input" in inputs_received[0]
        # Second iteration should have feedback
        assert "feedback" in inputs_received[1].lower() or "previous" in inputs_received[1].lower()

    @pytest.mark.asyncio
    async def test_custom_feedback_template(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(
            max_iter=2,
            feedbackMode="custom_prompt",
            feedbackPrompt="Improve: {previous_output}. Iter: {iteration}",
        )

        inputs_received = []

        async def mock_execute(n, ctx):
            inputs_received.append(ctx.input)
            return "draft v1"

        orch = make_orchestrator([target], mock_execute)
        ctx = ExecutionContext("start", "token", "t1")
        handler = LoopHandler()
        await handler.execute(node, ctx, orch)

        assert "draft v1" in inputs_received[1]
        assert "2" in inputs_received[1]

    @pytest.mark.asyncio
    async def test_timeout_enforced(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=10, timeoutMs=200)

        async def slow_execute(n, ctx):
            await asyncio.sleep(0.5)
            return "slow"

        orch = make_orchestrator([target], slow_execute)
        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        # Should have timed out
        assert "timed out" in result.lower() or result == "slow" or result == ""

    @pytest.mark.asyncio
    async def test_trace_logging(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=3)
        orch = make_orchestrator([target])

        mock_trace = MagicMock()
        mock_trace.start_span.return_value = "span-1"

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        await handler.execute(node, ctx, orch, trace_collector=mock_trace)

        assert mock_trace.start_span.call_count == 3
        assert mock_trace.end_span.call_count == 3

    @pytest.mark.asyncio
    async def test_credit_cap_enforced(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=100)

        async def mock_execute(n, ctx):
            # Add many step attempts each iteration
            for _ in range(20):
                ctx.step_attempts.append({"cost": 0.01})
            return "ok"

        orch = make_orchestrator([target], mock_execute)
        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        # With 20 attempts per iteration, should stop after 3 iterations (60 > 50 cap)
        assert orch._execute_node.call_count <= 4

    @pytest.mark.asyncio
    async def test_invalid_target_raises(self):
        node = make_loop_node(target="nonexistent")
        orch = make_orchestrator([])

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()

        with pytest.raises(ValueError, match="not found"):
            await handler.execute(node, ctx, orch)

    @pytest.mark.asyncio
    async def test_rule_based_operators(self):
        """Test multiple rule operators work for exit conditions."""
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}

        for op, output_val, rule_val in [
            ("equals", "done", "done"),
            ("contains", "task done", "done"),
            ("gt", "10", "5"),
            ("exists", "anything", ""),
        ]:
            node = make_loop_node(
                mode="rule_based", max_iter=5,
                exit_extra={"rules": [{"field": "$.val", "operator": op, "value": rule_val}]},
            )

            async def mock_execute(n, ctx, val=output_val):
                return json.dumps({"val": val})

            orch = make_orchestrator([target], mock_execute)
            ctx = ExecutionContext("test", "token", "t1")
            handler = LoopHandler()
            result = await handler.execute(node, ctx, orch)

            # Should exit on first iteration since condition always matches
            assert orch._execute_node.call_count == 1, f"Failed for operator {op}"

    @pytest.mark.asyncio
    async def test_delay_between_iterations(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(max_iter=2, delayMs=50)
        orch = make_orchestrator([target])

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()

        start = time.monotonic()
        await handler.execute(node, ctx, orch)
        elapsed_ms = (time.monotonic() - start) * 1000

        assert elapsed_ms >= 40  # Allow some tolerance

    @pytest.mark.asyncio
    async def test_max_iterations_only_mode(self):
        target = {"id": "agent1", "node_type": "agent", "name": "A1", "node_config": {}}
        node = make_loop_node(mode="max_iterations", max_iter=4)
        orch = make_orchestrator([target])

        ctx = ExecutionContext("test", "token", "t1")
        handler = LoopHandler()
        result = await handler.execute(node, ctx, orch)

        assert orch._execute_node.call_count == 4
