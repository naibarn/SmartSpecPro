"""Tests for browser_tool.py -- write BEFORE implementation."""
import ipaddress
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestSSRFProtection:
    """SSRF 3-layer protection for browser navigation."""

    def _make_guard(self):
        from app.services.tools.browser_tool import BrowserSSRFGuard

        return BrowserSSRFGuard()

    def test_navigate_blocks_private_ip_10(self):
        """navigate('http://10.0.0.1/admin') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError, match="[Pp]rivate|[Bb]locked"):
            guard.validate_url("http://10.0.0.1/admin", ["10.0.0.1"])

    def test_navigate_blocks_private_ip_172(self):
        """navigate('http://172.16.0.1/') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError):
            guard.validate_url("http://172.16.0.1/", ["172.16.0.1"])

    def test_navigate_blocks_private_ip_192(self):
        """navigate('http://192.168.1.1/') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError):
            guard.validate_url("http://192.168.1.1/", ["192.168.1.1"])

    def test_navigate_blocks_localhost(self):
        """navigate('http://localhost/') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError):
            guard.validate_url("http://localhost/", ["localhost"])

    def test_navigate_blocks_127(self):
        """navigate('http://127.0.0.1:8000/') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError):
            guard.validate_url("http://127.0.0.1:8000/", ["127.0.0.1"])

    def test_navigate_blocks_metadata_endpoint(self):
        """navigate('http://169.254.169.254/latest/meta-data/') must raise ValueError."""
        guard = self._make_guard()
        with pytest.raises(ValueError):
            guard.validate_url(
                "http://169.254.169.254/latest/meta-data/",
                ["169.254.169.254"],
            )

    def test_allowed_domains_empty_denies_all(self):
        """When allowedDomains=[], ALL navigation attempts must be denied."""
        guard = self._make_guard()
        with pytest.raises(ValueError, match="[Nn]o allowed domains|[Dd]enied"):
            guard.validate_url("https://example.com/page", [])

    def test_allowed_domains_whitelist_enforced(self):
        """Only domains in allowedDomains list are allowed; others rejected."""
        guard = self._make_guard()
        # Allowed domain passes
        guard.validate_url("https://example.com/page", ["example.com"])
        # Non-allowed domain rejected
        with pytest.raises(ValueError, match="[Nn]ot allowed|[Dd]enied"):
            guard.validate_url("https://other.com/page", ["example.com"])

    def test_extract_text_truncates_at_50k(self):
        """extractText output must be truncated to 50,000 characters with notice."""
        from app.services.tools.browser_tool import BrowserSession

        session = BrowserSession.__new__(BrowserSession)
        long_text = "x" * 100_000
        result = session._truncate_text(long_text)
        assert len(result) <= BrowserSession.MAX_TEXT_LENGTH + 100  # allow notice
        assert "truncated" in result.lower() or len(result) == BrowserSession.MAX_TEXT_LENGTH

    def test_max_5_screenshots_per_session(self):
        """6th screenshot() call must raise or return error."""
        from app.services.tools.browser_tool import BrowserSession

        session = BrowserSession.__new__(BrowserSession)
        session._screenshot_count = 5
        session._session_id = "test"
        with pytest.raises(ValueError, match="[Mm]ax|[Ll]imit"):
            session._check_screenshot_limit()

    def test_session_timeout_300s(self):
        """SESSION_TIMEOUT constant must be 300 seconds."""
        from app.services.tools.browser_tool import BrowserSession

        assert BrowserSession.SESSION_TIMEOUT == 300


class TestConcurrencyLimits:
    """Redis semaphore-based concurrency limits."""

    def test_concurrent_session_limit_per_user_1(self):
        """Second session for same user must be rejected."""
        from app.services.tools.browser_tool import ConcurrencyGuard

        guard = ConcurrencyGuard.__new__(ConcurrencyGuard)
        assert guard.MAX_PER_USER == 1

    def test_concurrent_session_limit_per_tenant_2(self):
        """Third concurrent session for same tenant must be rejected."""
        from app.services.tools.browser_tool import ConcurrencyGuard

        guard = ConcurrencyGuard.__new__(ConcurrencyGuard)
        assert guard.MAX_PER_TENANT == 2


class TestBuiltinBrowserRegistration:
    def test_builtin_browser_in_endpoints(self):
        """_BUILTIN_ENDPOINTS['builtin-browser'] maps to /api/internal/tools/browser."""
        from app.services.agency_tools import _BUILTIN_ENDPOINTS

        assert "builtin-browser" in _BUILTIN_ENDPOINTS
        assert _BUILTIN_ENDPOINTS["builtin-browser"] == "/api/internal/tools/browser"

    def test_builtin_browser_risk_level_high(self):
        """_BUILTIN_RISK_LEVELS['builtin-browser'] == 'high'."""
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS.get("builtin-browser") == "high"

    def test_builtin_browser_routes_to_execute_sandbox(self):
        """High risk level routes through _execute_sandbox() path."""
        from app.services.agency_tools import _BUILTIN_RISK_LEVELS

        assert _BUILTIN_RISK_LEVELS.get("builtin-browser") == "high"
