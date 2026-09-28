"""Managed-browser backend backed by the server-owned BrowserPool.

The adapter owns session, policy, token, and evidence semantics.  This class
only translates those operations to a real Playwright BrowserContext obtained
from BrowserPool; it is not a second Computer Use engine.
"""

from __future__ import annotations

from dataclasses import replace
from datetime import UTC, datetime, timedelta
from hashlib import sha256
from typing import Any
from uuid import uuid4

from app.services.browser_pool import BrowserPool, get_worker_loop
from app.services.live_browser_adapter import (
    LiveBrowserEvidenceHandle,
    LiveBrowserProviderError,
    LiveBrowserStreamToken,
    LiveBrowserTab,
    ManagedBrowserSession,
    REQUIRED_PROVIDER_CAPABILITIES,
    TransportScope,
)


class BrowserPoolManagedBackend:
    """Synchronous managed-browser contract over the worker-scoped async pool."""

    def __init__(self, *, pool: BrowserPool, tenant_id: str = "live-browser") -> None:
        self._pool = pool
        self._tenant_id = tenant_id
        self._capabilities = set(REQUIRED_PROVIDER_CAPABILITIES)
        self._health = {
            "account_config": True,
            "allocation": True,
            "attach": True,
            "token_refresh": True,
        }
        self._sessions: dict[str, ManagedBrowserSession] = {}
        self._refresh_index: dict[str, LiveBrowserStreamToken] = {}
        self._leases: dict[str, tuple[Any, Any, dict[str, Any]]] = {}

    def get_capabilities(self) -> set[str]:
        return set(self._capabilities)

    def report_health(self) -> dict[str, bool]:
        return dict(self._health)

    @staticmethod
    def _run(awaitable):
        return get_worker_loop().run_until_complete(awaitable)

    def readiness_evidence(self, *, now: datetime) -> dict[str, Any]:
        started_at = now.astimezone(UTC)
        try:
            probe = dict(self._run(self._pool.readiness_probe()))
        except Exception as exc:
            completed_at = datetime.now(UTC)
            return {
                "backend_kind": "browser_pool",
                "execution_target": "server_managed_browser",
                "provider_identity": None,
                "provider_version": None,
                "browser_engine": None,
                "browser_version": None,
                "probe_kind": "browser_pool_launch_and_context",
                "probe_started_at": started_at.isoformat(),
                "probe_completed_at": completed_at.isoformat(),
                "probe_age_ms": max(0, int((completed_at - started_at).total_seconds() * 1000)),
                "probe_result": "failed",
                "capability_snapshot_id": f"browser-pool-probe:{uuid4().hex}",
                "snapshot_revision": 0,
                "snapshot_expires_at": (completed_at + timedelta(seconds=120)).isoformat(),
                "runner_id": None,
                "runner_session_id": None,
                "evidence_ref": None,
                "probe_error": str(exc)[:256],
                "readiness_state": "NOT_READY",
            }

        completed_at = datetime.now(UTC)
        return {
            "backend_kind": "browser_pool",
            "execution_target": "server_managed_browser",
            "provider_identity": probe.get("provider_identity", "server-managed-browser-pool"),
            "provider_version": probe.get("provider_version"),
            "browser_engine": probe.get("browser_engine", "chromium"),
            "browser_version": probe.get("browser_version"),
            "probe_kind": "browser_pool_launch_and_context",
            "probe_started_at": started_at.isoformat(),
            "probe_completed_at": completed_at.isoformat(),
            "probe_age_ms": max(0, int((completed_at - started_at).total_seconds() * 1000)),
            "probe_result": "passed",
            "capability_snapshot_id": f"browser-pool-probe:{uuid4().hex}",
            "snapshot_revision": int(completed_at.timestamp() * 1000),
            "snapshot_expires_at": (completed_at + timedelta(seconds=120)).isoformat(),
            "runner_id": None,
            "runner_session_id": None,
            "evidence_ref": f"browser-pool-probe:{uuid4().hex}",
            "readiness_state": "READY",
        }

    def create_session(self, *, session_id: str, initial_url: str, tab_cap: int) -> ManagedBrowserSession:
        if session_id in self._leases:
            return self.get_session(session_id)

        async def acquire():
            lease = self._pool.session(self._tenant_id)
            context = await lease.__aenter__()
            try:
                page = await context.new_page()
                await page.goto(initial_url, wait_until="domcontentloaded", timeout=10_000)
            except Exception:
                await lease.__aexit__(None, None, None)
                raise
            return lease, context, page

        try:
            lease, context, page = self._run(acquire())
        except Exception as exc:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Server-managed browser session could not be created",
                reason_codes=["browser_pool_session_create_failed"],
                retryable=True,
                audit_payload={"error": str(exc)[:256]},
            ) from exc

        tab_id = "tab_1"
        self._leases[session_id] = (lease, context, {tab_id: page})
        self._sessions[session_id] = ManagedBrowserSession(
            session_id=session_id,
            provider_session_id=f"browser_pool_{session_id}",
            active_tab_id=tab_id,
            tab_cap=tab_cap,
            tabs=[LiveBrowserTab(tab_id=tab_id, url=initial_url, title=initial_url, is_active=True)],
        )
        return self.get_session(session_id)

    def issue_token(
        self,
        *,
        session_id: str,
        scope: TransportScope,
        actor_id: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken:
        del actor_id
        self.get_session(session_id)
        token = LiveBrowserStreamToken(
            session_id=session_id,
            scope=scope,
            token=f"lst_{uuid4().hex}",
            refresh_token=f"lsr_{uuid4().hex}",
            connection_id=f"conn_{uuid4().hex[:12]}",
            expires_at=expires_at,
        )
        self._refresh_index[token.refresh_token] = token
        if scope == "controller":
            session = self._sessions[session_id]
            self._sessions[session_id] = replace(
                session,
                active_controller_connection_id=token.connection_id,
            )
        return token

    def refresh_token(
        self,
        *,
        session_id: str,
        refresh_token: str,
        expires_at: datetime,
    ) -> LiveBrowserStreamToken:
        existing = self._refresh_index.get(refresh_token)
        if existing is None or existing.session_id != session_id:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Refresh token is invalid",
                reason_codes=["provider_refresh_token_invalid"],
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

    def get_session(self, session_id: str) -> ManagedBrowserSession:
        session = self._sessions.get(session_id)
        lease_state = self._leases.get(session_id)
        if session is None or lease_state is None:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message=f"BrowserPool session {session_id} was not found",
                reason_codes=["provider_session_not_found"],
            )

        _lease, _context, pages = lease_state

        async def snapshot_pages():
            result = []
            for tab_id, page in pages.items():
                result.append((tab_id, page.url, await page.title()))
            return result

        page_data = self._run(snapshot_pages())
        updated_tabs = [
            LiveBrowserTab(
                tab_id=tab_id,
                url=url,
                title=title,
                is_active=tab_id == session.active_tab_id,
            )
            for tab_id, url, title in page_data
        ]
        return replace(session, tabs=updated_tabs)

    def save_session(self, session: ManagedBrowserSession) -> ManagedBrowserSession:
        self._sessions[session.session_id] = replace(
            session,
            tabs=[replace(tab) for tab in session.tabs],
        )
        return self.get_session(session.session_id)

    def open_tab(self, *, session_id: str, url: str, title: str) -> ManagedBrowserSession:
        session = self.get_session(session_id)
        lease_state = self._leases[session_id]
        _lease, context, pages = lease_state
        if len(pages) >= session.tab_cap:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message="Provider tab cap exceeded",
                reason_codes=["tab_cap_exceeded"],
            )

        async def open_page():
            page = await context.new_page()
            await page.goto(url, wait_until="domcontentloaded", timeout=10_000)
            return page

        page = self._run(open_page())
        tab_id = f"tab_{len(pages) + 1}"
        pages[tab_id] = page
        session.tabs.append(LiveBrowserTab(tab_id=tab_id, url=url, title=title, is_active=False))
        return self.save_session(session)

    def set_active_tab(self, *, session_id: str, tab_id: str) -> ManagedBrowserSession:
        session = self.get_session(session_id)
        page = self._leases[session_id][2].get(tab_id)
        if page is None:
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message=f"Active tab {tab_id} could not be restored",
                reason_codes=["active_tab_restore_failed"],
            )
        self._run(page.bring_to_front())
        return self.save_session(replace(session, active_tab_id=tab_id))

    def capture_evidence(self, *, session_id: str, tab_id: str, now: datetime) -> LiveBrowserEvidenceHandle:
        session = self.get_session(session_id)
        page = self._leases[session_id][2].get(tab_id)
        if page is None or not any(tab.tab_id == tab_id for tab in session.tabs):
            raise LiveBrowserProviderError(
                code="stream_unavailable",
                message=f"Evidence tab {tab_id} was not found",
                reason_codes=["evidence_tab_not_found"],
            )
        screenshot = self._run(page.screenshot())
        digest = sha256(screenshot).hexdigest()
        handle_id = f"lbeh_{uuid4().hex}"
        return LiveBrowserEvidenceHandle(
            handle_id=handle_id,
            session_id=session_id,
            tab_id=tab_id,
            metadata={
                "provider": "managed_live_browser",
                "backendKind": "browser_pool",
                "captureType": "screenshot",
                "capturedAt": now.isoformat(),
                "sha256": digest,
                "evidenceRef": f"browser-pool:{handle_id}",
            },
            created_at=now,
        )

    def close_all(self) -> None:
        async def close_leases():
            for lease, _context, _pages in list(self._leases.values()):
                await lease.__aexit__(None, None, None)

        if self._leases:
            self._run(close_leases())
        self._leases.clear()
        self._sessions.clear()
