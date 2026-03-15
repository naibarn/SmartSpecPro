"""Tests for the workflow Browser Session executor."""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.orchestrator.node_executors.browser_session_executor import BrowserSessionExecutor
from app.services.live_browser_session_manager import LiveBrowserSessionRecord


def _make_context() -> ExecutionContext:
    return ExecutionContext(
        user_id=42,
        tenant_id="tenant-1",
        workflow_id="workflow-123",
        execution_id="exec-123",
    )


def _make_session(**overrides) -> LiveBrowserSessionRecord:
    defaults = {
        "session_id": "lbs_workflow_1",
        "tenant_id": "tenant-1",
        "user_id": 42,
        "source_type": "workflow",
        "source_id": "workflow-123",
        "status": "agent_running",
        "control_mode": "agent_control",
        "session_version": 3,
        "browser_context_ref": {
            "pageTitle": "Checkout",
            "url": "https://example.com/checkout",
        },
    }
    defaults.update(overrides)
    return LiveBrowserSessionRecord(**defaults)


@pytest.mark.asyncio
async def test_browser_session_start_creates_workflow_scoped_sessions():
    executor = BrowserSessionExecutor()
    data = NodeExecutionData(
        node_id="node-start",
        node_type="browser_session_start",
        config={"goal": "Collect checkout details", "startUrl": "https://example.com"},
        inputs={},
        state={},
    )

    with (
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_session_manager", return_value=MagicMock()),
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.orchestrator.node_executors.browser_session_executor.create_live_browser_session",
            return_value=SimpleNamespace(sessionId="lbs_workflow_1"),
        ) as create_session,
        patch(
            "app.orchestrator.node_executors.browser_session_executor.hydrate_live_browser_session",
            return_value=_make_session(),
        ),
    ):
        result = await executor.execute(data, _make_context())

    assert result["browserSessionId"] == "lbs_workflow_1"
    assert result["sessionStatus"] == "running"
    assert result["reviewState"] == "not_required"
    assert result["outcome"] == "continue"
    assert result["browserSessionArtifact"]["summary"]["badgeLabel"] == "AI In Control"
    assert result["browserSessionArtifact"]["launchContext"]["originSurface"] == "workflow"
    create_session.assert_called_once()
    assert create_session.call_args.kwargs["source_type"] == "workflow"
    assert create_session.call_args.kwargs["source_id"] == "workflow-123"


@pytest.mark.asyncio
async def test_browser_session_wait_for_user_exposes_pending_user_step():
    executor = BrowserSessionExecutor()
    data = NodeExecutionData(
        node_id="node-wait",
        node_type="browser_session_wait_for_user",
        config={"browserSessionId": "lbs_workflow_1", "waitReason": "Upload the invoice", "timeoutSeconds": 300},
        inputs={},
        state={},
    )
    manager = MagicMock()

    with (
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.orchestrator.node_executors.browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_session(session_version=3),
                _make_session(
                    status="waiting_for_human",
                    pending_assist_request_id="assist_1",
                    session_version=4,
                ),
            ],
        ),
    ):
        result = await executor.execute(data, _make_context())

    manager.request_assist.assert_called_once()
    assert result["sessionStatus"] == "waiting_for_user"
    assert result["outcome"] == "wait"
    assert result["pendingUserStep"]["reason"] == "Upload the invoice"
    assert result["pendingUserStep"]["resolved"] is False
    assert result["browserSessionArtifact"]["summary"]["badgeLabel"] == "Needs Your Input"


@pytest.mark.asyncio
async def test_browser_session_review_gate_exposes_pending_review_state():
    executor = BrowserSessionExecutor()
    data = NodeExecutionData(
        node_id="node-review",
        node_type="browser_session_review_gate",
        config={"browserSessionId": "lbs_workflow_1", "reviewSummary": "Confirm the payment details."},
        inputs={},
        state={},
    )
    manager = MagicMock()

    with (
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.orchestrator.node_executors.browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_session(session_version=5),
                _make_session(
                    pending_approval_request_id="approval_1",
                    session_version=6,
                ),
            ],
        ),
    ):
        result = await executor.execute(data, _make_context())

    manager.request_approval.assert_called_once()
    assert result["sessionStatus"] == "review_required"
    assert result["reviewState"] == "pending"
    assert result["outcome"] == "wait"
    assert result["browserSessionArtifact"]["summary"]["badgeLabel"] == "Review Required"


@pytest.mark.asyncio
async def test_browser_session_wait_for_user_preserves_captcha_barrier_summary():
    executor = BrowserSessionExecutor()
    data = NodeExecutionData(
        node_id="node-captcha",
        node_type="browser_session_wait_for_user",
        config={"browserSessionId": "lbs_workflow_1", "waitReason": "Complete the captcha", "timeoutSeconds": 300},
        inputs={},
        state={},
    )
    manager = MagicMock()

    with (
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.orchestrator.node_executors.browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_session(session_version=7),
                _make_session(
                    status="waiting_for_human",
                    pending_assist_request_id="assist_1",
                    session_version=8,
                    policy_context={"activeBarrier": {"type": "captcha_required"}},
                ),
            ],
        ),
    ):
        result = await executor.execute(data, _make_context())

    assert result["sessionStatus"] == "waiting_for_user"
    assert result["outcome"] == "wait"
    assert result["browserSessionSummary"]["barrierType"] == "captcha_required"
    assert result["browserSessionSummary"]["statusLine"] == "Captcha Required before AI can continue."
    assert result["browserSessionArtifact"]["summary"]["primaryActionLabel"] == "Take Control"
    assert result["pendingUserStep"]["reason"] == "Complete the captcha"


@pytest.mark.asyncio
async def test_browser_session_review_gate_preserves_payment_barrier_summary():
    executor = BrowserSessionExecutor()
    data = NodeExecutionData(
        node_id="node-payment",
        node_type="browser_session_review_gate",
        config={"browserSessionId": "lbs_workflow_1", "reviewSummary": "Approve payment before submit."},
        inputs={},
        state={},
    )
    manager = MagicMock()

    with (
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.orchestrator.node_executors.browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.orchestrator.node_executors.browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_session(session_version=9),
                _make_session(
                    pending_approval_request_id="approval_1",
                    session_version=10,
                    policy_context={"activeBarrier": {"type": "payment_review_required"}},
                ),
            ],
        ),
    ):
        result = await executor.execute(data, _make_context())

    assert result["sessionStatus"] == "review_required"
    assert result["reviewState"] == "pending"
    assert result["outcome"] == "wait"
    assert result["browserSessionSummary"]["barrierType"] == "payment_review_required"
    assert result["browserSessionSummary"]["statusLine"] == "Payment Review Required before AI can continue."
    assert result["browserSessionArtifact"]["summary"]["primaryActionLabel"] == "Review Payment"
