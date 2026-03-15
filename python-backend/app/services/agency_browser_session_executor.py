"""Browser Session execution helper for AgencyOrchestrator."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal
from uuid import uuid4

from app.services.live_browser_contract import (
    LiveBrowserSessionArtifact,
    LiveBrowserSessionSummary,
)
from app.services.live_browser_runtime import (
    create_live_browser_session,
    get_live_browser_adapter,
    get_live_browser_session_manager,
    hydrate_live_browser_session,
)
from app.services.live_browser_session_manager import (
    LiveBrowserSessionRecord,
    get_live_browser_barrier_type,
)

if TYPE_CHECKING:
    from app.services.agency_orchestrator import ExecutionContext, NodeRow

BrowserHandoffMode = Literal[
    "continue_running",
    "review_required",
    "needs_user_input",
    "take_control",
]

CONTINUE_LABEL = "Continue in Browser"
REOPEN_LABEL = "Reopen Browser Session"
TAKE_CONTROL_LABEL = "Take Control"


def _base_summary(session: LiveBrowserSessionRecord) -> dict[str, Any]:
    if session.status in {
        "completed",
        "cancelled",
        "expired",
        "failed",
        "failed_recovery_required",
    }:
        return {
            "state": "session_ended",
            "badgeLabel": "Session Ended",
            "statusLine": "This Browser Session has ended.",
            "primaryActionLabel": REOPEN_LABEL,
        }

    barrier_type = get_live_browser_barrier_type(session)

    if session.pending_approval_request_id and barrier_type == "payment_review_required":
        return {
            "state": "review_required",
            "barrierType": barrier_type,
            "badgeLabel": "Payment Review Required",
            "statusLine": "Payment Review Required before AI can continue.",
            "primaryActionLabel": "Review Payment",
        }

    if session.pending_approval_request_id and barrier_type == "booking_confirmation_required":
        return {
            "state": "review_required",
            "barrierType": barrier_type,
            "badgeLabel": "Booking Confirmation Required",
            "statusLine": "Booking Confirmation Required before AI can continue.",
            "primaryActionLabel": "Review Booking",
        }

    if session.pending_approval_request_id:
        return {
            "state": "review_required",
            "barrierType": barrier_type,
            "badgeLabel": "Review Required",
            "statusLine": "Review Required before AI can continue.",
            "primaryActionLabel": CONTINUE_LABEL,
        }

    if (session.pending_assist_request_id or session.status == "waiting_for_human") and barrier_type == "login_required":
        return {
            "state": "needs_user_input",
            "barrierType": barrier_type,
            "badgeLabel": "Login Required",
            "statusLine": "Login Required before AI can continue.",
            "primaryActionLabel": TAKE_CONTROL_LABEL,
        }

    if (session.pending_assist_request_id or session.status == "waiting_for_human") and barrier_type == "captcha_required":
        return {
            "state": "needs_user_input",
            "barrierType": barrier_type,
            "badgeLabel": "Captcha Required",
            "statusLine": "Captcha Required before AI can continue.",
            "primaryActionLabel": TAKE_CONTROL_LABEL,
        }

    if session.pending_assist_request_id or session.status == "waiting_for_human":
        return {
            "state": "needs_user_input",
            "barrierType": barrier_type,
            "badgeLabel": "Needs Your Input",
            "statusLine": "Needs Your Input before AI can continue.",
            "primaryActionLabel": CONTINUE_LABEL,
        }

    if session.status == "human_controlling":
        return {
            "state": "person_in_control",
            "badgeLabel": "You Are In Control",
            "statusLine": "You are controlling this Browser Session.",
            "primaryActionLabel": CONTINUE_LABEL,
        }

    if session.control_mode == "agent_control" or session.status == "agent_running":
        return {
            "state": "ai_in_control",
            "badgeLabel": "AI In Control",
            "statusLine": "AI is controlling this Browser Session.",
            "primaryActionLabel": CONTINUE_LABEL,
        }

    return {
        "state": "running",
        "badgeLabel": "In Progress",
        "statusLine": "AI is working in this Browser Session.",
        "primaryActionLabel": CONTINUE_LABEL,
    }


def _build_summary(
    session: LiveBrowserSessionRecord,
    *,
    handoff_mode: BrowserHandoffMode,
) -> LiveBrowserSessionSummary:
    summary = _base_summary(session)
    if handoff_mode == "take_control" and (
        session.pending_assist_request_id or session.status == "waiting_for_human"
    ):
        summary["badgeLabel"] = TAKE_CONTROL_LABEL
        summary["statusLine"] = "Take control to continue this Browser Session."
        summary["primaryActionLabel"] = TAKE_CONTROL_LABEL

    return LiveBrowserSessionSummary.model_validate({
        "sessionId": session.session_id,
        "state": summary["state"],
        "barrierType": summary.get("barrierType"),
        "badgeLabel": summary["badgeLabel"],
        "statusLine": summary["statusLine"],
        "primaryActionLabel": summary["primaryActionLabel"],
        "pageTitle": session.browser_context_ref.get("pageTitle"),
        "url": session.browser_context_ref.get("url"),
        "compactNotice": None,
        "sourceLabel": "Agency",
    })


def _build_artifact(
    session: LiveBrowserSessionRecord,
    *,
    handoff_mode: BrowserHandoffMode,
) -> dict[str, Any]:
    artifact = LiveBrowserSessionArtifact.model_validate({
        "sessionId": session.session_id,
        "summary": _build_summary(session, handoff_mode=handoff_mode).model_dump(),
        "updatedAt": session.last_activity_at.isoformat(),
    })
    return artifact.model_dump(exclude_none=True)


def _upsert_browser_session_artifact(
    ctx: "ExecutionContext",
    artifact: dict[str, Any],
) -> None:
    session_id = str(artifact.get("sessionId") or "").strip()
    if not session_id:
        return

    updated = False
    for index, existing in enumerate(ctx.browser_sessions):
        if existing.get("sessionId") == session_id:
            ctx.browser_sessions[index] = artifact
            updated = True
            break
    if not updated:
        ctx.browser_sessions.append(artifact)
    ctx.active_browser_session_id = session_id


def _agency_actor_id(ctx: "ExecutionContext", agency_id: str | None) -> str:
    if ctx.user_id:
        return str(ctx.user_id)
    if agency_id:
        return f"agency:{agency_id}"
    return "agency:runtime"


class AgencyBrowserSessionExecutor:
    """Create or resume agency-scoped Browser Sessions inside orchestrated runs."""

    async def execute(
        self,
        node: "NodeRow",
        ctx: "ExecutionContext",
        *,
        agency_id: str | None = None,
    ) -> dict[str, Any]:
        config = node.get("node_config") or {}
        goal = str(config.get("goal") or "").strip()
        if not goal:
            return {"result": "[Browser Session node requires a goal]"}

        handoff_mode = str(config.get("handoffMode") or "continue_running")
        if handoff_mode not in {
            "continue_running",
            "review_required",
            "needs_user_input",
            "take_control",
        }:
            handoff_mode = "continue_running"
        handoff_summary = str(config.get("handoffSummary") or "").strip()
        start_url = str(config.get("startUrl") or "").strip() or None

        manager = get_live_browser_session_manager()
        adapter = get_live_browser_adapter()
        actor_id = _agency_actor_id(ctx, agency_id)
        session_id = ctx.active_browser_session_id

        if session_id:
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session_id,
            )
            manager.send_command(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{node['id']}-instruction-{uuid4().hex}",
                actor_type="agent",
                actor_id=f"agency:{agency_id or 'runtime'}:{node['id']}",
                command_text=goal,
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session.session_id,
            )
        else:
            created = create_live_browser_session(
                manager=manager,
                adapter=adapter,
                tenant_id=ctx.tenant_id,
                user_id=ctx.user_id,
                source_type="agency",
                source_id=agency_id,
                actor_id=actor_id,
                initial_url=start_url,
                mode="observe",
                browser_policy_context={
                    "originSurface": "agency",
                    "agencyId": agency_id,
                    "nodeId": node["id"],
                },
                execution_intent={"prompt": goal},
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=created.sessionId,
            )

        if handoff_mode == "review_required":
            manager.request_approval(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{node['id']}-approval-{uuid4().hex}",
                actor_id=f"agency:{agency_id or 'runtime'}:{node['id']}",
                approval_request_id=f"approval_{uuid4().hex[:10]}",
                prompt=handoff_summary or "Review this Browser Session before AI continues.",
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session.session_id,
            )
        elif handoff_mode == "needs_user_input":
            manager.request_assist(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{node['id']}-assist-{uuid4().hex}",
                actor_id=f"agency:{agency_id or 'runtime'}:{node['id']}",
                assist_request_id=f"assist_{uuid4().hex[:10]}",
                request_type="field_input",
                prompt=handoff_summary or "User input is required before AI can continue.",
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session.session_id,
            )
        elif handoff_mode == "take_control":
            manager.request_assist(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{node['id']}-take-control-{uuid4().hex}",
                actor_id=f"agency:{agency_id or 'runtime'}:{node['id']}",
                assist_request_id=f"assist_{uuid4().hex[:10]}",
                request_type="takeover_required",
                prompt=handoff_summary or "Take control before AI can continue.",
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session.session_id,
            )

        artifact = _build_artifact(session, handoff_mode=handoff_mode)
        _upsert_browser_session_artifact(ctx, artifact)
        return {
            "browserSessionId": session.session_id,
            "artifact": artifact,
            "result": artifact["summary"]["statusLine"],
        }
