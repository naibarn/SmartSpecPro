"""Internal live-browser API for the Node gateway."""

from __future__ import annotations

import secrets
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from pydantic import Field

from app.core.config import settings
from app.services.live_browser_adapter import LiveBrowserProviderError, ManagedLiveBrowserAdapter
from app.services.live_browser_contract import (
    LiveBrowserCancelSessionRequest,
    LiveBrowserCancelSessionResponse,
    LiveBrowserCreateSessionRequest,
    LiveBrowserCreateSessionResponse,
    LiveBrowserErrorResponse,
    LiveBrowserGetSessionRequest,
    LiveBrowserListEventsRequest,
    LiveBrowserListEventsResponse,
    LiveBrowserPauseAgentRequest,
    LiveBrowserPauseAgentResponse,
    LiveBrowserResolveApprovalRequest,
    LiveBrowserResolveApprovalResponse,
    LiveBrowserReturnControlRequest,
    LiveBrowserReturnControlResponse,
    LiveBrowserSendCommandRequest,
    LiveBrowserSendCommandResponse,
    LiveBrowserSession,
    LiveBrowserSubmitAssistResponseRequest,
    LiveBrowserSubmitAssistResponseResponse,
    LiveBrowserTakeControlRequest,
    LiveBrowserTakeControlResponse,
    StrictModel,
)
from app.services.live_browser_runtime import (
    create_live_browser_session,
    get_live_browser_adapter,
    get_live_browser_session_manager,
    hydrate_live_browser_session,
    issue_resume_stream,
    serialize_live_browser_event,
    serialize_live_browser_session,
)
from app.services.live_browser_session_manager import (
    LiveBrowserSessionManager,
    LiveBrowserSessionMutationError,
)

router = APIRouter(prefix="/api/v1/live-browser", tags=["live-browser"])


class LiveBrowserGatewayEnvelope(StrictModel):
    request: Any
    tenantId: str
    userId: int = Field(ge=0)
    userJwt: str | None = None


class LiveBrowserCreateSessionEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserCreateSessionRequest
    browserPolicyContext: dict[str, Any] = Field(default_factory=dict)
    reservationId: str | None = None


class LiveBrowserMutationEnvelope(LiveBrowserGatewayEnvelope):
    request: Any


class LiveBrowserGetSessionEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserGetSessionRequest


class LiveBrowserListEventsEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserListEventsRequest


class LiveBrowserSendCommandEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserSendCommandRequest


class LiveBrowserPauseAgentEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserPauseAgentRequest


class LiveBrowserTakeControlEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserTakeControlRequest


class LiveBrowserReturnControlEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserReturnControlRequest


class LiveBrowserResolveApprovalEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserResolveApprovalRequest


class LiveBrowserSubmitAssistEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserSubmitAssistResponseRequest


class LiveBrowserCancelSessionEnvelope(LiveBrowserGatewayEnvelope):
    request: LiveBrowserCancelSessionRequest


def get_live_browser_manager_dependency() -> LiveBrowserSessionManager:
    return get_live_browser_session_manager()


def get_live_browser_adapter_dependency() -> ManagedLiveBrowserAdapter:
    return get_live_browser_adapter()


async def _verify_proxy_token(x_proxy_token: str | None = Header(None)) -> None:
    proxy_token = getattr(settings, "SMARTSPEC_PROXY_TOKEN", "")
    if proxy_token:
        if not x_proxy_token or not secrets.compare_digest(x_proxy_token, proxy_token):
            raise HTTPException(status_code=401, detail="Invalid proxy token")
        return
    if x_proxy_token:
        raise HTTPException(status_code=401, detail="Unexpected proxy token")


def _assert_actor_matches_user(actor_type: str, actor_id: str, user_id: int) -> None:
    if actor_type == "user" and actor_id != str(user_id):
        raise HTTPException(status_code=403, detail="Live Browser actor does not match authenticated user")


def _map_error_code(code: str) -> str:
    if code == "single_writer_conflict":
        return "session_version_conflict"
    return code


def _error_status(code: str) -> int:
    mapped = _map_error_code(code)
    if mapped == "session_not_found":
        return 404
    if mapped == "session_version_conflict":
        return 409
    if mapped in {"command_queue_full", "rate_limited"}:
        return 429
    if mapped == "stream_unavailable":
        return 503
    if mapped in {"session_terminated", "invalid_state_transition"}:
        return 409
    return 400


def _error_response(
    *,
    code: str,
    message: str,
    current_session_version: int | None = None,
    retryable: bool = False,
    reason_codes: list[str] | None = None,
) -> JSONResponse:
    payload = LiveBrowserErrorResponse.model_validate(
        {
            "accepted": False,
            "error": {
                "code": _map_error_code(code),
                "message": message,
                "currentSessionVersion": current_session_version,
                "retryable": retryable,
                "reasonCodes": list(reason_codes or []),
            },
        }
    )
    return JSONResponse(status_code=_error_status(code), content=payload.model_dump(mode="json"))


def _run_or_error(callback):
    try:
        return callback()
    except LiveBrowserSessionMutationError as error:
        return _error_response(
            code=error.code,
            message=error.message,
            current_session_version=error.current_session_version,
            retryable=error.retryable,
            reason_codes=error.reason_codes,
        )
    except LiveBrowserProviderError as error:
        return _error_response(
            code=error.code,
            message=error.message,
            retryable=error.retryable,
            reason_codes=error.reason_codes,
        )


@router.post(
    "/sessions",
    response_model=LiveBrowserCreateSessionResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def create_session(
    envelope: LiveBrowserCreateSessionEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
    adapter: ManagedLiveBrowserAdapter = Depends(get_live_browser_adapter_dependency),
):
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    result = _run_or_error(
        lambda: create_live_browser_session(
            manager=manager,
            adapter=adapter,
            tenant_id=envelope.tenantId,
            user_id=envelope.userId,
            source_type=envelope.request.sourceType,
            source_id=envelope.request.sourceId,
            actor_id=envelope.request.actor.actorId,
            initial_url=envelope.request.initialUrl,
            mode=envelope.request.mode,
            browser_policy_context=envelope.browserPolicyContext,
        )
    )
    return result


@router.post(
    "/sessions/{session_id}/get",
    response_model=LiveBrowserSession,
    dependencies=[Depends(_verify_proxy_token)],
)
async def get_session(
    session_id: str,
    envelope: LiveBrowserGetSessionEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
    adapter: ManagedLiveBrowserAdapter = Depends(get_live_browser_adapter_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    result = _run_or_error(
        lambda: serialize_live_browser_session(
            hydrate_live_browser_session(
                manager=manager,
                adapter=adapter,
                session_id=session_id,
            )
        )
    )
    return result


@router.post(
    "/sessions/{session_id}/commands",
    response_model=LiveBrowserSendCommandResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def send_command(
    session_id: str,
    envelope: LiveBrowserSendCommandEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    return _run_or_error(
        lambda: manager.send_command(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_type=envelope.request.actor.actorType,
            actor_id=envelope.request.actor.actorId,
            command_text=envelope.request.command.text,
        )
    )


@router.post(
    "/sessions/{session_id}/pause",
    response_model=LiveBrowserPauseAgentResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def pause_agent(
    session_id: str,
    envelope: LiveBrowserPauseAgentEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    return _run_or_error(
        lambda: LiveBrowserPauseAgentResponse.model_validate(manager.pause_agent(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_type=envelope.request.actor.actorType,
            actor_id=envelope.request.actor.actorId,
            reason=envelope.request.reason,
        ))
    )


@router.post(
    "/sessions/{session_id}/take-control",
    response_model=LiveBrowserTakeControlResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def take_control(
    session_id: str,
    envelope: LiveBrowserTakeControlEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
    adapter: ManagedLiveBrowserAdapter = Depends(get_live_browser_adapter_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )

    def _take():
        result = manager.take_control(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_id=envelope.request.actor.actorId,
            reason=envelope.request.reason,
        )
        stream = issue_resume_stream(
            manager=manager,
            adapter=adapter,
            session_id=session_id,
            actor_id=envelope.request.actor.actorId,
            scope="controller",
        )
        return LiveBrowserTakeControlResponse.model_validate(
            {
                "accepted": result["accepted"],
                "status": result["status"],
                "controlMode": result["controlMode"],
                "sessionVersion": result["sessionVersion"],
                "stream": stream.model_dump(mode="json"),
            }
        )

    return _run_or_error(_take)


@router.post(
    "/sessions/{session_id}/return-control",
    response_model=LiveBrowserReturnControlResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def return_control(
    session_id: str,
    envelope: LiveBrowserReturnControlEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    return _run_or_error(
        lambda: LiveBrowserReturnControlResponse.model_validate(manager.return_control(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_id=envelope.request.actor.actorId,
            checkpoint=envelope.request.checkpoint,
            notes=envelope.request.notes,
        ))
    )


@router.post(
    "/sessions/{session_id}/approval",
    response_model=LiveBrowserResolveApprovalResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def resolve_approval(
    session_id: str,
    envelope: LiveBrowserResolveApprovalEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    return _run_or_error(
        lambda: manager.resolve_approval(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_id=envelope.request.actor.actorId,
            approval_request_id=envelope.request.approvalRequestId,
            decision=envelope.request.decision,
            notes=envelope.request.notes,
        )
    )


@router.post(
    "/sessions/{session_id}/assist-response",
    response_model=LiveBrowserSubmitAssistResponseResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def submit_assist_response(
    session_id: str,
    envelope: LiveBrowserSubmitAssistEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    return _run_or_error(
        lambda: manager.submit_assist_response(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_id=envelope.request.actor.actorId,
            assist_request_id=envelope.request.assistRequestId,
            response_payload=envelope.request.response.model_dump(mode="json"),
        )
    )


@router.post(
    "/sessions/{session_id}/cancel",
    response_model=LiveBrowserCancelSessionResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def cancel_session(
    session_id: str,
    envelope: LiveBrowserCancelSessionEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )
    return _run_or_error(
        lambda: manager.cancel_session(
            session_id=session_id,
            expected_session_version=envelope.request.sessionVersion,
            idempotency_key=envelope.request.idempotencyKey,
            actor_type=envelope.request.actor.actorType,
            actor_id=envelope.request.actor.actorId,
            reason=envelope.request.reason,
        )
    )


@router.post(
    "/sessions/{session_id}/events",
    response_model=LiveBrowserListEventsResponse,
    dependencies=[Depends(_verify_proxy_token)],
)
async def list_events(
    session_id: str,
    envelope: LiveBrowserListEventsEnvelope,
    manager: LiveBrowserSessionManager = Depends(get_live_browser_manager_dependency),
):
    if session_id != envelope.request.sessionId:
        raise HTTPException(status_code=400, detail="Session ID mismatch")
    _assert_actor_matches_user(
        envelope.request.actor.actorType,
        envelope.request.actor.actorId,
        envelope.userId,
    )

    def _list():
        events, next_cursor, has_more = manager.list_events(
            session_id=session_id,
            cursor=envelope.request.cursor,
            limit=envelope.request.limit,
        )
        return LiveBrowserListEventsResponse(
            sessionId=session_id,
            events=[serialize_live_browser_event(event) for event in events],
            nextCursor=next_cursor,
            hasMore=has_more,
        )

    return _run_or_error(_list)
