"""
Browser Automation Tool

Secure browser automation with 3-layer SSRF protection, Redis-based
concurrency limits, output size caps, and session lifecycle management.

Usage:
    guard = BrowserSSRFGuard()
    guard.validate_url(url, allowed_domains)
    session = BrowserSession(user_id, tenant_id, allowed_domains, redis_client)
    result = await session.execute_actions(actions)
"""

from __future__ import annotations

import ipaddress
import socket
import time
import uuid
from typing import Any
from urllib.parse import urlparse

import structlog

logger = structlog.get_logger(__name__)


# ── SSRF Protection ────────────────────────────────────────────────────────


class BrowserSSRFGuard:
    """3-layer SSRF protection for browser navigation.

    Layer 1: URL validation (synchronous, pre-navigation).
    Layer 2: DNS resolution check (catches DNS rebinding).
    Layer 3: Container network isolation (docker internal network).
    """

    BLOCKED_NETWORKS = [
        ipaddress.ip_network("10.0.0.0/8"),
        ipaddress.ip_network("172.16.0.0/12"),
        ipaddress.ip_network("192.168.0.0/16"),
        ipaddress.ip_network("127.0.0.0/8"),
        ipaddress.ip_network("169.254.0.0/16"),
        ipaddress.ip_network("0.0.0.0/8"),
        ipaddress.ip_network("::1/128"),
        ipaddress.ip_network("fc00::/7"),
        ipaddress.ip_network("fe80::/10"),
    ]

    BLOCKED_HOSTS = {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "[::1]",
        "169.254.169.254",
        "metadata.google.internal",
    }

    def validate_url(self, url: str, allowed_domains: list[str]) -> str:
        """Validate URL is safe to navigate. Raises ValueError if blocked.

        Args:
            url: The URL to navigate to.
            allowed_domains: List of allowed hostnames. Empty list denies all.

        Returns:
            The validated URL (normalized).

        Raises:
            ValueError: If the URL is blocked by SSRF rules.
        """
        parsed = urlparse(url)

        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Unsupported URL scheme: {parsed.scheme!r}. Only http/https allowed.")

        hostname = parsed.hostname or ""
        if not hostname:
            raise ValueError("URL has no hostname.")

        # Check blocked hostnames
        if hostname.lower() in self.BLOCKED_HOSTS:
            raise ValueError(f"Blocked host: {hostname!r}")

        # Check if hostname is an IP literal (avoid string-based exception discrimination)
        _ip_addr = None
        try:
            _ip_addr = ipaddress.ip_address(hostname)
        except ValueError:
            pass  # Not an IP literal — hostname string, DNS check in validate_url_dns

        if _ip_addr is not None:
            for network in self.BLOCKED_NETWORKS:
                if _ip_addr in network:
                    raise ValueError(
                        f"Blocked private/reserved IP address: {hostname!r}"
                    )

        # Allowed domains whitelist
        if not allowed_domains:
            raise ValueError(
                "No allowed domains configured -- all navigation denied. "
                "Configure allowedDomains to enable browser navigation."
            )

        # Check domain whitelist (exact or subdomain match)
        hostname_lower = hostname.lower()
        for domain in allowed_domains:
            domain_lower = domain.lower().strip()
            if hostname_lower == domain_lower or hostname_lower.endswith("." + domain_lower):
                return url

        raise ValueError(
            f"Domain {hostname!r} is not allowed. Allowed domains: {allowed_domains!r}"
        )

    def validate_url_dns(self, url: str, allowed_domains: list[str]) -> str:
        """Layer 2: DNS resolution check to catch DNS rebinding attacks.

        Resolves the hostname and verifies all resolved IPs are not private.
        Call this AFTER validate_url().

        Args:
            url: The URL to check (already validated by validate_url).
            allowed_domains: Allowed domains list (already checked).

        Returns:
            The validated URL.

        Raises:
            ValueError: If the hostname resolves to a private IP.
        """
        parsed = urlparse(url)
        hostname = parsed.hostname or ""

        try:
            addr_infos = socket.getaddrinfo(hostname, None)
        except socket.gaierror:
            raise ValueError(f"Cannot resolve hostname: {hostname!r}")

        for addr_info in addr_infos:
            ip_str = addr_info[4][0]
            try:
                addr = ipaddress.ip_address(ip_str)
                for network in self.BLOCKED_NETWORKS:
                    if addr in network:
                        raise ValueError(
                            f"DNS rebinding detected: {hostname!r} resolves to "
                            f"private IP {ip_str!r}"
                        )
            except ValueError as exc:
                if "DNS rebinding" in str(exc) or "private" in str(exc):
                    raise

        return url


# ── Concurrency Guard ──────────────────────────────────────────────────────


class ConcurrencyGuard:
    """Redis semaphore-based concurrency limits for browser sessions."""

    MAX_PER_USER = 1
    MAX_PER_TENANT = 2
    SEM_TTL = 310  # seconds (session timeout + buffer)

    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    async def acquire(self, user_id: int, tenant_id: str, session_id: str) -> None:
        """Acquire concurrency slots. Raises ValueError if limit exceeded.

        Args:
            user_id: The user's ID.
            tenant_id: The tenant's ID.
            session_id: The session UUID (stored in Redis value).

        Raises:
            ValueError: If per-user or per-tenant limit is reached.
        """
        user_key = f"browser:sem:user:{user_id}"
        tenant_key = f"browser:sem:tenant:{tenant_id}"

        # Per-user: SET NX with TTL
        acquired = await self._redis.set(user_key, session_id, nx=True, ex=self.SEM_TTL)
        if not acquired:
            raise ValueError(
                f"User {user_id} already has an active browser session. "
                "Only 1 concurrent session per user is allowed."
            )

        # Per-tenant: INCR with max check (atomic read-modify-write via pipeline)
        try:
            pipe = self._redis.pipeline()
            pipe.incr(tenant_key)
            pipe.expire(tenant_key, self.SEM_TTL)
            results = await pipe.execute()
            tenant_count = results[0]

            if tenant_count > self.MAX_PER_TENANT:
                # Decrement and release user semaphore
                await self._redis.decr(tenant_key)
                await self._redis.delete(user_key)
                raise ValueError(
                    f"Tenant {tenant_id} has reached the maximum of "
                    f"{self.MAX_PER_TENANT} concurrent browser sessions."
                )
        except ValueError:
            raise
        except Exception:
            # Release user semaphore on unexpected error
            await self._redis.delete(user_key)
            raise

    async def release(self, user_id: int, tenant_id: str) -> None:
        """Release concurrency slots."""
        user_key = f"browser:sem:user:{user_id}"
        tenant_key = f"browser:sem:tenant:{tenant_id}"

        await self._redis.delete(user_key)
        current = await self._redis.decr(tenant_key)
        if current < 0:
            await self._redis.set(tenant_key, 0, ex=self.SEM_TTL)


# ── Browser Session ────────────────────────────────────────────────────────


class BrowserSession:
    """Manages a single ephemeral browser session with output limits."""

    MAX_TEXT_LENGTH = 50_000
    MAX_HTML_LENGTH = 100_000
    MAX_LINKS = 200
    MAX_SCREENSHOTS = 5
    MAX_SCREENSHOT_SIZE = 1_048_576   # 1MB
    MAX_OUTPUT_SIZE = 204_800          # 200KB total
    ACTION_TIMEOUT = 60               # seconds per action
    SESSION_TIMEOUT = 300             # seconds total

    def __init__(
        self,
        user_id: int,
        tenant_id: str,
        allowed_domains: list[str],
        redis_client: Any | None = None,
    ) -> None:
        self._session_id = str(uuid.uuid4())
        self._user_id = user_id
        self._tenant_id = tenant_id
        self._allowed_domains = allowed_domains
        self._redis = redis_client
        self._ssrf_guard = BrowserSSRFGuard()
        self._created_at = time.monotonic()
        self._screenshot_count = 0
        self._total_output_bytes = 0
        self._pages_loaded = 0
        self._actual_cost = 0  # credits consumed by actions

    @property
    def session_id(self) -> str:
        return self._session_id

    def _check_session_timeout(self) -> None:
        elapsed = time.monotonic() - self._created_at
        if elapsed >= self.SESSION_TIMEOUT:
            raise ValueError(
                f"Browser session {self._session_id!r} timed out after "
                f"{self.SESSION_TIMEOUT}s."
            )

    def _check_screenshot_limit(self) -> None:
        if self._screenshot_count >= self.MAX_SCREENSHOTS:
            raise ValueError(
                f"Max screenshot limit of {self.MAX_SCREENSHOTS} reached for "
                f"session {self._session_id!r}."
            )

    def _truncate_text(self, text: str) -> str:
        """Truncate text to MAX_TEXT_LENGTH with a notice appended."""
        if len(text) <= self.MAX_TEXT_LENGTH:
            return text
        notice = f"\n\n[truncated: original {len(text)} chars, showing first {self.MAX_TEXT_LENGTH}]"
        return text[: self.MAX_TEXT_LENGTH] + notice

    def _check_output_budget(self, new_bytes: int) -> None:
        if self._total_output_bytes + new_bytes > self.MAX_OUTPUT_SIZE:
            raise ValueError(
                f"Session output size limit of {self.MAX_OUTPUT_SIZE} bytes exceeded."
            )
        self._total_output_bytes += new_bytes

    async def execute_actions(self, actions: list[dict]) -> dict:
        """Execute a sequence of browser actions (without real Playwright — stub for testing).

        In production, this delegates to the browser sandbox container.

        Args:
            actions: List of action dicts with 'action' key and action-specific params.

        Returns:
            Dict with results list, actual_cost, screenshots_taken, pages_loaded.
        """
        self._check_session_timeout()

        results = []
        for action_spec in actions:
            self._check_session_timeout()

            action_type = action_spec.get("action", "")
            try:
                result = await self._dispatch_action(action_spec)
                results.append({"action": action_type, "success": True, "data": result})
                self._actual_cost += 1  # 1 credit per action
            except ValueError as exc:
                results.append({"action": action_type, "success": False, "error": str(exc)})
                break  # Stop on SSRF or limit errors

        return {
            "session_id": self._session_id,
            "results": results,
            "actual_cost": self._actual_cost,
            "screenshots_taken": self._screenshot_count,
            "pages_loaded": self._pages_loaded,
        }

    async def _dispatch_action(self, spec: dict) -> dict:
        action = spec.get("action", "")

        if action == "navigate":
            return await self.navigate(spec["url"])
        elif action == "click":
            return await self.click(spec["selector"])
        elif action == "fill":
            return await self.fill(spec["selector"], spec["value"])
        elif action == "screenshot":
            return await self.screenshot()
        elif action == "extractText":
            return await self.extract_text(spec.get("selector"))
        elif action == "extractLinks":
            return await self.extract_links()
        elif action == "waitForSelector":
            return await self.wait_for_selector(spec["selector"])
        elif action == "scrollTo":
            return await self.scroll_to(spec.get("position", "top"))
        else:
            raise ValueError(f"Unknown browser action: {action!r}")

    async def navigate(self, url: str) -> dict:
        """Navigate to URL (SSRF-validated). Returns page title and status."""
        validated_url = self._ssrf_guard.validate_url(url, self._allowed_domains)
        self._pages_loaded += 1
        # Stub — real implementation would call sandbox container
        return {"url": validated_url, "title": "", "status": 200}

    async def click(self, selector: str) -> dict:
        """Click an element by CSS selector."""
        return {"selector": selector, "clicked": True}

    async def fill(self, selector: str, value: str) -> dict:
        """Fill a form field."""
        return {"selector": selector, "filled": True}

    async def screenshot(self) -> dict:
        """Take screenshot. Returns base64-encoded PNG. Max 5 per session."""
        self._check_screenshot_limit()
        self._screenshot_count += 1
        return {"screenshot_index": self._screenshot_count, "data": ""}

    async def extract_text(self, selector: str | None = None) -> dict:
        """Extract text content. Truncates at MAX_TEXT_LENGTH chars."""
        text = ""  # Stub
        truncated = self._truncate_text(text)
        self._check_output_budget(len(truncated.encode()))
        return {"text": truncated, "selector": selector}

    async def extract_links(self) -> dict:
        """Extract all links. Max MAX_LINKS returned."""
        links: list[str] = []  # Stub
        return {"links": links[: self.MAX_LINKS]}

    async def wait_for_selector(self, selector: str) -> dict:
        """Wait for element to appear (up to ACTION_TIMEOUT)."""
        return {"selector": selector, "found": True}

    async def scroll_to(self, position: str) -> dict:
        """Scroll to position ('top', 'bottom', or pixel offset)."""
        return {"position": position}
