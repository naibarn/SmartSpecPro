"""Tests for the SSRF-safe URL validator."""

from unittest.mock import patch

import pytest

from app.services.automation_exceptions import DomainNotAllowedError, SSRFBlockedError
from app.services.url_validator import validate_url_with_dns


def _mock_getaddrinfo(ip: str):
    """Return a mock getaddrinfo that resolves to the given IP."""
    return lambda host, port, *a, **kw: [(2, 1, 6, "", (ip, 0))]


@pytest.mark.asyncio
class TestRejectsNonHttpSchemes:
    @pytest.mark.parametrize(
        "url",
        [
            "ftp://example.com",
            "file:///etc/passwd",
            "javascript:alert(1)",
        ],
    )
    async def test_rejects_non_http_schemes(self, url):
        with pytest.raises(SSRFBlockedError):
            await validate_url_with_dns(url, allowed_domains=["example.com"])


@pytest.mark.asyncio
class TestRejectsBlockedCIDR:
    @pytest.mark.parametrize(
        "ip",
        [
            "10.0.0.1",
            "172.16.0.1",
            "192.168.1.1",
            "127.0.0.1",
            "169.254.169.254",
            "0.0.0.1",
        ],
    )
    async def test_rejects_blocked_cidr_ranges(self, ip):
        with patch("socket.getaddrinfo", _mock_getaddrinfo(ip)):
            with pytest.raises(SSRFBlockedError):
                await validate_url_with_dns(
                    f"http://blocked-test.com/path",
                    allowed_domains=["blocked-test.com"],
                )


@pytest.mark.asyncio
class TestRejectsIPv6Blocked:
    @pytest.mark.parametrize(
        "url,ip",
        [
            ("http://[::1]/path", "::1"),
            ("http://[fc00::1]/path", "fc00::1"),
        ],
    )
    async def test_rejects_ipv6_blocked_ranges(self, url, ip):
        with pytest.raises(SSRFBlockedError):
            await validate_url_with_dns(url, allowed_domains=["*"])


@pytest.mark.asyncio
class TestRejectsBlockedHostnames:
    @pytest.mark.parametrize(
        "hostname",
        [
            "localhost",
            "127.0.0.1",
            "0.0.0.0",
            "::1",
            "169.254.169.254",
            "metadata.google.internal",
        ],
    )
    async def test_rejects_blocked_hostnames(self, hostname):
        with pytest.raises(SSRFBlockedError):
            await validate_url_with_dns(
                f"http://{hostname}/path",
                allowed_domains=[hostname],
            )


@pytest.mark.asyncio
class TestDNSRebinding:
    async def test_dns_rebinding_blocked(self):
        with patch("socket.getaddrinfo", _mock_getaddrinfo("192.168.1.100")):
            with pytest.raises(SSRFBlockedError):
                await validate_url_with_dns(
                    "http://evil.example.com/path",
                    allowed_domains=["evil.example.com"],
                )


@pytest.mark.asyncio
class TestDomainWhitelist:
    async def test_domain_whitelist_checked_before_dns(self):
        with patch("socket.getaddrinfo") as mock_dns:
            with pytest.raises(DomainNotAllowedError):
                await validate_url_with_dns(
                    "http://other.example.com/page",
                    allowed_domains=["safe.example.com"],
                )
            mock_dns.assert_not_called()

    async def test_domain_not_in_allowed_list_raises(self):
        with pytest.raises(DomainNotAllowedError):
            await validate_url_with_dns(
                "http://notallowed.com",
                allowed_domains=["allowed.com"],
            )

    async def test_domain_matching_case_insensitive(self):
        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
            await validate_url_with_dns(
                "http://Example.COM/path",
                allowed_domains=["example.com"],
            )

    async def test_wildcard_domain_matching(self):
        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
            # Subdomain should pass
            await validate_url_with_dns(
                "http://sub.example.com",
                allowed_domains=["*.example.com"],
            )

        # Bare domain should fail
        with pytest.raises(DomainNotAllowedError):
            await validate_url_with_dns(
                "http://example.com",
                allowed_domains=["*.example.com"],
            )


@pytest.mark.asyncio
class TestValidURL:
    async def test_valid_public_url_passes(self):
        with patch("socket.getaddrinfo", _mock_getaddrinfo("93.184.216.34")):
            await validate_url_with_dns(
                "http://public-site.com/page",
                allowed_domains=["public-site.com"],
            )


@pytest.mark.asyncio
class TestEmptyAllowedDomains:
    async def test_empty_allowed_domains_rejects_all(self):
        with patch("socket.getaddrinfo") as mock_dns:
            with pytest.raises(DomainNotAllowedError):
                await validate_url_with_dns(
                    "http://anything.com",
                    allowed_domains=[],
                )
            mock_dns.assert_not_called()
