"""Targeted runtime checks for AgencyOrchestrator execution."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.agency_orchestrator import AgencyOrchestrator, ExecutionContext
from app.services.live_browser_session_manager import LiveBrowserSessionRecord

pytestmark = [pytest.mark.unit, pytest.mark.agency]


def _make_browser_session(**overrides) -> LiveBrowserSessionRecord:
    defaults = {
        "session_id": "lbs_agency_1",
        "tenant_id": "tenant-1",
        "user_id": 7,
        "source_type": "agency",
        "source_id": "agency-1",
        "status": "agent_running",
        "control_mode": "agent_control",
        "session_version": 3,
        "browser_context_ref": {
            "pageTitle": "Flights",
            "url": "https://example.com/flights",
        },
        "policy_context": {},
    }
    defaults.update(overrides)
    return LiveBrowserSessionRecord(**defaults)


@pytest.mark.asyncio
async def test_agent_node_uses_whitelist_scope_and_adapter_run():
    adapter = MagicMock()
    adapter.create_agent = MagicMock(return_value=MagicMock(name="Agent"))
    adapter.create_agency = MagicMock(return_value="agency-object")
    adapter.run = AsyncMock(return_value=MagicMock(response="done"))

    orchestrator = AgencyOrchestrator(
        nodes=[{
            "id": "agent-1",
            "name": "Researcher",
            "instructions": "Research",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "agent",
            "node_config": {},
        }],
        edges=[],
        adapter=adapter,
        db=AsyncMock(),
        agency_config=MagicMock(
            system_prompt="Parent prompt",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=321,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
        agency_whitelist={"builtin-document-search"},
        retrieval_scope_mode="library_only",
    )
    ctx = ExecutionContext("Hello", "tok", "tenant-1", user_id=7)

    with patch(
        "app.services.agency_tools.resolve_tools_for_agent",
        AsyncMock(return_value=["tool-class"]),
    ) as mock_resolve_tools:
        result = await orchestrator._execute_agent_node(orchestrator.entry_node, ctx)

    assert result == "done"
    mock_resolve_tools.assert_awaited_once()
    assert mock_resolve_tools.await_args.kwargs["agency_whitelist"] == {"builtin-document-search"}
    assert mock_resolve_tools.await_args.kwargs["retrieval_scope_mode"] == "library_only"
    adapter.run.assert_awaited_once()
    run_kwargs = adapter.run.await_args.kwargs
    assert run_kwargs["timeout_seconds"] == 321
    assert run_kwargs["tenant_id"] == "tenant-1"
    assert run_kwargs["agency_id"] == "sub-agent-1"


@pytest.mark.asyncio
async def test_browser_session_node_creates_session_and_records_artifact():
    orchestrator = AgencyOrchestrator(
        nodes=[{
            "id": "browser-1",
            "name": "Travel Browser",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "browser_session",
            "node_config": {
                "goal": "Compare flight prices to Tokyo",
                "startUrl": "https://example.com/flights",
                "handoffMode": "continue_running",
            },
        }],
        edges=[],
        adapter=MagicMock(),
        db=AsyncMock(),
        agency_config=MagicMock(
            agency_id="agency-1",
            system_prompt="Parent prompt",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=321,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    ctx = ExecutionContext("Find the best fare", "tok", "tenant-1", user_id=7)
    manager = MagicMock()

    with (
        patch("app.services.agency_browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.services.agency_browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.services.agency_browser_session_executor.create_live_browser_session",
            return_value=MagicMock(sessionId="lbs_agency_1"),
        ) as create_session,
        patch(
            "app.services.agency_browser_session_executor.hydrate_live_browser_session",
            return_value=_make_browser_session(),
        ),
    ):
        result = await orchestrator._execute_node(orchestrator.entry_node, ctx)

    assert result == "AI is controlling this Browser Session."
    assert ctx.active_browser_session_id == "lbs_agency_1"
    assert len(ctx.browser_sessions) == 1
    artifact = ctx.browser_sessions[0]
    assert artifact["sessionId"] == "lbs_agency_1"
    assert artifact["summary"]["state"] == "ai_in_control"
    assert artifact["summary"]["primaryActionLabel"] == "Continue in Browser"
    create_session.assert_called_once()
    assert create_session.call_args.kwargs["source_type"] == "agency"
    assert create_session.call_args.kwargs["source_id"] == "agency-1"


@pytest.mark.asyncio
async def test_browser_session_node_review_required_requests_approval():
    orchestrator = AgencyOrchestrator(
        nodes=[{
            "id": "browser-1",
            "name": "Travel Browser",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "browser_session",
            "node_config": {
                "goal": "Compare hotel options",
                "handoffMode": "review_required",
                "handoffSummary": "Confirm the selected hotel before booking.",
            },
        }],
        edges=[],
        adapter=MagicMock(),
        db=AsyncMock(),
        agency_config=MagicMock(
            agency_id="agency-1",
            system_prompt="Parent prompt",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=321,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    ctx = ExecutionContext("Find a hotel", "tok", "tenant-1", user_id=7)
    manager = MagicMock()

    with (
        patch("app.services.agency_browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.services.agency_browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.services.agency_browser_session_executor.create_live_browser_session",
            return_value=MagicMock(sessionId="lbs_agency_1"),
        ),
        patch(
            "app.services.agency_browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_browser_session(session_version=3),
                _make_browser_session(
                    pending_approval_request_id="approval_1",
                    session_version=4,
                ),
            ],
        ),
    ):
        result = await orchestrator._execute_node(orchestrator.entry_node, ctx)

    manager.request_approval.assert_called_once()
    assert result == "Review Required before AI can continue."
    assert ctx.browser_sessions[0]["summary"]["state"] == "review_required"
    assert ctx.browser_sessions[0]["summary"]["primaryActionLabel"] == "Continue in Browser"


@pytest.mark.asyncio
async def test_browser_session_node_reuses_active_session_for_follow_up_goal():
    orchestrator = AgencyOrchestrator(
        nodes=[{
            "id": "browser-1",
            "name": "Travel Browser",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "browser_session",
            "node_config": {
                "goal": "Refine to refundable options only",
                "handoffMode": "continue_running",
            },
        }],
        edges=[],
        adapter=MagicMock(),
        db=AsyncMock(),
        agency_config=MagicMock(
            agency_id="agency-1",
            system_prompt="Parent prompt",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=321,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    ctx = ExecutionContext("Refine results", "tok", "tenant-1", user_id=7)
    ctx.active_browser_session_id = "lbs_agency_1"
    ctx.browser_sessions = [{
        "sessionId": "lbs_agency_1",
        "summary": {
            "sessionId": "lbs_agency_1",
            "state": "ai_in_control",
            "badgeLabel": "AI In Control",
            "statusLine": "AI is controlling this Browser Session.",
            "primaryActionLabel": "Continue in Browser",
            "pageTitle": "Flights",
            "url": "https://example.com/flights",
            "compactNotice": None,
            "sourceLabel": "Agency",
        },
        "updatedAt": "2026-03-12T10:05:00.000Z",
    }]
    manager = MagicMock()

    with (
        patch("app.services.agency_browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.services.agency_browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.services.agency_browser_session_executor.create_live_browser_session",
        ) as create_session,
        patch(
            "app.services.agency_browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_browser_session(session_version=4),
                _make_browser_session(session_version=5),
            ],
        ),
    ):
        result = await orchestrator._execute_node(orchestrator.entry_node, ctx)

    create_session.assert_not_called()
    manager.send_command.assert_called_once()
    assert manager.send_command.call_args.kwargs["command_text"] == "Refine to refundable options only"
    assert result == "AI is controlling this Browser Session."
    assert len(ctx.browser_sessions) == 1
    assert ctx.browser_sessions[0]["sessionId"] == "lbs_agency_1"


@pytest.mark.asyncio
async def test_browser_session_node_take_control_requests_takeover_handoff():
    orchestrator = AgencyOrchestrator(
        nodes=[{
            "id": "browser-1",
            "name": "Travel Browser",
            "instructions": "",
            "model": "gpt-4o-mini",
            "model_settings": None,
            "is_entry_point": True,
            "node_type": "browser_session",
            "node_config": {
                "goal": "Log in and finish checkout",
                "handoffMode": "take_control",
                "handoffSummary": "Take over to complete login and payment.",
            },
        }],
        edges=[],
        adapter=MagicMock(),
        db=AsyncMock(),
        agency_config=MagicMock(
            agency_id="agency-1",
            system_prompt="Parent prompt",
            user_id=7,
            conversation_id="conv-1",
            max_run_time_seconds=321,
            credit_multiplier=1.0,
            creator_fee_credits=0,
            platform_share_pct=20,
            creator_id=None,
        ),
    )
    ctx = ExecutionContext("Book the room", "tok", "tenant-1", user_id=7)
    manager = MagicMock()

    with (
        patch("app.services.agency_browser_session_executor.get_live_browser_session_manager", return_value=manager),
        patch("app.services.agency_browser_session_executor.get_live_browser_adapter", return_value=MagicMock()),
        patch(
            "app.services.agency_browser_session_executor.create_live_browser_session",
            return_value=MagicMock(sessionId="lbs_agency_1"),
        ),
        patch(
            "app.services.agency_browser_session_executor.hydrate_live_browser_session",
            side_effect=[
                _make_browser_session(session_version=3),
                _make_browser_session(
                    status="waiting_for_human",
                    pending_assist_request_id="assist_1",
                    session_version=4,
                ),
            ],
        ),
    ):
        result = await orchestrator._execute_node(orchestrator.entry_node, ctx)

    manager.request_assist.assert_called_once()
    assert manager.request_assist.call_args.kwargs["request_type"] == "takeover_required"
    assert result == "Take control to continue this Browser Session."
    assert ctx.browser_sessions[0]["summary"]["state"] == "needs_user_input"
    assert ctx.browser_sessions[0]["summary"]["primaryActionLabel"] == "Take Control"
