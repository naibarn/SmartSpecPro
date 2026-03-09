diff --git a/apps/web/server/__tests__/browserToolDomainValidation.test.ts b/apps/web/server/__tests__/browserToolDomainValidation.test.ts
new file mode 100644
index 0000000..d5f4cbb
--- /dev/null
+++ b/apps/web/server/__tests__/browserToolDomainValidation.test.ts
@@ -0,0 +1,103 @@
+/**
+ * Tests for Node-side domain validation in browserTool.ts.
+ * Validates that domain checks happen BEFORE credit deduction
+ * to avoid wasting credits on invalid requests.
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// We test the domain validation logic directly since we can't easily
+// spin up the full Express router with all its dependencies.
+// The validation function is extracted for testability.
+
+import { validateBrowserDomains } from "../routes/browserTool";
+
+describe("browserTool domain validation", () => {
+  describe("validateBrowserDomains", () => {
+    it("domain in tenant allowlist passes validation", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://example.com/page" }],
+        ["example.com"],
+      );
+      expect(result).toBeNull(); // null = no error
+    });
+
+    it("domain NOT in allowlist returns 403 error", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://evil.com/hack" }],
+        ["example.com"],
+      );
+      expect(result).not.toBeNull();
+      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
+      expect(result!.status).toBe(403);
+    });
+
+    it("multiple URLs in actions, one invalid returns 403", () => {
+      const result = validateBrowserDomains(
+        [
+          { action: "navigate", url: "https://example.com/page1" },
+          { action: "navigate", url: "https://evil.com/hack" },
+        ],
+        ["example.com"],
+      );
+      expect(result).not.toBeNull();
+      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
+      expect(result!.message).toContain("evil.com");
+    });
+
+    it("no allowed_domains configured blocks all domains", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://example.com/page" }],
+        [],
+      );
+      expect(result).not.toBeNull();
+      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
+    });
+
+    it("undefined allowed_domains blocks all domains", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://example.com/page" }],
+        undefined as any,
+      );
+      expect(result).not.toBeNull();
+      expect(result!.code).toBe("DOMAIN_NOT_ALLOWED");
+    });
+
+    it("non-navigate actions are not checked", () => {
+      const result = validateBrowserDomains(
+        [
+          { action: "click", selector: "#btn" },
+          { action: "screenshot" },
+        ],
+        [], // empty allowlist
+      );
+      // No navigate actions = no domain check needed
+      expect(result).toBeNull();
+    });
+
+    it("subdomain of allowed domain passes", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://sub.example.com/page" }],
+        ["example.com"],
+      );
+      expect(result).toBeNull();
+    });
+
+    it("invalid URL returns 400 error", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "not-a-valid-url" }],
+        ["example.com"],
+      );
+      expect(result).not.toBeNull();
+      expect(result!.status).toBe(400);
+    });
+
+    it("case insensitive domain matching", () => {
+      const result = validateBrowserDomains(
+        [{ action: "navigate", url: "https://EXAMPLE.COM/page" }],
+        ["example.com"],
+      );
+      expect(result).toBeNull();
+    });
+  });
+});
diff --git a/apps/web/server/routes/browserTool.ts b/apps/web/server/routes/browserTool.ts
index 364af17..d4cdf8a 100644
--- a/apps/web/server/routes/browserTool.ts
+++ b/apps/web/server/routes/browserTool.ts
@@ -26,6 +26,63 @@ import { ENV } from "../_core/env";
 
 const router = Router();
 
+// ── Domain validation (exported for testing) ────────────────────────────────
+
+export interface DomainValidationError {
+  status: number;
+  code: string;
+  message: string;
+}
+
+export function validateBrowserDomains(
+  actions: Array<{ action: string; url?: string; [key: string]: unknown }>,
+  allowedDomains: string[] | undefined,
+): DomainValidationError | null {
+  const urlsInActions = actions
+    .filter((a) => a.action === "navigate" && a.url)
+    .map((a) => a.url as string);
+
+  if (urlsInActions.length === 0) {
+    return null; // No navigate actions = no domain check needed
+  }
+
+  if (!allowedDomains || allowedDomains.length === 0) {
+    return {
+      status: 403,
+      code: "DOMAIN_NOT_ALLOWED",
+      message: "No allowed domains configured. All navigation is blocked.",
+    };
+  }
+
+  for (const url of urlsInActions) {
+    let hostname: string;
+    try {
+      hostname = new URL(url).hostname.toLowerCase();
+    } catch {
+      return {
+        status: 400,
+        code: "INVALID_URL",
+        message: `Invalid URL: "${url}"`,
+      };
+    }
+
+    const isAllowed = allowedDomains.some((d: string) => {
+      const domain = d.toLowerCase().trim();
+      return hostname === domain || hostname.endsWith("." + domain);
+    });
+
+    if (!isAllowed) {
+      return {
+        status: 403,
+        code: "DOMAIN_NOT_ALLOWED",
+        message: `Domain "${hostname}" is not in the allowed domains list.`,
+      };
+    }
+  }
+
+  return null;
+}
+
 const BROWSER_RESERVE_CREDITS = 20;
 const PYTHON_BACKEND_URL = ENV.pythonBackendUrl || "http://127.0.0.1:8000";
 
@@ -132,6 +189,19 @@ router.post("/api/internal/tools/browser", async (req: Request, res: Response) =
     return;
   }
 
+  // Domain validation — BEFORE concurrency and credit checks (fail fast)
+  const domainError = validateBrowserDomains(
+    actions as Array<{ action: string; url?: string }>,
+    allowedDomains,
+  );
+  if (domainError) {
+    res.status(domainError.status).json({
+      error: domainError.message,
+      code: domainError.code,
+    });
+    return;
+  }
+
   const sessionId = crypto.randomUUID();
   let concurrencyAcquired = false;
   let creditsReserved = false;
diff --git a/python-backend/app/services/tools/browser_tool.py b/python-backend/app/services/tools/browser_tool.py
index a059963..663b51b 100644
--- a/python-backend/app/services/tools/browser_tool.py
+++ b/python-backend/app/services/tools/browser_tool.py
@@ -13,6 +13,7 @@ Usage:
 
 from __future__ import annotations
 
+import asyncio
 import ipaddress
 import socket
 import time
@@ -21,6 +22,7 @@ from typing import Any
 from urllib.parse import urlparse
 
 import structlog
+from sqlalchemy.ext.asyncio import AsyncSession
 
 logger = structlog.get_logger(__name__)
 
@@ -157,6 +159,75 @@ class BrowserSSRFGuard:
         return url
 
 
+# ── SSRF Route Filter (defense-in-depth) ──────────────────────────────────
+
+
+def ssrf_route_filter(url: str, allowed_domains: list[str]) -> bool:
+    """Return True if the request should be ALLOWED, False if blocked.
+
+    Checks:
+    1. URL hostname is not a private/reserved IP
+    2. URL hostname matches allowed_domains whitelist
+    3. Blocks metadata endpoints (169.254.169.254, metadata.google.internal)
+
+    Used as the decision function for Playwright page.route() interception.
+    """
+    try:
+        parsed = urlparse(url)
+        hostname = parsed.hostname or ""
+    except Exception:
+        return False
+
+    if not hostname:
+        return False
+
+    hostname_lower = hostname.lower()
+
+    # Check blocked hosts
+    if hostname_lower in BrowserSSRFGuard.BLOCKED_HOSTS:
+        logger.warning(
+            "ssrf_route_blocked",
+            blocked_url=url,
+            reason="blocked_host",
+        )
+        return False
+
+    # Check if hostname is an IP and if it's in a blocked range
+    try:
+        ip_addr = ipaddress.ip_address(hostname)
+        for network in BrowserSSRFGuard.BLOCKED_NETWORKS:
+            if ip_addr in network:
+                logger.warning(
+                    "ssrf_route_blocked",
+                    blocked_url=url,
+                    reason="private_ip",
+                )
+                return False
+    except ValueError:
+        pass  # Not an IP literal, check domain allowlist
+
+    # Check domain allowlist
+    if not allowed_domains:
+        logger.warning(
+            "ssrf_route_blocked",
+            blocked_url=url,
+            reason="no_allowed_domains",
+        )
+        return False
+
+    for domain in allowed_domains:
+        domain_lower = domain.lower().strip()
+        if hostname_lower == domain_lower or hostname_lower.endswith("." + domain_lower):
+            return True
+
+    logger.warning(
+        "ssrf_route_blocked",
+        blocked_url=url,
+        reason="not_in_allowlist",
+    )
+    return False
+
+
 # ── Concurrency Guard ──────────────────────────────────────────────────────
 
 
@@ -240,6 +311,8 @@ class BrowserSession:
     MAX_OUTPUT_SIZE = 204_800          # 200KB total
     ACTION_TIMEOUT = 60               # seconds per action
     SESSION_TIMEOUT = 300             # seconds total
+    MAX_ACTIONS = 50                  # Reject upfront if actions list exceeds this
+    MAX_PAGES = 5                     # Abort at runtime when pages loaded reaches this
 
     def __init__(
         self,
@@ -247,12 +320,14 @@ class BrowserSession:
         tenant_id: str,
         allowed_domains: list[str],
         redis_client: Any | None = None,
+        dispatcher: Any | None = None,
     ) -> None:
         self._session_id = str(uuid.uuid4())
         self._user_id = user_id
         self._tenant_id = tenant_id
         self._allowed_domains = allowed_domains
         self._redis = redis_client
+        self._dispatcher = dispatcher
         self._ssrf_guard = BrowserSSRFGuard()
         self._created_at = time.monotonic()
         self._screenshot_count = 0
@@ -293,10 +368,52 @@ class BrowserSession:
             )
         self._total_output_bytes += new_bytes
 
+    async def _wait_job(self, job_id: str | None) -> dict:
+        """Wait for sandbox job completion and return result.
+
+        If job_id is None (sandbox disabled/fallback), returns empty result.
+        Polls job status with exponential backoff up to ACTION_TIMEOUT.
+        """
+        if job_id is None:
+            return {}
+
+        from app.models.sandbox import SandboxJob
+
+        backoff = 0.1
+        max_wait = self.ACTION_TIMEOUT
+        elapsed = 0.0
+
+        while elapsed < max_wait:
+            await asyncio.sleep(backoff)
+            elapsed += backoff
+
+            # Query job status via dispatcher's db session
+            from sqlalchemy import select
+            stmt = select(SandboxJob).where(SandboxJob.id == job_id)
+            result = await self._dispatcher.db.execute(stmt)
+            job = result.scalar_one_or_none()
+
+            if job is None:
+                raise ValueError(f"Sandbox job {job_id} not found.")
+
+            if job.status == "completed":
+                return job.output_manifest_json or {}
+            elif job.status in ("failed", "timed_out", "canceled"):
+                reason = getattr(job, "status_reason", None) or job.status
+                raise ValueError(f"Sandbox job {job_id} {job.status}: {reason}")
+
+            # Exponential backoff, capped at 2s
+            backoff = min(backoff * 2, 2.0)
+
+        raise ValueError(
+            f"Sandbox job {job_id} timed out after {max_wait}s."
+        )
+
     async def execute_actions(self, actions: list[dict]) -> dict:
-        """Execute a sequence of browser actions (without real Playwright — stub for testing).
+        """Execute a sequence of browser actions.
 
-        In production, this delegates to the browser sandbox container.
+        When a dispatcher is provided, actions are dispatched to the sandbox.
+        Otherwise, stub behavior is used for testing/fallback.
 
         Args:
             actions: List of action dicts with 'action' key and action-specific params.
@@ -306,6 +423,12 @@ class BrowserSession:
         """
         self._check_session_timeout()
 
+        if len(actions) > self.MAX_ACTIONS:
+            raise ValueError(
+                f"Too many actions: {len(actions)} exceeds maximum of {self.MAX_ACTIONS}. "
+                "Split into multiple requests."
+            )
+
         results = []
         for action_spec in actions:
             self._check_session_timeout()
@@ -325,6 +448,7 @@ class BrowserSession:
             "actual_cost": self._actual_cost,
             "screenshots_taken": self._screenshot_count,
             "pages_loaded": self._pages_loaded,
+            "pages_cap_reached": self._pages_loaded >= self.MAX_PAGES,
         }
 
     async def _dispatch_action(self, spec: dict) -> dict:
@@ -349,43 +473,130 @@ class BrowserSession:
         else:
             raise ValueError(f"Unknown browser action: {action!r}")
 
+    async def _dispatch_to_sandbox(self, inputs: dict) -> dict:
+        """Dispatch an action to the sandbox and wait for result."""
+        job_id = await self._dispatcher.dispatch(
+            feature_type="connector",
+            execution_mode="browser",
+            tenant_id=self._tenant_id,
+            user_id=self._user_id,
+            inputs=inputs,
+        )
+        return await self._wait_job(job_id)
+
     async def navigate(self, url: str) -> dict:
         """Navigate to URL (SSRF-validated). Returns page title and status."""
+        if self._pages_loaded >= self.MAX_PAGES:
+            raise ValueError(
+                f"Page navigation cap of {self.MAX_PAGES} reached."
+            )
+
         validated_url = self._ssrf_guard.validate_url(url, self._allowed_domains)
+
+        if self._dispatcher is not None:
+            result = await self._dispatch_to_sandbox(
+                {"action": "navigate", "url": validated_url}
+            )
+            self._pages_loaded += 1
+            return result
+
+        # Stub fallback (no dispatcher)
         self._pages_loaded += 1
-        # Stub — real implementation would call sandbox container
         return {"url": validated_url, "title": "", "status": 200}
 
     async def click(self, selector: str) -> dict:
         """Click an element by CSS selector."""
+        if self._dispatcher is not None:
+            return await self._dispatch_to_sandbox(
+                {"action": "click", "selector": selector}
+            )
         return {"selector": selector, "clicked": True}
 
     async def fill(self, selector: str, value: str) -> dict:
         """Fill a form field."""
+        if self._dispatcher is not None:
+            return await self._dispatch_to_sandbox(
+                {"action": "fill", "selector": selector, "value": value}
+            )
         return {"selector": selector, "filled": True}
 
     async def screenshot(self) -> dict:
         """Take screenshot. Returns base64-encoded PNG. Max 5 per session."""
         self._check_screenshot_limit()
         self._screenshot_count += 1
+
+        if self._dispatcher is not None:
+            return await self._dispatch_to_sandbox({"action": "screenshot"})
         return {"screenshot_index": self._screenshot_count, "data": ""}
 
     async def extract_text(self, selector: str | None = None) -> dict:
         """Extract text content. Truncates at MAX_TEXT_LENGTH chars."""
-        text = ""  # Stub
+        if self._dispatcher is not None:
+            result = await self._dispatch_to_sandbox(
+                {"action": "extractText", "selector": selector}
+            )
+            text = result.get("text", "")
+            truncated = self._truncate_text(text)
+            self._check_output_budget(len(truncated.encode()))
+            return {"text": truncated, "selector": selector}
+
+        # Stub fallback
+        text = ""
         truncated = self._truncate_text(text)
         self._check_output_budget(len(truncated.encode()))
         return {"text": truncated, "selector": selector}
 
     async def extract_links(self) -> dict:
         """Extract all links. Max MAX_LINKS returned."""
-        links: list[str] = []  # Stub
+        if self._dispatcher is not None:
+            result = await self._dispatch_to_sandbox({"action": "extractLinks"})
+            links = result.get("links", [])
+            return {"links": links[: self.MAX_LINKS]}
+
+        links: list[str] = []
         return {"links": links[: self.MAX_LINKS]}
 
     async def wait_for_selector(self, selector: str) -> dict:
         """Wait for element to appear (up to ACTION_TIMEOUT)."""
+        if self._dispatcher is not None:
+            return await self._dispatch_to_sandbox(
+                {"action": "waitForSelector", "selector": selector}
+            )
         return {"selector": selector, "found": True}
 
     async def scroll_to(self, position: str) -> dict:
         """Scroll to position ('top', 'bottom', or pixel offset)."""
+        if self._dispatcher is not None:
+            return await self._dispatch_to_sandbox(
+                {"action": "scrollTo", "position": position}
+            )
         return {"position": position}
+
+
+# ── Browser Session Factory ───────────────────────────────────────────────
+
+
+class BrowserSessionFactory:
+    """Creates BrowserSession instances with injected SandboxDispatcher."""
+
+    def __init__(self, db_session: AsyncSession):
+        self._db_session = db_session
+
+    def create(
+        self,
+        user_id: int,
+        tenant_id: str,
+        allowed_domains: list[str],
+        redis_client: Any | None = None,
+    ) -> BrowserSession:
+        """Create a BrowserSession with SandboxDispatcher injected."""
+        from app.services.sandbox_dispatcher import SandboxDispatcher
+
+        dispatcher = SandboxDispatcher(self._db_session)
+        return BrowserSession(
+            user_id=user_id,
+            tenant_id=tenant_id,
+            allowed_domains=allowed_domains,
+            redis_client=redis_client,
+            dispatcher=dispatcher,
+        )
diff --git a/python-backend/tests/test_browser_session_real.py b/python-backend/tests/test_browser_session_real.py
new file mode 100644
index 0000000..5f5ed6a
--- /dev/null
+++ b/python-backend/tests/test_browser_session_real.py
@@ -0,0 +1,314 @@
+"""Tests for BrowserSession real execution wiring and enforcement caps.
+
+Uses pytest with asyncio_mode=auto. Mocks SandboxDispatcher to verify
+correct dispatch calls without requiring actual sandbox infrastructure.
+"""
+
+import asyncio
+import uuid
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+from app.services.tools.browser_tool import (
+    BrowserSession,
+    BrowserSessionFactory,
+    BrowserSSRFGuard,
+    ssrf_route_filter,
+)
+
+
+# ── Helpers ──────────────────────────────────────────────────────────────────
+
+
+def _make_session(
+    dispatcher=None,
+    allowed_domains=None,
+    user_id=1,
+    tenant_id="t1",
+    redis_client=None,
+):
+    """Create a BrowserSession with optional mock dispatcher."""
+    return BrowserSession(
+        user_id=user_id,
+        tenant_id=tenant_id,
+        allowed_domains=allowed_domains or ["example.com"],
+        redis_client=redis_client,
+        dispatcher=dispatcher,
+    )
+
+
+def _mock_dispatcher(result=None):
+    """Create a mock SandboxDispatcher that returns a job_id and result."""
+    dispatcher = AsyncMock()
+    dispatcher.dispatch = AsyncMock(return_value="job-123")
+    return dispatcher
+
+
+# ── Individual action methods ────────────────────────────────────────────────
+
+
+class TestNavigateDispatch:
+    @pytest.mark.asyncio
+    async def test_navigate_calls_dispatcher(self):
+        """_do_navigate calls SandboxDispatcher with correct execution_mode."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        # Mock _wait_job to return a result
+        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "Test", "status": 200})
+
+        result = await session.navigate("https://example.com")
+
+        dispatcher.dispatch.assert_called_once()
+        call_kwargs = dispatcher.dispatch.call_args
+        assert call_kwargs.kwargs["feature_type"] == "connector"
+        assert call_kwargs.kwargs["execution_mode"] == "browser"
+        assert call_kwargs.kwargs["inputs"]["action"] == "navigate"
+        assert result["title"] == "Test"
+
+    @pytest.mark.asyncio
+    async def test_navigate_increments_pages_loaded(self):
+        """navigate() increments _pages_loaded counter."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})
+
+        assert session._pages_loaded == 0
+        await session.navigate("https://example.com")
+        assert session._pages_loaded == 1
+
+    @pytest.mark.asyncio
+    async def test_navigate_validates_ssrf_before_dispatch(self):
+        """navigate() validates URL before dispatching to sandbox."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])
+
+        with pytest.raises(ValueError, match="[Bb]locked|[Pp]rivate"):
+            await session.navigate("http://10.0.0.1/admin")
+
+        dispatcher.dispatch.assert_not_called()
+
+
+class TestClickDispatch:
+    @pytest.mark.asyncio
+    async def test_click_dispatches_action(self):
+        """click dispatches click action and returns result."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        session._wait_job = AsyncMock(return_value={"selector": "#btn", "clicked": True})
+
+        result = await session.click("#btn")
+
+        dispatcher.dispatch.assert_called_once()
+        assert dispatcher.dispatch.call_args.kwargs["inputs"]["action"] == "click"
+        assert result["clicked"] is True
+
+
+class TestFillDispatch:
+    @pytest.mark.asyncio
+    async def test_fill_dispatches_action(self):
+        """fill dispatches fill action and returns result."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        session._wait_job = AsyncMock(return_value={"selector": "#input", "filled": True})
+
+        result = await session.fill("#input", "hello")
+
+        dispatcher.dispatch.assert_called_once()
+        assert dispatcher.dispatch.call_args.kwargs["inputs"]["action"] == "fill"
+        assert result["filled"] is True
+
+
+class TestScreenshotDispatch:
+    @pytest.mark.asyncio
+    async def test_screenshot_returns_base64_and_increments_counter(self):
+        """screenshot returns base64 PNG and increments screenshot counter."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        session._wait_job = AsyncMock(return_value={"screenshot_index": 1, "data": "iVBORw0KGgo..."})
+
+        result = await session.screenshot()
+
+        assert result["data"] == "iVBORw0KGgo..."
+        assert session._screenshot_count == 1
+
+
+class TestExtractTextDispatch:
+    @pytest.mark.asyncio
+    async def test_extract_text_returns_truncated_text(self):
+        """extract_text returns text truncated at MAX_TEXT_LENGTH."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        long_text = "x" * 60_000
+        session._wait_job = AsyncMock(return_value={"text": long_text, "selector": None})
+
+        result = await session.extract_text()
+
+        # Text should be truncated
+        assert len(result["text"]) <= BrowserSession.MAX_TEXT_LENGTH + 100
+
+
+# ── Caps enforcement ─────────────────────────────────────────────────────────
+
+
+class TestMaxActionsCap:
+    @pytest.mark.asyncio
+    async def test_max_actions_50_rejects_upfront(self):
+        """MAX_ACTIONS=50 -> reject upfront when actions[] > 50 (422)."""
+        session = _make_session()
+        actions = [{"action": "click", "selector": f"#btn{i}"} for i in range(51)]
+
+        with pytest.raises(ValueError, match="[Tt]oo many actions|exceeds maximum"):
+            await session.execute_actions(actions)
+
+    @pytest.mark.asyncio
+    async def test_max_actions_exactly_50_allowed(self):
+        """Exactly 50 actions should be allowed."""
+        session = _make_session()
+        session._wait_job = AsyncMock(return_value={"clicked": True})
+        actions = [{"action": "click", "selector": f"#btn{i}"} for i in range(50)]
+
+        # Should not raise - just execute (stubs since no dispatcher)
+        result = await session.execute_actions(actions)
+        assert "results" in result
+
+
+class TestMaxPagesCap:
+    @pytest.mark.asyncio
+    async def test_max_pages_5_aborts_at_runtime(self):
+        """MAX_PAGES=5 -> abort remaining actions at runtime when cap reached."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])
+        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})
+
+        actions = [{"action": "navigate", "url": f"https://example.com/page{i}"} for i in range(7)]
+        result = await session.execute_actions(actions)
+
+        # Should have loaded max 5 pages, then stopped
+        assert result["pages_loaded"] <= BrowserSession.MAX_PAGES
+        # The 6th navigate should have caused a break
+        successful = [r for r in result["results"] if r["success"]]
+        assert len(successful) == BrowserSession.MAX_PAGES
+
+    @pytest.mark.asyncio
+    async def test_max_pages_returns_pages_cap_reached(self):
+        """MAX_PAGES abort returns partial results with pages_cap_reached=true."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher, allowed_domains=["example.com"])
+        session._wait_job = AsyncMock(return_value={"url": "https://example.com", "title": "", "status": 200})
+
+        actions = [{"action": "navigate", "url": f"https://example.com/page{i}"} for i in range(7)]
+        result = await session.execute_actions(actions)
+
+        assert result["pages_cap_reached"] is True
+
+
+class TestMaxScreenshotsCap:
+    @pytest.mark.asyncio
+    async def test_max_screenshots_rejects_at_cap(self):
+        """MAX_SCREENSHOTS=5 -> reject screenshot action when cap reached."""
+        dispatcher = _mock_dispatcher()
+        session = _make_session(dispatcher=dispatcher)
+        session._wait_job = AsyncMock(return_value={"screenshot_index": 1, "data": ""})
+
+        actions = [{"action": "screenshot"} for _ in range(6)]
+        result = await session.execute_actions(actions)
+
+        # 5 should succeed, 6th should fail
+        successful = [r for r in result["results"] if r["success"]]
+        failed = [r for r in result["results"] if not r["success"]]
+        assert len(successful) == 5
+        assert len(failed) == 1
+
+
+# ── SSRF defense (route filter) ──────────────────────────────────────────────
+
+
+class TestSSRFRouteFilter:
+    def test_blocks_private_10_range(self):
+        """page.route handler blocks requests to 10.0.0.0/8."""
+        assert ssrf_route_filter("http://10.0.0.1/path", ["example.com"]) is False
+
+    def test_blocks_metadata_endpoint(self):
+        """page.route handler blocks requests to 169.254.169.254."""
+        assert ssrf_route_filter("http://169.254.169.254/latest/meta-data/", ["example.com"]) is False
+
+    def test_allows_allowlisted_domains(self):
+        """page.route handler allows requests to allowlisted domains."""
+        assert ssrf_route_filter("https://example.com/page", ["example.com"]) is True
+
+    def test_blocks_non_allowlisted_domains(self):
+        """Non-allowlisted domains are blocked."""
+        assert ssrf_route_filter("https://evil.com/page", ["example.com"]) is False
+
+    def test_allows_subdomain_match(self):
+        """Subdomains of allowlisted domains are allowed."""
+        assert ssrf_route_filter("https://sub.example.com/page", ["example.com"]) is True
+
+    def test_blocks_metadata_google_internal(self):
+        """Blocks metadata.google.internal."""
+        assert ssrf_route_filter("http://metadata.google.internal/computeMetadata/", ["example.com"]) is False
+
+    def test_blocks_172_range(self):
+        """Blocks 172.16.0.0/12 range."""
+        assert ssrf_route_filter("http://172.16.0.1/", ["example.com"]) is False
+
+    def test_blocks_192_168_range(self):
+        """Blocks 192.168.0.0/16 range."""
+        assert ssrf_route_filter("http://192.168.1.1/", ["example.com"]) is False
+
+
+# ── BrowserSessionFactory ────────────────────────────────────────────────────
+
+
+class TestBrowserSessionFactory:
+    def test_factory_creates_session_with_dispatcher(self):
+        """factory injects SandboxDispatcher with db_session."""
+        mock_db = MagicMock()
+        factory = BrowserSessionFactory(db_session=mock_db)
+
+        session = factory.create(
+            user_id=1,
+            tenant_id="t1",
+            allowed_domains=["example.com"],
+        )
+
+        assert isinstance(session, BrowserSession)
+        assert session._dispatcher is not None
+
+    def test_factory_session_has_correct_params(self):
+        """Factory-created session has correct user_id, tenant_id, domains."""
+        mock_db = MagicMock()
+        factory = BrowserSessionFactory(db_session=mock_db)
+
+        session = factory.create(
+            user_id=42,
+            tenant_id="tenant-abc",
+            allowed_domains=["test.com"],
+        )
+
+        assert session._user_id == 42
+        assert session._tenant_id == "tenant-abc"
+        assert session._allowed_domains == ["test.com"]
+
+
+# ── Stub fallback (no dispatcher) ────────────────────────────────────────────
+
+
+class TestStubFallback:
+    @pytest.mark.asyncio
+    async def test_no_dispatcher_returns_stub(self):
+        """When no dispatcher provided, action methods return stubs."""
+        session = _make_session(dispatcher=None, allowed_domains=["example.com"])
+
+        result = await session.navigate("https://example.com")
+        assert result["url"] == "https://example.com"
+        assert result["status"] == 200
+
+    @pytest.mark.asyncio
+    async def test_no_dispatcher_click_returns_stub(self):
+        """When no dispatcher, click returns stub."""
+        session = _make_session(dispatcher=None)
+
+        result = await session.click("#btn")
+        assert result["clicked"] is True
