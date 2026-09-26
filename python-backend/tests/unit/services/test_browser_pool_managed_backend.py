from contextlib import asynccontextmanager
from datetime import UTC, datetime

from app.services.browser_pool_managed_backend import BrowserPoolManagedBackend
from app.services.live_browser_adapter import ManagedLiveBrowserAdapter


class FakePage:
    def __init__(self, url: str = "about:blank", title: str = "Blank"):
        self.url = url
        self._title = title
        self.front = False

    async def goto(self, url: str, **_kwargs):
        self.url = url
        self._title = f"Page {url}"

    async def title(self):
        return self._title

    async def bring_to_front(self):
        self.front = True

    async def screenshot(self):
        return b"real-browser-evidence"

    async def close(self):
        return None


class FakeContext:
    def __init__(self):
        self.pages = []

    async def new_page(self):
        page = FakePage()
        self.pages.append(page)
        return page


class FakeBrowserPool:
    def __init__(self):
        self.context = FakeContext()

    async def readiness_probe(self):
        return {
            "provider_identity": "browser_pool:test",
            "provider_version": "chromium-120",
            "browser_engine": "chromium",
            "browser_version": "120.0.0",
        }

    @asynccontextmanager
    async def session(self, _tenant_id):
        yield self.context


def test_browser_pool_backend_proves_real_probe_and_adapter_readiness():
    adapter = ManagedLiveBrowserAdapter(backend=BrowserPoolManagedBackend(pool=FakeBrowserPool()))

    readiness = adapter.check_readiness(now=datetime(2026, 9, 20, tzinfo=UTC))

    assert readiness.ready is True
    assert readiness.state == "READY"
    assert readiness.evidence["backend_kind"] == "browser_pool"
    assert readiness.evidence["execution_target"] == "server_managed_browser"
    assert readiness.evidence["probe_result"] == "passed"
    assert readiness.evidence["browser_engine"] == "chromium"


def test_browser_pool_backend_keeps_session_semantics_and_captures_real_evidence():
    backend = BrowserPoolManagedBackend(pool=FakeBrowserPool())
    adapter = ManagedLiveBrowserAdapter(backend=backend)

    session = adapter.provision_session(
        session_id="lbs_real_123",
        initial_url="https://fixture.local/start",
        tab_cap=2,
    )
    evidence = adapter.capture_evidence(
        session_id=session.session_id,
        tab_id=session.active_tab_id,
        now=datetime(2026, 9, 20, tzinfo=UTC),
    )

    assert adapter.get_session(session.session_id).tabs[0].url == "https://fixture.local/start"
    assert evidence.session_id == session.session_id
    assert evidence.metadata["backendKind"] == "browser_pool"
    assert evidence.metadata["sha256"]
    assert evidence.metadata["evidenceRef"].startswith("browser-pool:")
