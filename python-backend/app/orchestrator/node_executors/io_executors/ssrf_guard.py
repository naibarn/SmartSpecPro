"""SSRF protection for outbound HTTP requests."""
import asyncio
import ipaddress
import socket
from urllib.parse import urlparse

import structlog

logger = structlog.get_logger()


class SSRFGuard:
    """
    Validates URLs to prevent Server-Side Request Forgery (SSRF).

    Blocks:
    - Private IP ranges: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    - Loopback: 127.0.0.0/8, ::1
    - Link-local: 169.254.0.0/16 (AWS/GCP metadata endpoint)
    - Zero address: 0.0.0.0
    - Known internal service ports: 5432, 6379, 3306, 27017, 9200, 2379
    - Non-HTTP schemes: ftp://, file://, gopher://, etc.

    Enterprise tenants can allowlist specific hostnames.
    """

    # Private and reserved IP networks that must be blocked
    BLOCKED_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("100.64.0.0/10"),  # CGN
        ipaddress.ip_network("192.0.0.0/24"),  # IETF protocol assignments
        ipaddress.ip_network("192.0.2.0/24"),  # TEST-NET-1
        ipaddress.ip_network("198.51.100.0/24"),  # TEST-NET-2
        ipaddress.ip_network("203.0.113.0/24"),  # TEST-NET-3
        ipaddress.ip_network("224.0.0.0/4"),  # Multicast
        ipaddress.ip_network("240.0.0.0/4"),  # Reserved
        ipaddress.ip_network("255.255.255.255/32"),
        # IPv6
        ipaddress.ip_network("::1/128"),  # Loopback
        ipaddress.ip_network("fc00::/7"),  # Unique local
        ipaddress.ip_network("fe80::/10"),  # Link-local
    ]

    # Ports for common internal services that should never be hit
    BLOCKED_PORTS: set[int] = {
        5432,  # PostgreSQL
        3306,  # MySQL
        6379,  # Redis
        27017,  # MongoDB
        9200,  # Elasticsearch
        2379,  # etcd
        8500,  # Consul
        11211,  # Memcached
    }

    ALLOWED_SCHEMES: set[str] = {"http", "https"}

    def __init__(self, tenant_allowlist: list[str] | None = None):
        """
        Args:
            tenant_allowlist: List of hostnames that bypass SSRF checks
                              (for enterprise tenants with internal APIs).
        """
        self.tenant_allowlist: set[str] = set(tenant_allowlist or [])

    def is_blocked_ip(self, ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
        """Check if an IP address falls within any blocked network range."""
        for network in self.BLOCKED_NETWORKS:
            if ip in network:
                return True
        return False

    async def _resolve_dns(self, hostname: str) -> list[str]:
        """
        Resolve hostname to IP addresses.

        Uses socket.getaddrinfo (sync, but called in executor thread).
        Returns list of resolved IP strings.
        """
        loop = asyncio.get_event_loop()
        addrs = await loop.run_in_executor(
            None,
            lambda: socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM),
        )
        return list({addr[4][0] for addr in addrs})

    async def validate_url(self, url: str) -> str:
        """
        Validate a URL is safe for outbound requests.

        Args:
            url: The URL to validate.

        Returns:
            The validated URL (unchanged if safe).

        Raises:
            ValueError: If the URL is blocked (SSRF risk).
        """
        parsed = urlparse(url)

        # 1. Scheme check
        if parsed.scheme not in self.ALLOWED_SCHEMES:
            raise ValueError(f"Blocked URL scheme '{parsed.scheme}'. Only HTTP/HTTPS allowed.")

        hostname = parsed.hostname
        if not hostname:
            raise ValueError("URL has no hostname.")

        # 2. Port check
        port = parsed.port
        if port and port in self.BLOCKED_PORTS:
            raise ValueError(f"Blocked port {port} -- known internal service port.")

        # 3. Hostname literal check (before DNS)
        #    Catch http://127.0.0.1, http://[::1], http://0.0.0.0
        try:
            ip_obj = ipaddress.ip_address(hostname)
            if self.is_blocked_ip(ip_obj):
                raise ValueError(f"Blocked: {hostname} resolves to private/reserved IP.")
        except ValueError as e:
            if "Blocked" in str(e):
                raise
            # Not an IP literal, it's a hostname -- continue to DNS resolution

        # 4. Check against tenant allowlist
        if hostname in self.tenant_allowlist:
            logger.info(
                "ssrf_guard_allowlisted",
                hostname=hostname,
                url=url,
            )
            return url

        # 5. DNS resolution check
        try:
            resolved_ips = await self._resolve_dns(hostname)
        except socket.gaierror as exc:
            raise ValueError(f"DNS resolution failed for hostname: {hostname}") from exc

        for ip_str in resolved_ips:
            ip_obj = ipaddress.ip_address(ip_str)
            if self.is_blocked_ip(ip_obj):
                raise ValueError(f"Blocked: {hostname} resolves to private/reserved IP {ip_str}.")

        return url
