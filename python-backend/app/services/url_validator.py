"""SSRF-safe URL validator with DNS rebinding protection."""

from __future__ import annotations

import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

from app.services.automation_exceptions import DomainNotAllowedError, SSRFBlockedError

BLOCKED_CIDRS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("0.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]

BLOCKED_HOSTNAMES: frozenset[str] = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "169.254.169.254",
        "metadata.google.internal",
    }
)


def _is_ip_blocked(ip_str: str) -> bool:
    """Check if an IP address falls within any blocked CIDR range."""
    try:
        addr = ipaddress.ip_address(ip_str)
    except ValueError:
        return True  # Fail-closed: unparseable IP is treated as blocked
    return any(addr in network for network in BLOCKED_CIDRS)


def _is_domain_allowed(hostname: str, allowed_domains: list[str]) -> bool:
    """Check if hostname matches the allowed domains list (case-insensitive)."""
    hostname_lower = hostname.lower()
    for domain in allowed_domains:
        domain_lower = domain.lower()
        if domain_lower.startswith("*."):
            suffix = domain_lower[1:]  # e.g. ".example.com"
            if hostname_lower.endswith(suffix) and hostname_lower != domain_lower[2:]:
                return True
        elif hostname_lower == domain_lower:
            return True
    return False


async def validate_url_with_dns(url: str, allowed_domains: list[str]) -> None:
    """Validate URL is safe for browser navigation.

    Raises SSRFBlockedError or DomainNotAllowedError on violation.
    Returns None on success (URL is safe).
    """
    parsed = urlparse(url)

    # 1. Scheme check
    if parsed.scheme not in ("http", "https"):
        raise SSRFBlockedError(
            f"Scheme '{parsed.scheme}' not allowed, only http/https",
            details={"scheme": parsed.scheme},
        )

    # 2. Extract hostname (strip brackets for IPv6)
    hostname = parsed.hostname or ""
    if not hostname:
        raise SSRFBlockedError("No hostname in URL")

    # 3. Blocked hostname check
    if hostname.lower() in BLOCKED_HOSTNAMES:
        raise SSRFBlockedError(
            f"Hostname '{hostname}' is blocked",
            details={"hostname": hostname},
        )

    # 4. Check if hostname is a literal IP address
    try:
        addr = ipaddress.ip_address(hostname)
        if _is_ip_blocked(str(addr)):
            raise SSRFBlockedError(
                f"IP address {addr} is in a blocked range",
                details={"ip": str(addr)},
            )
        # Literal IP that's not blocked — still reject if not in allowed_domains
        if not _is_domain_allowed(str(addr), allowed_domains):
            raise SSRFBlockedError(
                f"Literal IP '{addr}' not in allowed domains",
                details={"ip": str(addr)},
            )
    except ValueError:
        pass  # Not an IP literal, proceed to domain checks

    # 5. Domain allow-list check (before DNS resolution)
    if not _is_domain_allowed(hostname, allowed_domains):
        raise DomainNotAllowedError(
            f"Domain '{hostname}' not in allowed list",
            details={"hostname": hostname},
        )

    # 6. DNS resolution with SSRF rebinding check
    loop = asyncio.get_running_loop()
    try:
        addrinfos = await loop.run_in_executor(None, socket.getaddrinfo, hostname, None)
    except socket.gaierror as exc:
        raise SSRFBlockedError(
            f"DNS resolution failed for '{hostname}': {exc}",
            details={"hostname": hostname},
        ) from exc

    for family, _type, _proto, _canonname, sockaddr in addrinfos:
        ip_str = sockaddr[0]
        if _is_ip_blocked(ip_str):
            raise SSRFBlockedError(
                f"DNS rebinding detected: '{hostname}' resolved to blocked IP {ip_str}",
                details={"hostname": hostname, "resolved_ip": ip_str},
            )
