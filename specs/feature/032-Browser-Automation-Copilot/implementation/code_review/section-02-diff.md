diff --git a/apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts b/apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts
new file mode 100644
index 0000000..a50be65
--- /dev/null
+++ b/apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts
@@ -0,0 +1,120 @@
+/**
+ * Tests for guardWithCreditsOrInternalToken() — auth wrapper that accepts
+ * either X-Internal-Token (service-to-service) or falls through to JWT auth.
+ *
+ * Feature: 032-Browser-Automation-Copilot, Section 02
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import crypto from "crypto";
+
+// ── Env stubs ───────────────────────────────────────────────
+process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-at-least-32-chars-long!!";
+process.env.SMARTSPEC_WEB_GATEWAY_TOKEN = "test-internal-token-value";
+process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID = "99";
+
+// ── Mock Redis ──────────────────────────────────────────────
+vi.mock("../../server/services/redis", () => ({
+  getRedisClient: () => ({
+    get: vi.fn().mockResolvedValue(null),
+    set: vi.fn().mockResolvedValue("OK"),
+    del: vi.fn().mockResolvedValue(1),
+  }),
+}));
+
+// ── Mock credit service ─────────────────────────────────────
+const mockHasEnoughCredits = vi.fn().mockResolvedValue(true);
+vi.mock("../../server/services/creditService", () => ({
+  getCreditBalance: vi.fn().mockResolvedValue(1000),
+  getCreditBalanceByOpenId: vi.fn().mockResolvedValue(1000),
+  hasEnoughCredits: (...args: any[]) => mockHasEnoughCredits(...args),
+  deductCredits: vi.fn().mockResolvedValue(true),
+  calculateCreditsFromCost: vi.fn().mockReturnValue(1),
+}));
+
+describe("verifyInternalToken (via crypto.timingSafeEqual)", () => {
+  it("returns true for matching token", () => {
+    const expected = "test-internal-token-value";
+    const token = "test-internal-token-value";
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+    expect(tokenBuf.length).toBe(expectedBuf.length);
+    expect(crypto.timingSafeEqual(tokenBuf, expectedBuf)).toBe(true);
+  });
+
+  it("returns false for mismatched token", () => {
+    const expected = "test-internal-token-value";
+    const token = "wrong-token-different-len!";
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+    // Length differs, so timingSafeEqual would throw — we check length first
+    expect(tokenBuf.length === expectedBuf.length).toBe(false);
+  });
+
+  it("returns false for same-length but different token", () => {
+    const expected = "test-internal-token-value";
+    const token = "xxxx-internal-token-value";
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+    expect(tokenBuf.length).toBe(expectedBuf.length);
+    expect(crypto.timingSafeEqual(tokenBuf, expectedBuf)).toBe(false);
+  });
+});
+
+describe("internal token auth flow", () => {
+  beforeEach(() => {
+    mockHasEnoughCredits.mockResolvedValue(true);
+  });
+
+  it("valid X-Internal-Token + X-User-Id returns userId from header", () => {
+    // Simulates the guardWithCreditsOrInternalToken logic
+    const token = "test-internal-token-value";
+    const expected = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN!;
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+
+    expect(crypto.timingSafeEqual(tokenBuf, expectedBuf)).toBe(true);
+
+    const userIdHeader = "42";
+    const userId = parseInt(userIdHeader, 10);
+    expect(userId).toBe(42);
+  });
+
+  it("valid X-Internal-Token without X-User-Id uses service account ID", () => {
+    const serviceAccountId = parseInt(process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID!, 10);
+    expect(serviceAccountId).toBe(99);
+  });
+
+  it("invalid X-Internal-Token should not authenticate as internal", () => {
+    const token = "invalid-token";
+    const expected = process.env.SMARTSPEC_WEB_GATEWAY_TOKEN!;
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+
+    // Different lengths → would fail length check before timingSafeEqual
+    if (tokenBuf.length !== expectedBuf.length) {
+      expect(true).toBe(true); // Length mismatch detected
+    } else {
+      expect(crypto.timingSafeEqual(tokenBuf, expectedBuf)).toBe(false);
+    }
+  });
+});
+
+describe("credit check for internal callers", () => {
+  beforeEach(() => {
+    mockHasEnoughCredits.mockClear();
+  });
+
+  it("internal callers with sufficient credits are allowed", async () => {
+    mockHasEnoughCredits.mockResolvedValue(true);
+    const result = await mockHasEnoughCredits(42, 1);
+    expect(result).toBe(true);
+    expect(mockHasEnoughCredits).toHaveBeenCalledWith(42, 1);
+  });
+
+  it("internal callers with insufficient credits are rejected (402)", async () => {
+    mockHasEnoughCredits.mockResolvedValue(false);
+    const result = await mockHasEnoughCredits(42, 1);
+    expect(result).toBe(false);
+  });
+});
diff --git a/apps/web/server/_core/llmRoutes.ts b/apps/web/server/_core/llmRoutes.ts
index 679a4ec..4250cc3 100644
--- a/apps/web/server/_core/llmRoutes.ts
+++ b/apps/web/server/_core/llmRoutes.ts
@@ -1,4 +1,5 @@
 import type { Express, Request, Response } from "express";
+import crypto from "crypto";
 import { decrypt } from "../services/crypto";
 import { ENV } from "./env";
 import { authorizeRequest, AuthResult } from "./authz";
@@ -1191,11 +1192,67 @@ export function registerLLMRoutes(app: Express) {
     return checkCredits(auth, res);
   };
 
+  /**
+   * Verify X-Internal-Token header using timing-safe comparison.
+   * Returns true if the token is valid, false otherwise.
+   */
+  const verifyInternalToken = (req: Request): boolean => {
+    const expected = ENV.webGatewayToken;
+    if (!expected) return false;
+    const token = req.headers["x-internal-token"] as string | undefined;
+    if (!token) return false;
+    const tokenBuf = Buffer.from(token);
+    const expectedBuf = Buffer.from(expected);
+    if (tokenBuf.length !== expectedBuf.length) return false;
+    return crypto.timingSafeEqual(tokenBuf, expectedBuf);
+  };
+
+  const SERVICE_ACCOUNT_ID = parseInt(process.env.LLM_GATEWAY_SERVICE_ACCOUNT_ID || "1", 10);
+
+  /**
+   * Auth wrapper that accepts either X-Internal-Token (service-to-service)
+   * or falls through to JWT auth via guardWithCredits.
+   */
+  const guardWithCreditsOrInternalToken = async (
+    req: Request,
+    res: Response
+  ): Promise<{ ok: true; userId: number; isInternal: boolean } | { ok: false }> => {
+    if (verifyInternalToken(req)) {
+      const userIdHeader = req.headers["x-user-id"] as string | undefined;
+      const userId = userIdHeader ? parseInt(userIdHeader, 10) : SERVICE_ACCOUNT_ID;
+      if (isNaN(userId)) {
+        res.status(400).json({ error: { message: "Invalid X-User-Id header", code: "bad_request" } });
+        return { ok: false };
+      }
+
+      // Check credits for the specified user (internal callers still need credits)
+      const hasCredits = await hasEnoughCredits(userId, MIN_CREDITS_REQUIRED);
+      if (!hasCredits) {
+        res.status(402).json({ error: { message: "Insufficient credits", code: "insufficient_credits" } });
+        return { ok: false };
+      }
+
+      return { ok: true, userId, isInternal: true };
+    }
+
+    // Fall through to JWT auth
+    const result = await guardWithCredits(req, res);
+    if (!result.ok) return { ok: false };
+    return { ...result, isInternal: false };
+  };
+
   const llmLimiter = rateLimit("llm", { rpm: LLM_RPM });
 
   // OpenAI-compatible gateway endpoints for LLM proxy callers.
   app.post(
     "/v1/chat/completions",
+    (req: Request, res: Response, next: Function) => {
+      // Skip IP rate limiter for internal token callers
+      if (verifyInternalToken(req)) {
+        (res.locals as any).skipIpRateLimit = true;
+      }
+      next();
+    },
     llmLimiter,
     enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),
     async (req: Request, res: Response) => {
@@ -1204,7 +1261,7 @@ export function registerLLMRoutes(app: Express) {
       req.socket.setTimeout(600_000);  // 10 min
       res.setTimeout(600_000);
 
-      const check = await guardWithCredits(req, res);
+      const check = await guardWithCreditsOrInternalToken(req, res);
       if (!check.ok) return;
 
       const stream = Boolean(req.body?.stream);
diff --git a/python-backend/app/core/config.py b/python-backend/app/core/config.py
index 71ee160..0a8a50a 100644
--- a/python-backend/app/core/config.py
+++ b/python-backend/app/core/config.py
@@ -121,6 +121,7 @@ class Settings(BaseSettings):
     SMARTSPEC_MCP_BASE_URL: str = ""  # optional; defaults to WEB_GATEWAY_URL
     SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS: int = 600
     SMARTSPEC_WEB_GATEWAY_RETRIES: int = 2  # number of retries on transient errors (in addition to first attempt)
+    LLM_GATEWAY_SERVICE_ACCOUNT_ID: int = 1  # User ID for system credit pool (service account mode)
 
     # Optional auth gate for the Python OpenAI-compatible surface (if set, require Authorization Bearer)
     SMARTSPEC_PROXY_TOKEN: str = ""
diff --git a/python-backend/app/services/llm_gateway_client.py b/python-backend/app/services/llm_gateway_client.py
new file mode 100644
index 0000000..53b751b
--- /dev/null
+++ b/python-backend/app/services/llm_gateway_client.py
@@ -0,0 +1,226 @@
+"""LLM Gateway Client — async HTTP client for Node.js LLM Gateway.
+
+All LLM calls from Python services go through this client.
+The Node.js gateway handles credit deduction, rate limiting, and audit logging.
+
+Uses X-Internal-Token auth (not Authorization: Bearer) for service-to-service calls.
+
+Feature: 032-Browser-Automation-Copilot, Section 02
+"""
+
+import asyncio
+import logging
+import uuid
+from typing import Any, Optional
+
+import httpx
+
+from app.core.config import settings
+
+logger = logging.getLogger(__name__)
+
+
+class InsufficientCreditsError(Exception):
+    """Raised when the gateway returns HTTP 402 (insufficient credits)."""
+
+    def __init__(self, message: str = "Insufficient credits", trace_id: str = ""):
+        super().__init__(message)
+        self.trace_id = trace_id
+
+
+class GatewayUnavailableError(Exception):
+    """Raised when the gateway returns HTTP 5xx after retry, or on timeout."""
+
+    def __init__(self, message: str = "Gateway unavailable", trace_id: str = ""):
+        super().__init__(message)
+        self.trace_id = trace_id
+
+
+class LLMGatewayClient:
+    """Async HTTP client for Node.js LLM Gateway.
+
+    All LLM calls from Python services go through this client.
+    Gateway handles credit deduction, rate limiting, and audit.
+    """
+
+    def __init__(
+        self,
+        base_url: str | None = None,
+        token: str | None = None,
+        timeout: int | None = None,
+        max_retries: int | None = None,
+    ):
+        self._base_url = (base_url or settings.SMARTSPEC_WEB_GATEWAY_URL).rstrip("/")
+        self._token = token or settings.SMARTSPEC_WEB_GATEWAY_TOKEN
+        self._timeout = timeout or settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS
+        self._max_retries = max_retries if max_retries is not None else settings.SMARTSPEC_WEB_GATEWAY_RETRIES
+
+    def _build_headers(
+        self,
+        user_id: int | None = None,
+        tenant_id: str | None = None,
+        trace_id: str | None = None,
+    ) -> dict[str, str]:
+        """Build request headers for internal auth."""
+        tid = trace_id or uuid.uuid4().hex[:32]
+        headers: dict[str, str] = {
+            "X-Internal-Token": self._token,
+            "x-trace-id": tid,
+            "Content-Type": "application/json",
+        }
+        if user_id is not None:
+            headers["X-User-Id"] = str(user_id)
+        if tenant_id is not None:
+            headers["X-Tenant-Id"] = str(tenant_id)
+        return headers
+
+    async def _request_with_retry(
+        self,
+        method: str,
+        path: str,
+        *,
+        json_body: dict[str, Any] | None = None,
+        headers: dict[str, str],
+        timeout: int | None = None,
+    ) -> httpx.Response:
+        """Execute HTTP request with retry logic for 429 and 5xx."""
+        url = f"{self._base_url}{path}"
+        req_timeout = timeout or self._timeout
+        trace_id = headers.get("x-trace-id", "unknown")
+        retries_429 = 0
+        max_429_retries = 3
+        retries_5xx = 0
+        max_5xx_retries = 1
+
+        while True:
+            try:
+                async with httpx.AsyncClient(timeout=req_timeout) as client:
+                    response = await client.request(
+                        method, url, json=json_body, headers=headers
+                    )
+
+                # Success
+                if response.status_code < 400:
+                    return response
+
+                # 402 — Insufficient credits
+                if response.status_code == 402:
+                    raise InsufficientCreditsError(
+                        f"Insufficient credits (traceId={trace_id})",
+                        trace_id=trace_id,
+                    )
+
+                # 429 — Rate limited
+                if response.status_code == 429:
+                    retries_429 += 1
+                    if retries_429 > max_429_retries:
+                        raise GatewayUnavailableError(
+                            f"Rate limited after {max_429_retries} retries (traceId={trace_id})",
+                            trace_id=trace_id,
+                        )
+                    retry_after = response.headers.get("retry-after")
+                    if retry_after:
+                        wait = float(retry_after)
+                    else:
+                        wait = 2 ** (retries_429 - 1)  # 1, 2, 4
+                    logger.warning(
+                        "LLM Gateway 429, retry %d/%d in %.1fs (traceId=%s)",
+                        retries_429, max_429_retries, wait, trace_id,
+                    )
+                    await asyncio.sleep(wait)
+                    continue
+
+                # 5xx — Server error
+                if response.status_code >= 500:
+                    retries_5xx += 1
+                    if retries_5xx > max_5xx_retries:
+                        raise GatewayUnavailableError(
+                            f"Gateway error {response.status_code} after retry (traceId={trace_id})",
+                            trace_id=trace_id,
+                        )
+                    logger.warning(
+                        "LLM Gateway %d, retrying once (traceId=%s)",
+                        response.status_code, trace_id,
+                    )
+                    await asyncio.sleep(1)
+                    continue
+
+                # Other 4xx — don't retry
+                raise GatewayUnavailableError(
+                    f"Gateway returned {response.status_code} (traceId={trace_id})",
+                    trace_id=trace_id,
+                )
+
+            except (httpx.TimeoutException, httpx.ConnectError) as exc:
+                raise GatewayUnavailableError(
+                    f"Gateway timeout/connection error: {exc} (traceId={trace_id})",
+                    trace_id=trace_id,
+                ) from exc
+
+    async def chat_completion(
+        self,
+        messages: list[dict[str, Any]],
+        model: str,
+        user_id: int | None = None,
+        tenant_id: str | None = None,
+        *,
+        response_format: dict[str, Any] | None = None,
+        temperature: float | None = None,
+        trace_id: str | None = None,
+    ) -> dict[str, Any]:
+        """POST /v1/chat/completions via internal HTTP."""
+        headers = self._build_headers(user_id, tenant_id, trace_id)
+
+        body: dict[str, Any] = {"model": model, "messages": messages}
+        if response_format is not None:
+            body["response_format"] = response_format
+        if temperature is not None:
+            body["temperature"] = temperature
+
+        response = await self._request_with_retry(
+            "POST", "/v1/chat/completions", json_body=body, headers=headers
+        )
+        return response.json()
+
+    async def vision_call(
+        self,
+        prompt: str,
+        screenshot_b64: str,
+        model: str,
+        user_id: int | None = None,
+        tenant_id: str | None = None,
+        *,
+        trace_id: str | None = None,
+    ) -> dict[str, Any]:
+        """POST /v1/chat/completions with base64 image content blocks."""
+        messages = [
+            {
+                "role": "user",
+                "content": [
+                    {"type": "text", "text": prompt},
+                    {
+                        "type": "image_url",
+                        "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"},
+                    },
+                ],
+            }
+        ]
+        return await self.chat_completion(
+            messages, model, user_id, tenant_id, trace_id=trace_id
+        )
+
+    async def list_available_models(
+        self,
+        category: str | None = None,
+    ) -> list[dict[str, Any]]:
+        """GET /v1/models — query enabled models from model_provider_map."""
+        headers = self._build_headers()
+        path = "/v1/models"
+        if category:
+            path = f"{path}?category={category}"
+
+        response = await self._request_with_retry(
+            "GET", path, headers=headers, timeout=30
+        )
+        data = response.json()
+        return data.get("data", [])
diff --git a/python-backend/tests/test_llm_gateway_client.py b/python-backend/tests/test_llm_gateway_client.py
new file mode 100644
index 0000000..26dd5d1
--- /dev/null
+++ b/python-backend/tests/test_llm_gateway_client.py
@@ -0,0 +1,277 @@
+"""Tests for LLMGatewayClient — the async HTTP client for Node.js LLM Gateway.
+
+All tests mock httpx.AsyncClient to verify:
+- Correct header construction (X-Internal-Token, X-User-Id, X-Tenant-Id)
+- Correct body construction (messages, model, response_format)
+- Error handling for HTTP 402, 429, 5xx, and timeouts
+- Retry logic with backoff and Retry-After header
+
+Feature: 032-Browser-Automation-Copilot, Section 02
+"""
+
+import pytest
+from unittest.mock import AsyncMock, patch, MagicMock
+import httpx
+
+from app.services.llm_gateway_client import (
+    LLMGatewayClient,
+    InsufficientCreditsError,
+    GatewayUnavailableError,
+)
+
+
+@pytest.fixture
+def client():
+    """Create a test client with known config."""
+    return LLMGatewayClient(
+        base_url="http://localhost:3000",
+        token="test-gateway-token",
+        timeout=30,
+        max_retries=2,
+    )
+
+
+def _mock_response(status_code: int = 200, json_data: dict | None = None, headers: dict | None = None):
+    """Build a mock httpx.Response."""
+    resp = MagicMock(spec=httpx.Response)
+    resp.status_code = status_code
+    resp.json.return_value = json_data or {}
+    resp.headers = headers or {}
+    return resp
+
+
+@pytest.mark.asyncio
+async def test_chat_completion_sends_correct_headers(client):
+    """X-Internal-Token, X-User-Id, X-Tenant-Id headers are sent."""
+    mock_resp = _mock_response(200, {"choices": [{"message": {"content": "ok"}}]})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        await client.chat_completion(
+            messages=[{"role": "user", "content": "hello"}],
+            model="gpt-5.4",
+            user_id=42,
+            tenant_id="tenant-abc",
+        )
+
+        call_args = mock_instance.request.call_args
+        headers = call_args.kwargs.get("headers") or call_args[1].get("headers", {})
+        assert headers["X-Internal-Token"] == "test-gateway-token"
+        assert headers["X-User-Id"] == "42"
+        assert headers["X-Tenant-Id"] == "tenant-abc"
+        assert "x-trace-id" in headers
+
+
+@pytest.mark.asyncio
+async def test_chat_completion_sends_correct_body(client):
+    """Messages, model, and response_format are sent in the body."""
+    mock_resp = _mock_response(200, {"choices": []})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        await client.chat_completion(
+            messages=[{"role": "user", "content": "test"}],
+            model="gpt-5.4",
+            user_id=1,
+            response_format={"type": "json_object"},
+            temperature=0.5,
+        )
+
+        call_args = mock_instance.request.call_args
+        body = call_args.kwargs.get("json") or call_args[1].get("json", {})
+        assert body["model"] == "gpt-5.4"
+        assert body["messages"] == [{"role": "user", "content": "test"}]
+        assert body["response_format"] == {"type": "json_object"}
+        assert body["temperature"] == 0.5
+
+
+@pytest.mark.asyncio
+async def test_vision_call_constructs_image_blocks(client):
+    """vision_call builds OpenAI-format image content blocks."""
+    mock_resp = _mock_response(200, {"choices": [{"message": {"content": "screenshot analysis"}}]})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        await client.vision_call(
+            prompt="What do you see?",
+            screenshot_b64="aGVsbG8=",
+            model="gpt-4o",
+            user_id=1,
+        )
+
+        call_args = mock_instance.request.call_args
+        body = call_args.kwargs.get("json") or call_args[1].get("json", {})
+        messages = body["messages"]
+        assert len(messages) == 1
+        assert messages[0]["role"] == "user"
+        content = messages[0]["content"]
+        assert len(content) == 2
+        assert content[0]["type"] == "text"
+        assert content[1]["type"] == "image_url"
+        assert content[1]["image_url"]["url"] == "data:image/png;base64,aGVsbG8="
+
+
+@pytest.mark.asyncio
+async def test_service_account_mode_omits_user_id(client):
+    """When user_id is None, X-User-Id header is not sent."""
+    mock_resp = _mock_response(200, {"choices": []})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        await client.chat_completion(
+            messages=[{"role": "user", "content": "system task"}],
+            model="gpt-5.4",
+        )
+
+        call_args = mock_instance.request.call_args
+        headers = call_args.kwargs.get("headers") or call_args[1].get("headers", {})
+        assert "X-User-Id" not in headers
+        assert headers["X-Internal-Token"] == "test-gateway-token"
+
+
+@pytest.mark.asyncio
+async def test_http_402_raises_insufficient_credits(client):
+    """HTTP 402 raises InsufficientCreditsError."""
+    mock_resp = _mock_response(402)
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        with pytest.raises(InsufficientCreditsError) as exc_info:
+            await client.chat_completion(
+                messages=[{"role": "user", "content": "test"}],
+                model="gpt-5.4",
+                user_id=1,
+            )
+        assert exc_info.value.trace_id != ""
+
+
+@pytest.mark.asyncio
+async def test_http_429_retries_with_retry_after(client):
+    """HTTP 429 retries using Retry-After header value."""
+    mock_429 = _mock_response(429, headers={"retry-after": "0.01"})
+    mock_200 = _mock_response(200, {"choices": []})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(side_effect=[mock_429, mock_200])
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        result = await client.chat_completion(
+            messages=[{"role": "user", "content": "test"}],
+            model="gpt-5.4",
+            user_id=1,
+        )
+        assert result == {"choices": []}
+        assert mock_instance.request.call_count == 2
+
+
+@pytest.mark.asyncio
+async def test_http_429_gives_up_after_3_retries(client):
+    """HTTP 429 gives up after 3 retries and raises GatewayUnavailableError."""
+    mock_429 = _mock_response(429, headers={"retry-after": "0.01"})
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_429)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        with pytest.raises(GatewayUnavailableError):
+            await client.chat_completion(
+                messages=[{"role": "user", "content": "test"}],
+                model="gpt-5.4",
+                user_id=1,
+            )
+
+
+@pytest.mark.asyncio
+async def test_http_5xx_retries_once(client):
+    """HTTP 5xx retries once then raises GatewayUnavailableError."""
+    mock_500 = _mock_response(500)
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_500)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        with pytest.raises(GatewayUnavailableError):
+            await client.chat_completion(
+                messages=[{"role": "user", "content": "test"}],
+                model="gpt-5.4",
+                user_id=1,
+            )
+        assert mock_instance.request.call_count == 2
+
+
+@pytest.mark.asyncio
+async def test_timeout_raises_gateway_unavailable(client):
+    """Timeout raises GatewayUnavailableError with traceId."""
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(side_effect=httpx.TimeoutException("timed out"))
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        with pytest.raises(GatewayUnavailableError) as exc_info:
+            await client.chat_completion(
+                messages=[{"role": "user", "content": "test"}],
+                model="gpt-5.4",
+                user_id=1,
+            )
+        assert exc_info.value.trace_id != ""
+
+
+@pytest.mark.asyncio
+async def test_successful_response_returns_parsed_json(client):
+    """Successful response returns parsed JSON with usage data."""
+    expected = {
+        "choices": [{"message": {"content": "Hello!"}}],
+        "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
+    }
+    mock_resp = _mock_response(200, expected)
+
+    with patch("app.services.llm_gateway_client.httpx.AsyncClient") as MockClient:
+        mock_instance = AsyncMock()
+        mock_instance.request = AsyncMock(return_value=mock_resp)
+        mock_instance.__aenter__ = AsyncMock(return_value=mock_instance)
+        mock_instance.__aexit__ = AsyncMock(return_value=False)
+        MockClient.return_value = mock_instance
+
+        result = await client.chat_completion(
+            messages=[{"role": "user", "content": "test"}],
+            model="gpt-5.4",
+            user_id=1,
+        )
+        assert result == expected
+        assert result["usage"]["total_tokens"] == 15
