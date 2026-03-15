"""Runtime wiring for the live-browser API, adapter, and durable session manager."""

from __future__ import annotations

import os
import socket
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from threading import Lock
from typing import Any
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.services.live_browser_adapter import (
    InMemoryManagedBrowserBackend,
    LiveBrowserProviderError,
    ManagedBrowserSession,
    ManagedLiveBrowserAdapter,
)
from app.services.live_browser_contract import (
    LiveBrowserCreateSessionResponse,
    LiveBrowserEventEnvelope,
    LiveBrowserSession,
    LiveBrowserStream,
)
from app.services.live_browser_session_manager import (
    DatabaseLiveBrowserStore,
    DatabaseSingleWriterCoordinator,
    LiveBrowserEventRecord,
    LiveBrowserSessionManager,
    LiveBrowserSessionRecord,
    get_live_browser_barrier_type,
    infer_live_browser_page_sensitivity,
)

_lock = Lock()
_sync_engine = None
_sync_session_factory: sessionmaker[Session] | None = None
_adapter: ManagedLiveBrowserAdapter | None = None
_manager: LiveBrowserSessionManager | None = None


def _get_sync_db_url() -> str:
    url = settings.DATABASE_URL
    if "+asyncpg" in url:
        return url.replace("+asyncpg", "")
    if "+aiosqlite" in url:
        return url.replace("+aiosqlite", "")
    if url.startswith("postgresql+asyncpg"):
        return url.replace("postgresql+asyncpg", "postgresql")
    if url.startswith("sqlite+aiosqlite"):
        return url.replace("sqlite+aiosqlite", "sqlite")
    return url


def get_live_browser_session_factory() -> sessionmaker[Session]:
    global _sync_engine, _sync_session_factory
    if _sync_session_factory is None:
        sync_url = _get_sync_db_url()
        engine_kwargs: dict[str, Any] = {"pool_pre_ping": True}
        if sync_url.startswith("sqlite"):
            engine_kwargs["connect_args"] = {"check_same_thread": False}
        else:
            engine_kwargs["pool_size"] = 2
        _sync_engine = create_engine(sync_url, **engine_kwargs)
        _sync_session_factory = sessionmaker(bind=_sync_engine, expire_on_commit=False)
    return _sync_session_factory


def get_live_browser_adapter() -> ManagedLiveBrowserAdapter:
    global _adapter
    if _adapter is None:
        _adapter = ManagedLiveBrowserAdapter(
            backend=InMemoryManagedBrowserBackend(),
            token_ttl=timedelta(minutes=5),
        )
    return _adapter


def get_live_browser_session_manager() -> LiveBrowserSessionManager:
    global _manager
    if _manager is None:
        session_factory = get_live_browser_session_factory()
        writer_id = os.getenv(
            "LIVE_BROWSER_WRITER_ID",
            f"live-runtime-{socket.gethostname()}-{os.getpid()}",
        )
        _manager = LiveBrowserSessionManager(
            store=DatabaseLiveBrowserStore(session_factory=session_factory),
            coordinator=DatabaseSingleWriterCoordinator(session_factory=session_factory),
            writer_id=writer_id,
            lease_ttl=timedelta(minutes=1),
        )
    return _manager


def _build_browser_context(provider_session: ManagedBrowserSession) -> dict[str, Any]:
    active_tab = next(
        (tab for tab in provider_session.tabs if tab.is_active),
        provider_session.tabs[0],
    )
    tabs: list[dict[str, Any]] = []
    active_page_sensitivity = "none"
    active_reason_codes: list[str] = []
    for tab in provider_session.tabs:
        page_sensitivity, reason_codes = infer_live_browser_page_sensitivity(
            url=tab.url,
            page_title=tab.title,
        )
        tab_payload = {
            "tabId": tab.tab_id,
            "url": tab.url,
            "title": tab.title,
            "isActive": tab.is_active,
            "pageSensitivity": page_sensitivity,
            "pageSensitivityReasonCodes": reason_codes,
        }
        tabs.append(tab_payload)
        if tab.tab_id == active_tab.tab_id:
            active_page_sensitivity = page_sensitivity
            active_reason_codes = reason_codes

    return {
        "activeTabId": provider_session.active_tab_id,
        "url": active_tab.url,
        "pageTitle": active_tab.title,
        "pageSensitivity": active_page_sensitivity,
        "pageSensitivityReasonCodes": active_reason_codes,
        "tabs": tabs,
        "commandQueue": [],
    }


def _merge_browser_context(
    existing: dict[str, Any],
    provider_session: ManagedBrowserSession,
) -> dict[str, Any]:
    merged = dict(existing)
    merged.update(_build_browser_context(provider_session))
    if "commandQueue" in existing:
        merged["commandQueue"] = list(existing["commandQueue"])
    if "activeCommandId" in existing:
        merged["activeCommandId"] = existing["activeCommandId"]
    if "activeCommand" in existing:
        merged["activeCommand"] = dict(existing["activeCommand"])
    return merged


def _to_stream_contract(stream_ref: dict[str, Any]) -> LiveBrowserStream | None:
    if not stream_ref:
        return None
    return LiveBrowserStream.model_validate(stream_ref)


def _persist_session_projection(
    manager: LiveBrowserSessionManager,
    session: LiveBrowserSessionRecord,
    *,
    provider_session: ManagedBrowserSession,
    stream_ref: dict[str, Any] | None = None,
) -> LiveBrowserSessionRecord:
    updated = replace(
        session,
        browser_context_ref=_merge_browser_context(
            session.browser_context_ref,
            provider_session,
        ),
        active_tab_count=len(provider_session.tabs),
        stream_ref=dict(stream_ref or session.stream_ref),
    )
    manager._store.save_session(updated)
    return manager.get_session(updated.session_id)


def _ensure_provider_session(
    manager: LiveBrowserSessionManager,
    adapter: ManagedLiveBrowserAdapter,
    session: LiveBrowserSessionRecord,
) -> ManagedBrowserSession:
    try:
        return adapter.get_session(session.session_id)
    except LiveBrowserProviderError as exc:
        if "provider_session_not_found" not in exc.reason_codes:
            raise
        return adapter.provision_session(
            session_id=session.session_id,
            initial_url=str(session.browser_context_ref.get("url") or "about:blank"),
            tab_cap=max(session.active_tab_count, 1),
        )


def serialize_live_browser_session(session: LiveBrowserSessionRecord) -> LiveBrowserSession:
    return LiveBrowserSession(
        sessionId=session.session_id,
        tenantId=session.tenant_id,
        userId=session.user_id,
        sourceType=session.source_type,
        sourceId=session.source_id,
        status=session.status,
        controlMode=session.control_mode,
        sessionVersion=session.session_version,
        controllerActorType=session.controller_actor_type,
        controllerActorId=session.controller_actor_id,
        controllerConnectionId=session.controller_connection_id,
        controllerLeaseExpiresAt=(
            session.controller_lease_expires_at.isoformat()
            if session.controller_lease_expires_at
            else None
        ),
        pauseReason=session.pause_reason,
        barrierType=get_live_browser_barrier_type(session),
        pendingAssistRequestId=session.pending_assist_request_id,
        pendingApprovalRequestId=session.pending_approval_request_id,
        policyContext=dict(session.policy_context),
        browserContextRef=dict(session.browser_context_ref),
        stream=_to_stream_contract(session.stream_ref),
        activeTabCount=session.active_tab_count,
        startedAt=session.started_at.isoformat(),
        lastActivityAt=session.last_activity_at.isoformat(),
        endedAt=session.ended_at.isoformat() if session.ended_at else None,
        endReason=session.end_reason,
    )


def serialize_live_browser_event(event: LiveBrowserEventRecord) -> LiveBrowserEventEnvelope:
    return LiveBrowserEventEnvelope(
        eventId=event.event_id,
        sessionId=event.session_id,
        sessionVersion=event.session_version_at,
        type=event.event_type,
        timestamp=event.created_at.isoformat(),
        payload=event.payload,
        cursor=event.cursor,
    )


def create_live_browser_session(
    *,
    manager: LiveBrowserSessionManager,
    adapter: ManagedLiveBrowserAdapter,
    tenant_id: str,
    user_id: int,
    source_type: str,
    source_id: str | None,
    actor_id: str,
    initial_url: str | None,
    mode: str,
    browser_policy_context: dict[str, Any],
    execution_intent: dict[str, Any] | None = None,
) -> LiveBrowserCreateSessionResponse:
    with _lock:
        session_id = f"lbs_{uuid4().hex[:12]}"
        provider_session = adapter.provision_session(
            session_id=session_id,
            initial_url=initial_url or "https://example.com",
            tab_cap=5,
        )
        viewer_stream = adapter.issue_stream_token(
            session_id=session_id,
            scope="viewer",
            actor_id=actor_id,
        )
        stream_ref = {
            "viewerToken": viewer_stream.token,
            "expiresAt": viewer_stream.expires_at.isoformat(),
        }
        policy_context = dict(browser_policy_context)
        if execution_intent:
            policy_context["executionIntent"] = dict(execution_intent)

        created = manager.create_session(
            session_id=session_id,
            tenant_id=tenant_id,
            user_id=user_id,
            source_type=source_type,
            source_id=source_id,
            status="ready",
            control_mode=mode,
            policy_context=policy_context,
            browser_context_ref=_build_browser_context(provider_session),
            stream_ref=stream_ref,
        )

        if execution_intent and execution_intent.get("prompt"):
            manager.append_runtime_event(
                session_id=session_id,
                event_type="agent_started",
                actor_type="agent",
                actor_id="automation_copilot",
                payload={"executionIntent": dict(execution_intent)},
            )
            manager.send_command(
                session_id=session_id,
                expected_session_version=created.session_version,
                idempotency_key=f"launch-{session_id}",
                actor_type="agent",
                actor_id="automation_copilot",
                command_text=str(execution_intent["prompt"]),
            )

        hydrated = manager.get_session(session_id)
        return LiveBrowserCreateSessionResponse(
            sessionId=hydrated.session_id,
            status=hydrated.status,
            controlMode=hydrated.control_mode,
            sessionVersion=hydrated.session_version,
            stream=LiveBrowserStream.model_validate(stream_ref),
        )


def hydrate_live_browser_session(
    *,
    manager: LiveBrowserSessionManager,
    adapter: ManagedLiveBrowserAdapter,
    session_id: str,
) -> LiveBrowserSessionRecord:
    session = manager.get_session(session_id)
    provider_session = _ensure_provider_session(manager, adapter, session)
    return _persist_session_projection(
        manager,
        session,
        provider_session=provider_session,
    )


def issue_resume_stream(
    *,
    manager: LiveBrowserSessionManager,
    adapter: ManagedLiveBrowserAdapter,
    session_id: str,
    actor_id: str,
    scope: str,
) -> LiveBrowserStream:
    session = manager.get_session(session_id)
    _ensure_provider_session(manager, adapter, session)
    stream = adapter.issue_stream_token(
        session_id=session_id,
        scope=scope,
        actor_id=actor_id,
    )
    current_stream = dict(session.stream_ref)
    current_stream["expiresAt"] = stream.expires_at.isoformat()
    if scope == "viewer":
        current_stream["viewerToken"] = stream.token
    else:
        current_stream["controllerToken"] = stream.token
        current_stream["leaseExpiresAt"] = (
            session.controller_lease_expires_at.isoformat()
            if session.controller_lease_expires_at
            else None
        )
    provider_session = adapter.get_session(session_id)
    _persist_session_projection(
        manager,
        session,
        provider_session=provider_session,
        stream_ref=current_stream,
    )
    return LiveBrowserStream.model_validate(current_stream)


def reset_live_browser_runtime_for_test() -> None:
    global _adapter, _manager, _sync_engine, _sync_session_factory
    _adapter = None
    _manager = None
    _sync_session_factory = None
    if _sync_engine is not None:
        _sync_engine.dispose()
    _sync_engine = None
