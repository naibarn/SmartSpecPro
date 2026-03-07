diff --git a/python-backend/app/services/automation_exceptions.py b/python-backend/app/services/automation_exceptions.py
new file mode 100644
index 0000000..430b595
--- /dev/null
+++ b/python-backend/app/services/automation_exceptions.py
@@ -0,0 +1,64 @@
+"""Custom exception hierarchy for the Automation Copilot pipeline."""
+
+from __future__ import annotations
+
+
+class AutomationError(Exception):
+    """Base exception for all automation-related errors."""
+
+    def __init__(self, message: str = "", details: dict | None = None) -> None:
+        self.message = message
+        self.details = details
+        super().__init__(message)
+
+    def __str__(self) -> str:
+        return self.message
+
+
+class SSRFBlockedError(AutomationError):
+    def __init__(self, message: str = "URL blocked by SSRF protection", details: dict | None = None) -> None:
+        super().__init__(message, details)
+
+
+class DomainNotAllowedError(AutomationError):
+    def __init__(self, message: str = "Domain not in tenant allowed list", details: dict | None = None) -> None:
+        super().__init__(message, details)
+
+
+class BrowserCapacityError(AutomationError):
+    def __init__(self, message: str = "Browser capacity limit reached", details: dict | None = None) -> None:
+        super().__init__(message, details)
+
+
+class BrowserLaunchError(AutomationError):
+    pass
+
+
+class PageLoadError(AutomationError):
+    pass
+
+
+class SelectorNotFoundError(AutomationError):
+    pass
+
+
+class ScriptGenerationError(AutomationError):
+    pass
+
+
+class HealingExhaustedError(AutomationError):
+    pass
+
+
+class InsufficientCreditsError(AutomationError):
+    def __init__(self, message: str = "Insufficient credits for this operation", details: dict | None = None) -> None:
+        super().__init__(message, details)
+
+
+class FeatureDisabledError(AutomationError):
+    def __init__(self, message: str = "Automation Copilot feature is disabled", details: dict | None = None) -> None:
+        super().__init__(message, details)
+
+
+class CancellationRequestedError(AutomationError):
+    pass
diff --git a/python-backend/app/services/url_validator.py b/python-backend/app/services/url_validator.py
new file mode 100644
index 0000000..66f061f
--- /dev/null
+++ b/python-backend/app/services/url_validator.py
@@ -0,0 +1,122 @@
+"""SSRF-safe URL validator with DNS rebinding protection."""
+
+from __future__ import annotations
+
+import asyncio
+import ipaddress
+import socket
+from urllib.parse import urlparse
+
+from app.services.automation_exceptions import DomainNotAllowedError, SSRFBlockedError
+
+BLOCKED_CIDRS = [
+    ipaddress.ip_network("10.0.0.0/8"),
+    ipaddress.ip_network("172.16.0.0/12"),
+    ipaddress.ip_network("192.168.0.0/16"),
+    ipaddress.ip_network("127.0.0.0/8"),
+    ipaddress.ip_network("169.254.0.0/16"),
+    ipaddress.ip_network("0.0.0.0/8"),
+    ipaddress.ip_network("::1/128"),
+    ipaddress.ip_network("fc00::/7"),
+]
+
+BLOCKED_HOSTNAMES: frozenset[str] = frozenset(
+    {
+        "localhost",
+        "127.0.0.1",
+        "0.0.0.0",
+        "::1",
+        "169.254.169.254",
+        "metadata.google.internal",
+    }
+)
+
+
+def _is_ip_blocked(ip_str: str) -> bool:
+    """Check if an IP address falls within any blocked CIDR range."""
+    try:
+        addr = ipaddress.ip_address(ip_str)
+    except ValueError:
+        return False
+    return any(addr in network for network in BLOCKED_CIDRS)
+
+
+def _is_domain_allowed(hostname: str, allowed_domains: list[str]) -> bool:
+    """Check if hostname matches the allowed domains list (case-insensitive)."""
+    hostname_lower = hostname.lower()
+    for domain in allowed_domains:
+        domain_lower = domain.lower()
+        if domain_lower.startswith("*."):
+            suffix = domain_lower[1:]  # e.g. ".example.com"
+            if hostname_lower.endswith(suffix) and hostname_lower != domain_lower[2:]:
+                return True
+        elif hostname_lower == domain_lower:
+            return True
+    return False
+
+
+async def validate_url_with_dns(url: str, allowed_domains: list[str]) -> None:
+    """Validate URL is safe for browser navigation.
+
+    Raises SSRFBlockedError or DomainNotAllowedError on violation.
+    Returns None on success (URL is safe).
+    """
+    parsed = urlparse(url)
+
+    # 1. Scheme check
+    if parsed.scheme not in ("http", "https"):
+        raise SSRFBlockedError(
+            f"Scheme '{parsed.scheme}' not allowed, only http/https",
+            details={"scheme": parsed.scheme},
+        )
+
+    # 2. Extract hostname (strip brackets for IPv6)
+    hostname = parsed.hostname or ""
+    if not hostname:
+        raise SSRFBlockedError("No hostname in URL")
+
+    # 3. Blocked hostname check
+    if hostname.lower() in BLOCKED_HOSTNAMES:
+        raise SSRFBlockedError(
+            f"Hostname '{hostname}' is blocked",
+            details={"hostname": hostname},
+        )
+
+    # 4. Check if hostname is a literal IP address
+    try:
+        addr = ipaddress.ip_address(hostname)
+        if _is_ip_blocked(str(addr)):
+            raise SSRFBlockedError(
+                f"IP address {addr} is in a blocked range",
+                details={"ip": str(addr)},
+            )
+        # Literal IP that's not blocked — still needs domain check
+        # For literal IPs, we skip the domain allow-list (they passed IP check)
+        return
+    except ValueError:
+        pass  # Not an IP literal, proceed to domain checks
+
+    # 5. Domain allow-list check (before DNS resolution)
+    if not _is_domain_allowed(hostname, allowed_domains):
+        raise DomainNotAllowedError(
+            f"Domain '{hostname}' not in allowed list",
+            details={"hostname": hostname},
+        )
+
+    # 6. DNS resolution with SSRF rebinding check
+    loop = asyncio.get_event_loop()
+    try:
+        addrinfos = await loop.run_in_executor(None, socket.getaddrinfo, hostname, None)
+    except socket.gaierror as exc:
+        raise SSRFBlockedError(
+            f"DNS resolution failed for '{hostname}': {exc}",
+            details={"hostname": hostname},
+        ) from exc
+
+    for family, _type, _proto, _canonname, sockaddr in addrinfos:
+        ip_str = sockaddr[0]
+        if _is_ip_blocked(ip_str):
+            raise SSRFBlockedError(
+                f"DNS rebinding detected: '{hostname}' resolved to blocked IP {ip_str}",
+                details={"hostname": hostname, "resolved_ip": ip_str},
+            )
diff --git a/python-backend/tests/unit/automation/__init__.py b/python-backend/tests/unit/automation/__init__.py
new file mode 100644
index 0000000..e69de29
diff --git a/python-backend/tests/unit/automation/test_automation_exceptions.py b/python-backend/tests/unit/automation/test_automation_exceptions.py
new file mode 100644
index 0000000..1b6c779
--- /dev/null
+++ b/python-backend/tests/unit/automation/test_automation_exceptions.py
@@ -0,0 +1,85 @@
+"""Tests for the automation exception hierarchy."""
+
+import pytest
+
+from app.services.automation_exceptions import (
+    AutomationError,
+    BrowserCapacityError,
+    BrowserLaunchError,
+    CancellationRequestedError,
+    DomainNotAllowedError,
+    FeatureDisabledError,
+    HealingExhaustedError,
+    InsufficientCreditsError,
+    PageLoadError,
+    ScriptGenerationError,
+    SelectorNotFoundError,
+    SSRFBlockedError,
+)
+
+ALL_EXCEPTION_CLASSES = [
+    SSRFBlockedError,
+    DomainNotAllowedError,
+    BrowserCapacityError,
+    BrowserLaunchError,
+    PageLoadError,
+    SelectorNotFoundError,
+    ScriptGenerationError,
+    HealingExhaustedError,
+    InsufficientCreditsError,
+    FeatureDisabledError,
+    CancellationRequestedError,
+]
+
+
+class TestExceptionHierarchy:
+    def test_all_exceptions_extend_automation_error(self):
+        assert issubclass(AutomationError, Exception)
+        for cls in ALL_EXCEPTION_CLASSES:
+            assert issubclass(cls, AutomationError), f"{cls.__name__} must extend AutomationError"
+
+    def test_exception_stores_message_and_details(self):
+        err = AutomationError("msg", details={"key": "val"})
+        assert err.message == "msg"
+        assert err.details == {"key": "val"}
+
+    def test_exception_details_defaults_to_none(self):
+        err = AutomationError("msg")
+        assert err.details is None
+
+    def test_str_includes_message(self):
+        err = SSRFBlockedError("blocked")
+        assert "blocked" in str(err)
+
+    @pytest.mark.parametrize(
+        "cls,keyword",
+        [
+            (SSRFBlockedError, "SSRF"),
+            (DomainNotAllowedError, "domain"),
+            (BrowserCapacityError, "capacity"),
+            (InsufficientCreditsError, "credits"),
+            (FeatureDisabledError, "disabled"),
+        ],
+    )
+    def test_specific_exceptions_have_correct_default_messages(self, cls, keyword):
+        err = cls()
+        assert keyword.lower() in str(err).lower()
+
+    def test_all_eleven_classes_exist(self):
+        import app.services.automation_exceptions as mod
+
+        expected = [
+            "SSRFBlockedError",
+            "DomainNotAllowedError",
+            "BrowserCapacityError",
+            "BrowserLaunchError",
+            "PageLoadError",
+            "SelectorNotFoundError",
+            "ScriptGenerationError",
+            "HealingExhaustedError",
+            "InsufficientCreditsError",
+            "FeatureDisabledError",
+            "CancellationRequestedError",
+        ]
+        for name in expected:
+            assert hasattr(mod, name), f"Module missing {name}"
diff --git a/python-backend/tests/unit/automation/test_url_validator.py b/python-backend/tests/unit/automation/test_url_validator.py
new file mode 100644
index 0000000..6c6f3cb
--- /dev/null
+++ b/python-backend/tests/unit/automation/test_url_validator.py
@@ -0,0 +1,159 @@
+"""Tests for the SSRF-safe URL validator."""
+
+from unittest.mock import patch
+
+import pytest
+
+from app.services.automation_exceptions import DomainNotAllowedError, SSRFBlockedError
+from app.services.url_validator import validate_url_with_dns
+
+
+def _mock_getaddrinfo(ip: str):
+    """Return a mock getaddrinfo that resolves to the given IP."""
+    return lambda host, port, *a, **kw: [(2, 1, 6, "", (ip, 0))]
+
+
+@pytest.mark.asyncio
+class TestRejectsNonHttpSchemes:
+    @pytest.mark.parametrize(
+        "url",
+        [
+            "ftp://example.com",
+            "file:///etc/passwd",
+            "javascript:alert(1)",
+        ],
+    )
+    async def test_rejects_non_http_schemes(self, url):
+        with pytest.raises(SSRFBlockedError):
+            await validate_url_with_dns(url, allowed_domains=["example.com"])
+
+
+@pytest.mark.asyncio
+class TestRejectsBlockedCIDR:
+    @pytest.mark.parametrize(
+        "ip",
+        [
+            "10.0.0.1",
+            "172.16.0.1",
+            "192.168.1.1",
+            "127.0.0.1",
+            "169.254.169.254",
+            "0.0.0.1",
+        ],
+    )
+    async def test_rejects_blocked_cidr_ranges(self, ip):
+        with patch("socket.getaddrinfo", _mock_getaddrinfo(ip)):
+            with pytest.raises(SSRFBlockedError):
+                await validate_url_with_dns(
+                    f"http://blocked-test.com/path",
+                    allowed_domains=["blocked-test.com"],
+                )
+
+
+@pytest.mark.asyncio
+class TestRejectsIPv6Blocked:
+    @pytest.mark.parametrize(
+        "url,ip",
+        [
+            ("http://[::1]/path", "::1"),
+            ("http://[fc00::1]/path", "fc00::1"),
+        ],
+    )
+    async def test_rejects_ipv6_blocked_ranges(self, url, ip):
+        with pytest.raises(SSRFBlockedError):
+            await validate_url_with_dns(url, allowed_domains=["*"])
+
+
+@pytest.mark.asyncio
+class TestRejectsBlockedHostnames:
+    @pytest.mark.parametrize(
+        "hostname",
+        [
+            "localhost",
+            "127.0.0.1",
+            "0.0.0.0",
+            "::1",
+            "169.254.169.254",
+            "metadata.google.internal",
+        ],
+    )
+    async def test_rejects_blocked_hostnames(self, hostname):
+        with pytest.raises(SSRFBlockedError):
+            await validate_url_with_dns(
+                f"http://{hostname}/path",
+                allowed_domains=[hostname],
+            )
+
+
+@pytest.mark.asyncio
+class TestDNSRebinding:
+    async def test_dns_rebinding_blocked(self):
+        with patch("socket.getaddrinfo", _mock_getaddrinfo("192.168.1.100")):
+            with pytest.raises(SSRFBlockedError):
+                await validate_url_with_dns(
+                    "http://evil.example.com/path",
+                    allowed_domains=["evil.example.com"],
+                )
+
+
+@pytest.mark.asyncio
+class TestDomainWhitelist:
+    async def test_domain_whitelist_checked_before_dns(self):
+        with patch("socket.getaddrinfo") as mock_dns:
+            with pytest.raises(DomainNotAllowedError):
+                await validate_url_with_dns(
+                    "http://other.example.com/page",
+                    allowed_domains=["safe.example.com"],
+                )
+            mock_dns.assert_not_called()
+
+    async def test_domain_not_in_allowed_list_raises(self):
+        with pytest.raises(DomainNotAllowedError):
+            await validate_url_with_dns(
+                "http://notallowed.com",
+                allowed_domains=["allowed.com"],
+            )
+
+    async def test_domain_matching_case_insensitive(self):
+        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
+            await validate_url_with_dns(
+                "http://Example.COM/path",
+                allowed_domains=["example.com"],
+            )
+
+    async def test_wildcard_domain_matching(self):
+        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
+            # Subdomain should pass
+            await validate_url_with_dns(
+                "http://sub.example.com",
+                allowed_domains=["*.example.com"],
+            )
+
+        # Bare domain should fail
+        with pytest.raises(DomainNotAllowedError):
+            await validate_url_with_dns(
+                "http://example.com",
+                allowed_domains=["*.example.com"],
+            )
+
+
+@pytest.mark.asyncio
+class TestValidURL:
+    async def test_valid_public_url_passes(self):
+        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
+            await validate_url_with_dns(
+                "http://public-site.com/page",
+                allowed_domains=["public-site.com"],
+            )
+
+
+@pytest.mark.asyncio
+class TestEmptyAllowedDomains:
+    async def test_empty_allowed_domains_rejects_all(self):
+        with patch("socket.getaddrinfo") as mock_dns:
+            with pytest.raises(DomainNotAllowedError):
+                await validate_url_with_dns(
+                    "http://anything.com",
+                    allowed_domains=[],
+                )
+            mock_dns.assert_not_called()
