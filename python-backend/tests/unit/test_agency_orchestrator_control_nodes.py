"""Focused tests for orchestrator control-node behavior."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext
from app.services.agency_run_context import AgencyRunContext


def _make_orchestrator() -> AgencyOrchestrator:
    orchestrator = AgencyOrchestrator.__new__(AgencyOrchestrator)
    orchestrator.nodes = {}
    orchestrator.edges = []
    orchestrator.event_emitter = None
    orchestrator.redis_client = None
    orchestrator.trace_collector = None
    orchestrator.guardrail_runner = None
    orchestrator.error_handler_map = {}
    return orchestrator


@pytest.mark.unit
@pytest.mark.agency
class TestAgencyOrchestratorControlNodes:
    @pytest.mark.asyncio
    async def test_router_llm_classify_uses_router_model(self):
        orchestrator = _make_orchestrator()
        ctx = ExecutionContext("Need help with billing", "token-123", "tenant-1")
        router_node = {
            "id": "router-1",
            "name": "Router",
            "model": "gpt-4.1-mini",
            "node_config": {
                "routingMode": "llm_classify",
                "routes": [
                    {"label": "billing", "targetNodeId": "billing-agent"},
                    {"label": "support", "targetNodeId": "support-agent"},
                ],
                "defaultTargetNodeId": "fallback-agent",
            },
        }

        with patch("app.services.agency_orchestrator.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"content": "billing"}
            mock_client.post.return_value = mock_response

            result = await orchestrator._route(router_node, ctx)

        request_json = mock_client.post.call_args.kwargs["json"]
        assert request_json["model"] == "gpt-4.1-mini"
        assert result == "billing-agent"

    @pytest.mark.asyncio
    async def test_aggregator_respects_min_responses_threshold(self):
        orchestrator = _make_orchestrator()
        orchestrator.edges = [
            {"from_node_id": "agent-1", "to_node_id": "agg-1"},
            {"from_node_id": "agent-2", "to_node_id": "agg-1"},
        ]
        ctx = ExecutionContext("hello", "token-123", "tenant-1")
        ctx.results = {"agent-1": "Only one response is ready"}
        agg_node = {
            "id": "agg-1",
            "name": "Aggregator",
            "node_config": {
                "aggregationMode": "concatenate",
                "minResponses": 2,
            },
        }

        result = await orchestrator._aggregate(agg_node, ctx)

        assert "1 of 2 required responses" in result
        assert "Only one response is ready" in result

    @pytest.mark.asyncio
    async def test_aggregator_llm_merge_uses_selected_model(self):
        orchestrator = _make_orchestrator()
        orchestrator.edges = [
            {"from_node_id": "agent-1", "to_node_id": "agg-1"},
            {"from_node_id": "agent-2", "to_node_id": "agg-1"},
        ]
        ctx = ExecutionContext("hello", "token-123", "tenant-1")
        ctx.results = {
            "agent-1": "First answer",
            "agent-2": "Second answer",
        }
        agg_node = {
            "id": "agg-1",
            "name": "Aggregator",
            "model": "gpt-4o-mini",
            "node_config": {
                "aggregationMode": "llm_merge",
                "mergeInstructions": "Merge the inputs",
                "minResponses": 2,
            },
        }

        with patch("app.services.agency_orchestrator.httpx.AsyncClient") as mock_client_cls:
            mock_client = AsyncMock()
            mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_response = MagicMock()
            mock_response.status_code = 200
            mock_response.json.return_value = {"content": "Merged response"}
            mock_client.post.return_value = mock_response

            result = await orchestrator._aggregate(agg_node, ctx)

        request_json = mock_client.post.call_args.kwargs["json"]
        assert request_json["model"] == "gpt-4o-mini"
        assert result == "Merged response"

    @pytest.mark.asyncio
    async def test_human_approval_uses_quorum_metadata_and_full_timeout(self):
        orchestrator = _make_orchestrator()
        orchestrator.event_emitter = SimpleNamespace(run_id="run-123")
        orchestrator.redis_client = AsyncMock()

        ctx = ExecutionContext("Approve publishing", "token-123", "tenant-1", user_id=7)
        ctx.shared_context = AgencyRunContext()

        approval_node = {
            "id": "approval-1",
            "name": "Approval Gate",
            "node_config": {
                "approvalMessage": "Review before publish",
                "timeoutHours": 48,
                "onTimeout": "auto_reject",
                "approvers": ["1", "2"],
                "requireAllApprovers": True,
            },
        }

        tool_instance = AsyncMock()

        with patch(
            "app.orchestrator.node_executors.approval_executor._resolve_approvers",
            AsyncMock(return_value=[1, 2]),
        ), patch(
            "app.services.agency_approval_tool.RequestApprovalTool",
            return_value=tool_instance,
        ), patch(
            "app.services.agency_approval_tool.await_approval_decision",
            AsyncMock(return_value="[Human approval: APPROVED for 'Review before publish' — proceeding]"),
        ) as await_decision:
            result = await orchestrator._await_approval(approval_node, ctx)

        execute_kwargs = tool_instance.execute.await_args.kwargs
        assert execute_kwargs["metadata"]["requiredApprovers"] == 2
        assert execute_kwargs["metadata"]["approvers"] == ["1", "2"]
        await_decision.assert_awaited_once()
        assert await_decision.await_args.kwargs["timeout_seconds"] == 48 * 3600
        orchestrator.redis_client.setex.assert_awaited_once()
        assert "APPROVED" in result
