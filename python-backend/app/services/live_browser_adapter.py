"""Managed live-browser transport adapter primitives."""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta
from typing import Any, Literal, Protocol
from uuid import uuid4


TransportScope = Literal["viewer", "controller"]

REQUIRED_PROVIDER_CAPABILITIES = {
    "observer_token",
    "controller_token",
    "token_refresh",
    "disconnect_signals",
    "evidence_handle",
    "tab_listing",
    "tab_switch",
    "reconnect_attach",
}


@dataclass(slots=True)
class LiveBrowserProviderError(Exception):
    code: str
    message: str
    reason_codes: list[str] = field(default_factory=list)
    retryable: bool = False
    audit_payload: dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return self.message


@dataclass(slots=True)
class LiveBrowserStreamToken:
    session_id: str
    scope: TransportScope
    token: str
    refresh_token: str
    connection_id: str
    expires_at: datetime


@dataclass(slots=True)
class LiveBrowserTab:
    tab_id: str
    url: str
    title: str
    is_active: bool


@dataclass(slots=True)
class LiveBrowserEvidenceHandle:
    handle_id: str
    session_id: str
    tab_id: str
    metadata: dict[str, Any]
    created_at: datetime


@dataclass(slots=True)
class LiveBrowserTransportIncident:
    session_id: str
    connection_id: str
    scope: TransportScope
    reason: str
    created_at: datetime


@dataclass(slots=True)
class LiveBrowserReadiness:
    ready: bool
    failures: list[str]
    details: dict[str, Any]


@dataclass(slots=True)
class ManagedBrowserSession:
    session_id: str
    provider_session_id: str
    active_tab_id: str
    tabs: list[LiveBrowserTab]
    tab_cap: int
    active_controller_connection_id: str | None = None
    last_disconnect: LiveBrowserTransportIncident | None = None


class ManagedBrowserBackend(Protocol):
    def get_capabilities(self) -> set[str]: ...

    def report_health(self) -> dict[str, bool]: ...

    def create_session(self, *, session_id: str, initial_url: str, tab_cap: int) -> ManagedBrowserSession: ...

    def get_session(self, session_id: str) -> ManagedBrowserSession: ...

    def save_session(self, session: ManagedBrowserSession) -> ManagedBrowserSession: ...

    def issue_token(
        self,
        *,
        session_id: str,
        scope: TransportScope,
        actor_id: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken: ...

    def refresh_token(
        self,
        *,
        session_id: str,
        refresh_token: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken: ...

    def open_tab(self, *, session_id: str, url: str, title: str) -> ManagedBrowserSession: ...

    def set_active_tab(self, *, session_id: str, tab_id: str) -> ManagedBrowserSession: ...

    def capture_evidence(self, *, session_id: str, tab_id: str, now: datetime) -> LiveBrowserEvidenceHandle: ...


class InMemoryManagedBrowserBackend:
    def __init__(
        self,
        *,
        capabilities: set[str] | None = None,
        health_overrides: dict[str, bool] | None = None,
    ) -> None:
        self._capabilities = capabilities or set(REQUIRED_PROVIDER_CAPABILITIES)
        self._health = {
            "account_config": True,
            "allocation": True,
            "attach": True,
            "token_refresh": True,
        }
        if health_overrides:
            self._health.update(health_overrides)
        self._sessions: dict[str, ManagedBrowserSession] = {}
        self._refresh_index: dict[str, LiveBrowserStreamToken] = {}

    def get_capabilities(self) -> set[str]:
        return set(self._capabilities)

    def report_health(self) -> dict[str, bool]:
        return dict(self._health)

    def create_session(self, *, session_id: str, initial_url: str, tab_cap: int) -> ManagedBrowserSession:
        tab_id = "tab_1"
        session = ManagedBrowserSession(
            session_id=session_id,
            provider_session_id=f"provider_{session_id}",
            active_tab_id=tab_id,
            tab_cap=tab_cap,
            tabs=[
                LiveBrowserTab(
                    tab_id=tab_id,
                    url=initial_url,
                    title="Live Session",
                    is_active=True,
                )
            ],
        )
        self._sessions[session_id] = session
        return self.get_session(session_id)

    def get_session(self, session_id: str) -> ManagedBrowserSession:
        session = self._sessions.get(session_id)
        if session is None:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message=f"Provider session {session_id} was not found",
                reason_codes=["provider_session_not_found"],
            )
        return replace(session, tabs=[replace(tab) for tab in session.tabs])

    def save_session(self, session: ManagedBrowserSession) -> ManagedBrowserSession:
        self._sessions[session.session_id] = replace(
            session,
            tabs=[replace(tab) for tab in session.tabs],
        )
        return self.get_session(session.session_id)

    def issue_token(
        self,
        *,
        session_id: str,
        scope: TransportScope,
        actor_id: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken:
        connection_id = f"conn_{uuid4().hex[:12]}"
        token = LiveBrowserStreamToken(
            session_id=session_id,
            scope=scope,
            token=f"lst_{uuid4().hex}",
            refresh_token=f"lsr_{uuid4().hex}",
            connection_id=connection_id,
            expires_at=expires_at,
        )
        self._refresh_index[token.refresh_token] = token
        session = self.get_session(session_id)
        if scope == "controller":
            session.active_controller_connection_id = connection_id
            self.save_session(session)
        return token

    def refresh_token(
        self,
        *,
        session_id: str,
        refresh_token: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken:
        existing = self._refresh_index.get(refresh_token)
        if existing is None:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Refresh token is invalid",
                reason_codes=["provider_refresh_token_invalid"],
                retryable=False,
            )
        refreshed = LiveBrowserStreamToken(
            session_id=session_id,
            scope=existing.scope,
            token=f"lst_{uuid4().hex}",
            refresh_token=f"lsr_{uuid4().hex}",
            connection_id=existing.connection_id,
            expires_at=expires_at,
        )
        self._refresh_index.pop(refresh_token, None)
        self._refresh_index[refreshed.refresh_token] = refreshed
        return refreshed

    def open_tab(self, *, session_id: str, url: str, title: str) -> ManagedBrowserSession:
        session = self.get_session(session_id)
        if len(session.tabs) >= session.tab_cap:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Provider tab cap exceeded",
                reason_codes=["tab_cap_exceeded"],
                audit_payload={"tabCap": session.tab_cap, "sessionId": session_id},
            )
        new_tab = LiveBrowserTab(
            tab_id=f"tab_{len(session.tabs) + 1}",
            url=url,
            title=title,
            is_active=False,
        )
        session.tabs.append(new_tab)
        return self.save_session(session)

    def set_active_tab(self, *, session_id: str, tab_id: str) -> ManagedBrowserSession:
        session = self.get_session(session_id)
        found = False
        updated_tabs: list[LiveBrowserTab] = []
        for tab in session.tabs:
            is_active = tab.tab_id == tab_id
            found = found or is_active
            updated_tabs.append(replace(tab, is_active=is_active))
        if not found:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message=f"Active tab {tab_id} could not be restored",
                reason_codes=["active_tab_restore_failed"],
            )
        session.tabs = updated_tabs
        session.active_tab_id = tab_id
        return self.save_session(session)

    def capture_evidence(self, *, session_id: str, tab_id: str, now: datetime) -> LiveBrowserEvidenceHandle:
        return LiveBrowserEvidenceHandle(
            handle_id=f"lbeh_{uuid4().hex}",
            session_id=session_id,
            tab_id=tab_id,
            metadata={
                "provider": "managed_live_browser",
                "captureType": "screenshot",
                "capturedAt": now.isoformat(),
            },
            created_at=now,
        )


class ManagedLiveBrowserAdapter:
    def __init__(
        self,
        *,
        backend: ManagedBrowserBackend,
        token_ttl: timedelta = timedelta(minutes=5),
    ) -> None:
        self._backend = backend
        self._token_ttl = token_ttl

    def provision_session(
        self,
        *,
        session_id: str,
        initial_url: str,
        tab_cap: int,
    ) -> ManagedBrowserSession:
        self._assert_capabilities()
        return self._backend.create_session(
            session_id=session_id,
            initial_url=initial_url,
            tab_cap=tab_cap,
        )

    def get_session(self, session_id: str) -> ManagedBrowserSession:
        return self._backend.get_session(session_id)

    def issue_stream_token(
        self,
        *,
        session_id: str,
        scope: TransportScope,
        actor_id: str,
        now: datetime | None = None,
    ) -> LiveBrowserStreamToken:
        self._assert_capabilities()
        timestamp = now or datetime.now(UTC)
        return self._backend.issue_token(
            session_id=session_id,
            scope=scope,
            actor_id=actor_id,
            expires_at=timestamp + self._token_ttl,
        )

    def refresh_stream_token(
        self,
        *,
        session_id: str,
        refresh_token: str,
        now: datetime | None = None,
    ) -> LiveBrowserStreamToken:
        self._assert_capabilities(required={"token_refresh"})
        health = self._backend.report_health()
        if not health.get("token_refresh", True):
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Provider token refresh is unavailable",
                reason_codes=["provider_token_refresh_failed"],
                retryable=True,
            )
        timestamp = now or datetime.now(UTC)
        return self._backend.refresh_token(
            session_id=session_id,
            refresh_token=refresh_token,
            expires_at=timestamp + self._token_ttl,
        )

    def record_disconnect(
        self,
        *,
        session_id: str,
        connection_id: str,
        scope: TransportScope,
        reason: str,
        now: datetime | None = None,
    ) -> LiveBrowserTransportIncident:
        self._assert_capabilities(required={"disconnect_signals"})
        incident = LiveBrowserTransportIncident(
            session_id=session_id,
            connection_id=connection_id,
            scope=scope,
            reason=reason,
            created_at=now or datetime.now(UTC),
        )
        session = self._backend.get_session(session_id)
        session.last_disconnect = incident
        self._backend.save_session(session)
        return incident

    def capture_evidence(
        self,
        *,
        session_id: str,
        tab_id: str,
        now: datetime | None = None,
    ) -> LiveBrowserEvidenceHandle:
        self._assert_capabilities(required={"evidence_handle"})
        return self._backend.capture_evidence(
            session_id=session_id,
            tab_id=tab_id,
            now=now or datetime.now(UTC),
        )

    def open_tab(self, *, session_id: str, url: str, title: str) -> LiveBrowserTab:
        self._assert_capabilities(required={"tab_listing", "tab_switch"})
        session = self._backend.open_tab(session_id=session_id, url=url, title=title)
        return next(tab for tab in session.tabs if tab.url == url and tab.title == title)

    def restore_active_tab(self, *, session_id: str, tab_id: str) -> LiveBrowserTab:
        self._assert_capabilities(required={"reconnect_attach", "tab_switch"})
        session = self._backend.set_active_tab(session_id=session_id, tab_id=tab_id)
        return next(tab for tab in session.tabs if tab.tab_id == tab_id)

    def check_readiness(self) -> LiveBrowserReadiness:
        health = self._backend.report_health()
        failures: list[str] = []
        missing = sorted(REQUIRED_PROVIDER_CAPABILITIES - self._backend.get_capabilities())
        failures.extend(f"provider_missing_{capability}" for capability in missing)
        if not health.get("allocation", True):
            failures.append("provider_allocation_failed")
        if not health.get("attach", True):
            failures.append("provider_attach_failed")
        if not health.get("token_refresh", True):
            failures.append("provider_token_refresh_failed")
        return LiveBrowserReadiness(
            ready=not failures,
            failures=failures,
            details=health,
        )

    def _assert_capabilities(self, required: set[str] | None = None) -> None:
        required_capabilities = required or REQUIRED_PROVIDER_CAPABILITIES
        available = self._backend.get_capabilities()
        missing = sorted(required_capabilities - available)
        if not missing:
            return
        raise LiveBrowserProviderError(
            code="stream_unavailable",
            message="Managed browser provider is missing required live capabilities",
            reason_codes=[f"provider_missing_{capability}" for capability in missing],
            retryable=False,
        )
