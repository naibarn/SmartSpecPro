"""Tests for BrowserSession real execution wiring and enforcement caps.

Uses pytest with asyncio_mode=auto. Mocks SandboxDispatcher to verify
correct dispatch calls without requiring actual sandbox infrastructure.
"""

import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.tools.browser_tool import (
    BrowserSession,
    BrowserSessionFactory,
    BrowserSSRFGuard,
    ssrf_route_filter,
)

# Patch DNS validation globally for tests that navigate
_PATCH_DNS = patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="mocked")


# ── Helpers ──────────────────────────────────────────────────────────────────


def _make_session(
    dispatcher=None,
    allowed_domains=None,
    user_id=1,
    tenant_id="t1",
    redis_client=None,
):
    """Create a BrowserSession with optional mock dispatcher."""
    return BrowserSession(
        user_id=user_id,
        tenant_id=tenant_id,
        allowed_domains=allowed_domains or ["example.com"],
        redis_client=redis_client,
        dispatcher=dispatcher,
    )


def _mock_dispatcher(result=None):
    """Create a mock SandboxDispatcher that returns a job_id and result."""
    dispatcher = AsyncMock()
    dispatcher.dispatch = AsyncMock(return_value="job-123")
    return dispatcher


# ── Individual action methods ────────────────────────────────────────────────


class TestNavigateDispatch:
    @pytest.mark.asyncio
    @patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="https://example.com")
    async def test_navigate_calls_dispatcher(self, mock_dns):
        """_do_navigate calls SandboxDispatcher with correct execution_mode."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "Test", "status": 200})

        result = await session.navigate("https://example.com")

        dispatcher.dispatch.assert_called_once()
        call_kwargs = dispatcher.dispatch.call_args
        assert call_kwargs.kwargs["feature_type"] == "connector"
        assert call_kwargs.kwargs["execution_mode"] == "browser"
        assert call_kwargs.kwargs["inputs"]["action"] == "navigate"
        assert result["title"] == "Test"
        mock_dns.assert_called_once()

    @pytest.mark.asyncio
    @patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="https://example.com")
    async def test_navigate_increments_pages_loaded(self, mock_dns):
        """navigate() increments _pages_loaded counter."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})

        assert session._pages_loaded == 0
        await session.navigate("https://example.com")
        assert session._pages_loaded == 1

    @pytest.mark.asyncio
    async def test_navigate_validates_ssrf_before_dispatch(self):
        """navigate() validates URL before dispatching to sandbox."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])

        with pytest.raises(ValueError, match="[Bb]locked|[Pp]rivate"):
            await session.navigate("http://10.0.0.1/admin")

        dispatcher.dispatch.assert_not_called()


class TestClickDispatch:
    @pytest.mark.asyncio
    async def test_click_dispatches_action(self):
        """click dispatches click action and returns result."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"selector": "#btn", "clicked": True})

        result = await session.click("#btn")

        dispatcher.dispatch.assert_called_once()
        assert dispatcher.dispatch.call_args.kwargs["inputs"]["action"] == "click"
        assert result["clicked"] is True


class TestFillDispatch:
    @pytest.mark.asyncio
    async def test_fill_dispatches_action(self):
        """fill dispatches fill action and returns result."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"selector": "#input", "filled": True})

        result = await session.fill("#input", "hello")

        dispatcher.dispatch.assert_called_once()
        assert dispatcher.dispatch.call_args.kwargs["inputs"]["action"] == "fill"
        assert result["filled"] is True


class TestScreenshotDispatch:
    @pytest.mark.asyncio
    async def test_screenshot_returns_base64_and_increments_counter(self):
        """screenshot returns base64 PNG and increments screenshot counter."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"screenshot_index": 1, "data": "iVBORw0KGgo..."})

        result = await session.screenshot()

        assert result["data"] == "iVBORw0KGgo..."
        assert session._screenshot_count == 1


class TestExtractTextDispatch:
    @pytest.mark.asyncio
    async def test_extract_text_returns_truncated_text(self):
        """extract_text returns text truncated at MAX_TEXT_LENGTH."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        long_text = "x" * 60_000
        session._wait_job = AsyncMock(return_value={"text": long_text, "selector": None})

        result = await session.extract_text()

        # Text should be truncated
        assert len(result["text"]) <= BrowserSession.MAX_TEXT_LENGTH + 100


# ── Caps enforcement ─────────────────────────────────────────────────────────


class TestMaxActionsCap:
    @pytest.mark.asyncio
    async def test_max_actions_50_rejects_upfront(self):
        """MAX_ACTIONS=50 -> reject upfront when actions[] > 50 (422)."""
        session = _make_session()
        actions = [{"action": "click", "selector": f"#btn{i}"} for i in range(51)]

        with pytest.raises(ValueError, match="[Tt]oo many actions|exceeds maximum"):
            await session.execute_actions(actions)

    @pytest.mark.asyncio
    async def test_max_actions_exactly_50_allowed(self):
        """Exactly 50 actions should be allowed."""
        session = _make_session()
        session._wait_job = AsyncMock(return_value={"clicked": True})
        actions = [{"action": "click", "selector": f"#btn{i}"} for i in range(50)]

        # Should not raise - just execute (stubs since no dispatcher)
        result = await session.execute_actions(actions)
        assert "results" in result


class TestMaxPagesCap:
    @pytest.mark.asyncio
    @patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="mocked")
    async def test_max_pages_5_aborts_at_runtime(self, mock_dns):
        """MAX_PAGES=5 -> abort remaining actions at runtime when cap reached."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])
        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})

        actions = [{"action": "navigate", "url": f"https://example.com/page{i}"} for i in range(7)]
        result = await session.execute_actions(actions)

        # Should have loaded max 5 pages, then stopped
        assert result["pages_loaded"] <= BrowserSession.MAX_PAGES
        # The 6th navigate should have caused a break
        successful = [r for r in result["results"] if r["success"]]
        assert len(successful) == BrowserSession.MAX_PAGES

    @pytest.mark.asyncio
    @patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="mocked")
    async def test_max_pages_returns_pages_cap_reached(self, mock_dns):
        """MAX_PAGES abort returns partial results with pages_cap_reached=true."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])
        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})

        actions = [{"action": "navigate", "url": f"https://example.com/page{i}"} for i in range(7)]
        result = await session.execute_actions(actions)

        assert result["pages_cap_reached"] is True


class TestMaxScreenshotsCap:
    @pytest.mark.asyncio
    async def test_max_screenshots_rejects_at_cap(self):
        """MAX_SCREENSHOTS=5 -> reject screenshot action when cap reached."""
        dispatcher = _mock_dispatcher()
        session = _make_session(dispatcher=dispatcher)
        session._wait_job = AsyncMock(return_value={"screenshot_index": 1, "data": ""})

        actions = [{"action": "screenshot"} for _ in range(6)]
        result = await session.execute_actions(actions)

        # 5 should succeed, 6th should fail
        successful = [r for r in result["results"] if r["success"]]
        failed = [r for r in result["results"] if not r["success"]]
        assert len(successful) == 5
        assert len(failed) == 1


# ── SSRF defense (route filter) ──────────────────────────────────────────────


class TestSSRFRouteFilter:
    def test_blocks_private_10_range(self):
        """page.route handler blocks requests to 10.0.0.0/8."""
        assert ssrf_route_filter("http://10.0.0.1/path", ["example.com"]) is False

    def test_blocks_metadata_endpoint(self):
        """page.route handler blocks requests to 169.254.169.254."""
        assert ssrf_route_filter("http://169.254.169.254/latest/meta-data/", ["example.com"]) is False

    def test_allows_allowlisted_domains(self):
        """page.route handler allows requests to allowlisted domains."""
        assert ssrf_route_filter("https://example.com/page", ["example.com"]) is True

    def test_blocks_non_allowlisted_domains(self):
        """Non-allowlisted domains are blocked."""
        assert ssrf_route_filter("https://evil.com/page", ["example.com"]) is False

    def test_allows_subdomain_match(self):
        """Subdomains of allowlisted domains are allowed."""
        assert ssrf_route_filter("https://sub.example.com/page", ["example.com"]) is True

    def test_blocks_metadata_google_internal(self):
        """Blocks metadata.google.internal."""
        assert ssrf_route_filter("http://metadata.google.internal/computeMetadata/", ["example.com"]) is False

    def test_blocks_172_range(self):
        """Blocks 172.16.0.0/12 range."""
        assert ssrf_route_filter("http://172.16.0.1/", ["example.com"]) is False

    def test_blocks_192_168_range(self):
        """Blocks 192.168.0.0/16 range."""
        assert ssrf_route_filter("http://192.168.1.1/", ["example.com"]) is False


# ── BrowserSessionFactory ────────────────────────────────────────────────────


class TestBrowserSessionFactory:
    def test_factory_creates_session_with_dispatcher(self):
        """factory injects SandboxDispatcher with db_session."""
        mock_db = MagicMock()
        factory = BrowserSessionFactory(db_session=mock_db)

        session = factory.create(
            user_id=1,
            tenant_id="t1",
            allowed_domains=["example.com"],
        )

        assert isinstance(session, BrowserSession)
        assert session._dispatcher is not None

    def test_factory_session_has_correct_params(self):
        """Factory-created session has correct user_id, tenant_id, domains."""
        mock_db = MagicMock()
        factory = BrowserSessionFactory(db_session=mock_db)

        session = factory.create(
            user_id=42,
            tenant_id="tenant-abc",
            allowed_domains=["test.com"],
        )

        assert session._user_id == 42
        assert session._tenant_id == "tenant-abc"
        assert session._allowed_domains == ["test.com"]


# ── Stub fallback (no dispatcher) ────────────────────────────────────────────


class TestStubFallback:
    @pytest.mark.asyncio
    @patch.object(BrowserSSRFGuard, "validate_url_dns", return_value="mocked")
    async def test_no_dispatcher_returns_stub(self, mock_dns):
        """When no dispatcher provided, action methods return stubs."""
        session = _make_session(dispatcher=None, allowed_domains=["example.com"])

        result = await session.navigate("https://example.com")
        assert result["url"] == "https://example.com"
        assert result["status"] == 200

    @pytest.mark.asyncio
    async def test_no_dispatcher_click_returns_stub(self):
        """When no dispatcher, click returns stub."""
        session = _make_session(dispatcher=None)

        result = await session.click("#btn")
        assert result["clicked"] is True
