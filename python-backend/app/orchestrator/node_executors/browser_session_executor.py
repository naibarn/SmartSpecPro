"""Workflow executor for collaborative Browser Session nodes."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import quote
from uuid import uuid4

import structlog

from app.orchestrator.node_executors.base import ExecutionContext, NodeExecutionData
from app.services.live_browser_runtime import (
    create_live_browser_session,
    get_live_browser_adapter,
    get_live_browser_session_manager,
    hydrate_live_browser_session,
)
from app.services.live_browser_session_manager import LiveBrowserSessionRecord
from app.services.live_browser_session_manager import get_live_browser_barrier_type

logger = structlog.get_logger(__name__)

def _resolve_session_status(session: LiveBrowserSessionRecord) -> str:
    if session.status == "expired":
        return "expired"
    if session.status in {"failed", "cancelled", "failed_recovery_required"}:
        return "failed"
    if session.status == "completed":
        return "completed"
    if session.pending_approval_request_id:
        return "review_required"
    if session.pending_assist_request_id or session.status == "waiting_for_human":
        return "waiting_for_user"
    return "running"


def _resolve_review_state(session: LiveBrowserSessionRecord) -> str:
    return "pending" if session.pending_approval_request_id else "not_required"


def _resolve_outcome(session_status: str) -> str:
    if session_status in {"review_required", "waiting_for_user"}:
        return "wait"
    if session_status in {"failed", "expired"}:
        return "fail"
    return "continue"


def _build_summary(session: LiveBrowserSessionRecord) -> dict[str, Any]:
    presentation = _build_presentation_state(session)
    barrier_type = get_live_browser_barrier_type(session)

    return {
        "sessionId": session.session_id,
        "originSurface": "workflow",
        "state": presentation["state"],
        "barrierType": barrier_type,
        "badgeLabel": presentation["badgeLabel"],
        "statusLine": presentation["statusLine"],
        "primaryActionLabel": presentation["primaryActionLabel"],
        "pageTitle": session.browser_context_ref.get("pageTitle"),
        "url": session.browser_context_ref.get("url"),
        "compactNotice": None,
        "sourceLabel": "Workflow",
    }


def _build_presentation_state(session: LiveBrowserSessionRecord) -> dict[str, str]:
    session_status = _resolve_session_status(session)
    barrier_type = get_live_browser_barrier_type(session)
    if session_status == "review_required" and barrier_type == "payment_review_required":
        return {
            "state": "review_required",
            "badgeLabel": "Payment Review Required",
            "statusLine": "Payment Review Required before AI can continue.",
            "primaryActionLabel": "Review Payment",
        }
    if session_status == "review_required" and barrier_type == "booking_confirmation_required":
        return {
            "state": "review_required",
            "badgeLabel": "Booking Confirmation Required",
            "statusLine": "Booking Confirmation Required before AI can continue.",
            "primaryActionLabel": "Review Booking",
        }
    if session_status == "review_required":
        return {
            "state": "review_required",
            "badgeLabel": "Review Required",
            "statusLine": "Review Required before AI can continue.",
            "primaryActionLabel": "Continue in Browser",
        }
    if session_status == "waiting_for_user" and barrier_type == "login_required":
        return {
            "state": "needs_user_input",
            "badgeLabel": "Login Required",
            "statusLine": "Login Required before AI can continue.",
            "primaryActionLabel": "Take Control",
        }
    if session_status == "waiting_for_user" and barrier_type == "captcha_required":
        return {
            "state": "needs_user_input",
            "badgeLabel": "Captcha Required",
            "statusLine": "Captcha Required before AI can continue.",
            "primaryActionLabel": "Take Control",
        }
    if session_status == "waiting_for_user":
        return {
            "state": "needs_user_input",
            "badgeLabel": "Needs Your Input",
            "statusLine": "Needs Your Input before AI can continue.",
            "primaryActionLabel": "Continue in Browser",
        }
    if session_status == "completed":
        return {
            "state": "session_ended",
            "badgeLabel": "Session Ended",
            "statusLine": "This Browser Session has ended.",
            "primaryActionLabel": "Reopen Browser Session",
        }
    if session_status in {"failed", "expired"}:
        return {
            "state": "session_ended",
            "badgeLabel": "Session Ended",
            "statusLine": "This Browser Session has ended.",
            "primaryActionLabel": "Reopen Browser Session",
        }
    if session.status == "human_controlling":
        return {
            "state": "person_in_control",
            "badgeLabel": "You Are In Control",
            "statusLine": "You are controlling this Browser Session.",
            "primaryActionLabel": "Continue in Browser",
        }
    if session.control_mode == "agent_control" or session.status == "agent_running":
        return {
            "state": "ai_in_control",
            "badgeLabel": "AI In Control",
            "statusLine": "AI is controlling this Browser Session.",
            "primaryActionLabel": "Continue in Browser",
        }
    return {
        "state": "running",
        "badgeLabel": "In Progress",
        "statusLine": "AI is working in this Browser Session.",
        "primaryActionLabel": "Continue in Browser",
    }


def _build_launch_context(
    *,
    workflow_id: str | None,
    session_id: str,
) -> dict[str, Any]:
    if not workflow_id:
        return {
            "originSurface": "workflow",
            "originLabel": "Workflow",
        }

    encoded_workflow_id = quote(str(workflow_id), safe="")
    encoded_session_id = quote(session_id, safe="")
    return {
        "originSurface": "workflow",
        "originLabel": "Workflow",
        "sourceId": str(workflow_id),
        "returnContext": {
            "path": f"/workflows/editor/{encoded_workflow_id}?browserSessionId={encoded_session_id}",
            "label": "Return to Workflow",
        },
    }


def _build_artifact(
    session: LiveBrowserSessionRecord,
    *,
    workflow_id: str | None,
) -> dict[str, Any]:
    return {
        "sessionId": session.session_id,
        "summary": _build_summary(session),
        "launchContext": _build_launch_context(workflow_id=workflow_id, session_id=session.session_id),
        "updatedAt": session.last_activity_at.isoformat(),
    }


def _build_pending_user_step(
    *,
    session: LiveBrowserSessionRecord,
    wait_reason: str | None,
    timeout_seconds: int | None,
) -> dict[str, Any] | None:
    if not session.pending_assist_request_id:
        return None

    expires_at = None
    if timeout_seconds and timeout_seconds > 0:
        expires_at = (datetime.now(UTC) + timedelta(seconds=timeout_seconds)).isoformat()

    return {
        "type": "field_input",
        "reason": wait_reason or "User input is required.",
        "expiresAt": expires_at,
        "resolved": False,
    }


def _build_output(
    *,
    session: LiveBrowserSessionRecord,
    context: ExecutionContext,
    pending_user_step: dict[str, Any] | None,
) -> dict[str, Any]:
    session_status = _resolve_session_status(session)
    return {
        "browserSessionId": session.session_id,
        "sessionStatus": session_status,
        "browserSessionSummary": _build_summary(session),
        "browserSessionArtifact": _build_artifact(session, workflow_id=context.workflow_id),
        "reviewState": _resolve_review_state(session),
        "pendingUserStep": pending_user_step,
        "outcome": _resolve_outcome(session_status),
    }


class BrowserSessionExecutor:
    """Executor shared by workflow Browser Session nodes."""

    async def execute(
        self,
        data: NodeExecutionData,
        context: ExecutionContext,
    ) -> dict[str, Any]:
        node_type = data.node_type
        inputs = data.inputs or {}
        config = data.config or {}

        manager = get_live_browser_session_manager()
        adapter = get_live_browser_adapter()

        if node_type == "browser_session_start":
            goal = str(inputs.get("goal") or config.get("goal") or "").strip()
            if not goal:
                return {"error": "browser_session_start requires a goal"}

            start_url = inputs.get("startUrl") or config.get("startUrl")
            launch_context = inputs.get("launchContext") or config.get("launchContext") or {}
            actor_id = str(context.user_id or f"workflow-{context.workflow_id}")
            created = create_live_browser_session(
                manager=manager,
                adapter=adapter,
                tenant_id=context.tenant_id or "",
                user_id=context.user_id,
                source_type="workflow",
                source_id=context.workflow_id,
                actor_id=actor_id,
                initial_url=str(start_url) if start_url else None,
                mode="observe",
                browser_policy_context={
                    "originSurface": "workflow",
                    "workflowId": context.workflow_id,
                    "nodeId": data.node_id,
                    "launchContext": launch_context,
                },
                execution_intent={"prompt": goal},
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=created.sessionId,
            )
            return _build_output(
                session=session,
                context=context,
                pending_user_step=None,
            )

        browser_session_id = str(
            inputs.get("browserSessionId")
            or config.get("browserSessionId")
            or "",
        ).strip()
        if not browser_session_id:
            return {"error": f"{node_type} requires browserSessionId"}

        session = hydrate_live_browser_session(
            manager=manager,
            adapter=adapter,
            session_id=browser_session_id,
        )

        if node_type == "browser_session_instruction":
            instruction_text = str(
                inputs.get("instructionText")
                or config.get("instructionText")
                or "",
            ).strip()
            if not instruction_text:
                return {"error": "browser_session_instruction requires instructionText"}
            manager.send_command(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{data.node_id}-instruction-{uuid4().hex}",
                actor_type="agent",
                actor_id=f"workflow:{context.workflow_id}:{data.node_id}",
                command_text=instruction_text,
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=browser_session_id,
            )
            return _build_output(
                session=session,
                context=context,
                pending_user_step=None,
            )

        if node_type == "browser_session_wait_for_user":
            wait_reason = str(inputs.get("waitReason") or config.get("waitReason") or "").strip()
            timeout_seconds = inputs.get("timeoutSeconds") or config.get("timeoutSeconds")
            manager.request_assist(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{data.node_id}-assist-{uuid4().hex}",
                actor_id=f"workflow:{context.workflow_id}:{data.node_id}",
                assist_request_id=f"assist_{uuid4().hex[:10]}",
                request_type="field_input",
                prompt=wait_reason or "User input is required before the workflow can continue.",
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=browser_session_id,
            )
            return _build_output(
                session=session,
                context=context,
                pending_user_step=_build_pending_user_step(
                    session=session,
                    wait_reason=wait_reason,
                    timeout_seconds=int(timeout_seconds) if timeout_seconds else None,
                ),
            )

        if node_type == "browser_session_review_gate":
            review_reason = str(inputs.get("reviewReason") or config.get("reviewReason") or "").strip()
            review_summary = str(inputs.get("reviewSummary") or config.get("reviewSummary") or "").strip()
            prompt = review_summary or review_reason or "Review Required before the workflow can continue."
            manager.request_approval(
                session_id=session.session_id,
                expected_session_version=session.session_version,
                idempotency_key=f"{data.node_id}-approval-{uuid4().hex}",
                actor_id=f"workflow:{context.workflow_id}:{data.node_id}",
                approval_request_id=f"approval_{uuid4().hex[:10]}",
                prompt=prompt,
            )
            session = hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=browser_session_id,
            )
            return _build_output(
                session=session,
                context=context,
                pending_user_step=None,
            )

        logger.warning("browser_session_executor_unknown_node_type", node_type=node_type)
        return {"error": f"Unsupported browser session node type: {node_type}"}
