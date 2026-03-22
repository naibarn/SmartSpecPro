"""Tests for agency approval tool and orchestrator approval flow."""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_approval_tool import (
    RequestApprovalTool,
    await_approval_decision,
)
from app.services.agency_run_context import AgencyRunContext


@pytest.mark.unit
@pytest.mark.agency
class TestRequestApprovalTool:
    """Tests for the request_approval tool."""

    @pytest.mark.asyncio
    async def test_approval_required_event_emitted(self):
        """approval_required SSE event emitted with correct fields."""
        ctx = AgencyRunContext()
        emitter = AsyncMock()
        tool = RequestApprovalTool(
            agent_name="Analyst",
            run_context=ctx,
            event_emitter=emitter,
        )

        result = await tool.execute(step="Review data", summary="Found 3 anomalies")

        emitter.emit.assert_called_once()
        call_args = emitter.emit.call_args
        assert call_args[0][0] == "approval_required"
        data = call_args[0][1]
        assert data["step"] == "Review data"
        assert data["summary"] == "Found 3 anomalies"
        assert data["agentName"] == "Analyst"
        assert "approvalKey" in data
        # approvalKey should be a valid UUID
        uuid.UUID(data["approvalKey"])

    @pytest.mark.asyncio
    async def test_approval_written_to_context(self):
        """Approval request written to AgencyRunContext."""
        ctx = AgencyRunContext()
        emitter = AsyncMock()
        tool = RequestApprovalTool(
            agent_name="Analyst",
            run_context=ctx,
            event_emitter=emitter,
        )

        result = await tool.execute(step="Review data", summary="Found anomalies")

        # Extract approvalKey from emitter call
        data = emitter.emit.call_args[0][1]
        approval_key = data["approvalKey"]

        stored = await ctx.get(f"approval:{approval_key}")
        assert stored is not None
        assert stored["step"] == "Review data"
        assert stored["summary"] == "Found anomalies"
        assert stored["status"] == "pending"
        assert stored["agentName"] == "Analyst"

    @pytest.mark.asyncio
    async def test_tool_returns_structured_response(self):
        """Tool returns a string message for the agent."""
        ctx = AgencyRunContext()
        emitter = AsyncMock()
        tool = RequestApprovalTool(
            agent_name="Analyst",
            run_context=ctx,
            event_emitter=emitter,
        )

        result = await tool.execute(step="Review data", summary="test")

        assert isinstance(result, str)
        assert "approval" in result.lower() or "Approval" in result
        assert "Review data" in result

    @pytest.mark.asyncio
    async def test_approval_key_is_uuid(self):
        """approvalKey is a valid UUID v4 format."""
        ctx = AgencyRunContext()
        emitter = AsyncMock()
        tool = RequestApprovalTool(
            agent_name="Agent",
            run_context=ctx,
            event_emitter=emitter,
        )

        await tool.execute(step="test", summary="test")

        data = emitter.emit.call_args[0][1]
        parsed = uuid.UUID(data["approvalKey"])
        assert parsed.version == 4


@pytest.mark.unit
@pytest.mark.agency
class TestAwaitApprovalDecision:
    """Tests for the approval polling loop."""

    @pytest.mark.asyncio
    async def test_approved_returns_proceed_message(self):
        """Agent resumes with approval message on approved."""
        ctx = AgencyRunContext()
        approval_key = str(uuid.uuid4())
        await ctx.set(f"approval:{approval_key}", {
            "step": "Review data",
            "status": "approved",
        })

        result = await await_approval_decision(
            ctx, approval_key, "Review data", timeout_seconds=5, poll_interval=0.1,
        )

        assert "APPROVED" in result
        assert "Review data" in result
        # Verify key is consumed
        stored = await ctx.get(f"approval:{approval_key}")
        assert stored["status"] == "consumed"

    @pytest.mark.asyncio
    async def test_rejected_returns_feedback(self):
        """Agent receives rejection feedback."""
        ctx = AgencyRunContext()
        approval_key = str(uuid.uuid4())
        await ctx.set(f"approval:{approval_key}", {
            "step": "Review data",
            "status": "rejected",
            "feedback": "Incomplete analysis",
        })

        result = await await_approval_decision(
            ctx, approval_key, "Review data", timeout_seconds=5, poll_interval=0.1,
        )

        assert "REJECTED" in result
        assert "Incomplete analysis" in result

    @pytest.mark.asyncio
    async def test_timeout_terminates(self):
        """Approval timeout returns timeout message."""
        ctx = AgencyRunContext()
        approval_key = str(uuid.uuid4())
        await ctx.set(f"approval:{approval_key}", {
            "step": "Review data",
            "status": "pending",
        })

        result = await await_approval_decision(
            ctx, approval_key, "Review data", timeout_seconds=0.3, poll_interval=0.1,
        )

        assert "timed out" in result.lower()

    @pytest.mark.asyncio
    async def test_key_consumed_after_approval(self):
        """approvalKey marked as consumed after use."""
        ctx = AgencyRunContext()
        approval_key = str(uuid.uuid4())
        await ctx.set(f"approval:{approval_key}", {
            "step": "test",
            "status": "approved",
        })

        await await_approval_decision(
            ctx, approval_key, "test", timeout_seconds=5, poll_interval=0.1,
        )

        stored = await ctx.get(f"approval:{approval_key}")
        assert stored["status"] == "consumed"

    @pytest.mark.asyncio
    async def test_polls_until_decision(self):
        """Polling detects status change from pending to approved."""
        ctx = AgencyRunContext()
        approval_key = str(uuid.uuid4())
        await ctx.set(f"approval:{approval_key}", {
            "step": "test",
            "status": "pending",
        })

        # Set up a task to approve after a short delay
        async def approve_later():
            await asyncio.sleep(0.25)
            await ctx.set(f"approval:{approval_key}", {
                "step": "test",
                "status": "approved",
            })

        asyncio.create_task(approve_later())

        result = await await_approval_decision(
            ctx, approval_key, "test", timeout_seconds=5, poll_interval=0.1,
        )

        assert "APPROVED" in result
