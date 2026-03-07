# Section 02: Gateway Client -- Python LLMGatewayClient + Node.js guardWithCreditsOrInternalToken()

## Overview

This section creates the Python-side HTTP client that calls the Node.js LLM gateway, and the Node.js middleware wrapper that authenticates internal (service-to-service) requests. Together they enable the Python backend to make LLM calls through the existing gateway infrastructure, which handles credit deduction, rate limiting, and audit logging.

**Depends on**: Section 01 (DB + Config) -- GPT-5.4 model entry, feature flags, and system settings must exist.

**Blocks**: Section 03 (Responses API), Section 04 (Copilot LLM Calls) -- both consume the gateway client and the internal auth wrapper.

---

## Architecture Context

SmartSpecPro follows a **Single Gateway, Multiple Tools** architecture. The Node.js LLM Gateway (`/v1/chat/completions` and the upcoming `/v1/responses`) is the sole entry point for all LLM calls. All credit deduction, rate limiting, provider routing, and audit logging happen at this gateway. Python services must never call OpenAI directly -- they call the gateway via HTTP.

Currently, `browserTool.ts` already authenticates internal calls via an `X-Internal-Token` header checked with `crypto.timingSafeEqual()` against `ENV.webGatewayToken`. This section extends that same pattern to the LLM gateway routes.

### Existing Infrastructure

The Python backend already has `python-backend/app/clients/web_gateway.py` -- a module with functions like `forward_chat_json()`, `forward_chat_stream()`, and `forward_models()`. These use `Bearer` auth with either user tokens or the gateway token. The new `LLMGatewayClient` class wraps and extends this pattern with:
- An `X-Internal-Token` header (not `Authorization: Bearer`) for internal auth
- Explicit `X-User-Id` and `X-Tenant-Id` headers for credit attribution
- Typed error handling (InsufficientCreditsError, GatewayUnavailableError)
- Retry logic respecting `Retry-After` headers

### Token Auth Design

Two auth modes based on call context:

1. **User pass-through**: For user-initiated flows (automation copilot, browser tool). Client sends `X-Internal-Token` + `X-User-Id` + `X-Tenant-Id`. Gateway deducts credits from the specified user.

2. **Service account**: For background/system tasks. Client sends only `X-Internal-Token`. Gateway uses a pre-configured service account user ID for credit deduction.

The `X-Internal-Token` uses `ENV.webGatewayToken` (env var: `SMARTSPEC_WEB_GATEWAY_TOKEN`). This is the same shared secret used by `browserTool.ts`. The trust boundary is that the Python backend is a co-located trusted service.

---

## Tests First

### Python Tests

**File**: `python-backend/tests/test_llm_gateway_client.py`

```python
"""Tests for LLMGatewayClient — the async HTTP client for Node.js LLM Gateway.

All tests mock httpx.AsyncClient to verify:
- Correct header construction (X-Internal-Token, X-User-Id, X-Tenant-Id)
- Correct body construction (messages, model, response_format)
- Error handling for HTTP 402, 429, 5xx, and timeouts
- Retry logic with backoff and Retry-After header
"""

import pytest

# Test: chat_completion sends correct headers (X-Internal-Token, X-User-Id, X-Tenant-Id)

# Test: chat_completion sends correct body (messages, model, response_format)

# Test: vision_call constructs image content blocks correctly (base64 PNG)

# Test: service account mode omits X-User-Id header, uses default service account

# Test: HTTP 402 raises InsufficientCreditsError

# Test: HTTP 429 retries respecting Retry-After header (mock time)

# Test: HTTP 429 without Retry-After uses exponential backoff

# Test: HTTP 429 gives up after 3 retries

# Test: HTTP 5xx retries once then raises GatewayUnavailableError

# Test: timeout raises GatewayUnavailableError with traceId

# Test: successful response returns parsed JSON with usage data
```

Each test should mock `httpx.AsyncClient` using `pytest`'s monkeypatch or `unittest.mock.AsyncMock`. The `chat_completion` tests verify that headers include `X-Internal-Token` with the configured token value, `X-User-Id` with the passed user ID, and `X-Tenant-Id` with the passed tenant ID. The service account test verifies `X-User-Id` is absent when no user_id is provided. Error tests should assert the correct custom exception type is raised with the `traceId` from the request for log correlation.

### Node.js Tests

**File**: `apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts`

```typescript
/**
 * Tests for guardWithCreditsOrInternalToken() — the auth wrapper that accepts
 * either X-Internal-Token (service-to-service) or falls through to JWT auth.
 *
 * Mock dependencies: ENV.webGatewayToken, authorizeRequest, checkCredits
 */

// Test: valid X-Internal-Token + X-User-Id → returns userId from header

// Test: valid X-Internal-Token without X-User-Id → returns service account userId

// Test: invalid X-Internal-Token → falls through to JWT auth

// Test: no X-Internal-Token → delegates to existing guardWithCredits()

// Test: internal token callers bypass per-IP rate limiter

// Test: internal token callers still respect per-provider rate limits
```

Each test constructs a mock Express `Request` with appropriate headers and verifies the return shape `{ ok: true; userId: number }` or `{ ok: false }`. The "falls through to JWT" test must verify that `authorizeRequest()` is called as a fallback. The rate limiter bypass test verifies the IP-based limiter is skipped but provider-level limits still apply.

---

## Implementation Details

### Part A: Python LLMGatewayClient

**File to create**: `python-backend/app/services/llm_gateway_client.py`

#### Class Structure

```python
class LLMGatewayClient:
    """Async HTTP client for Node.js LLM Gateway.

    All LLM calls from Python services go through this client.
    Gateway handles credit deduction, rate limiting, and audit.
    """

    async def chat_completion(
        self, messages, model, user_id, tenant_id,
        response_format=None, temperature=None
    ) -> dict:
        """POST /v1/chat/completions via internal HTTP."""

    async def vision_call(
        self, messages_with_images, model, user_id, tenant_id
    ) -> dict:
        """POST /v1/chat/completions with base64 image content blocks."""

    async def list_available_models(self, category=None) -> list[dict]:
        """GET /api/internal/models — query enabled models from model_provider_map."""
```

#### Header Construction

For user pass-through mode (when `user_id` is provided):
- `X-Internal-Token`: value of `settings.SMARTSPEC_WEB_GATEWAY_TOKEN`
- `X-User-Id`: string representation of `user_id`
- `X-Tenant-Id`: string representation of `tenant_id`
- `x-trace-id`: UUID for log correlation
- `Content-Type`: `application/json`

For service account mode (when `user_id` is None):
- `X-Internal-Token`: value of `settings.SMARTSPEC_WEB_GATEWAY_TOKEN`
- `x-trace-id`: UUID for log correlation
- `Content-Type`: `application/json`
- No `X-User-Id` header -- the gateway uses `LLM_GATEWAY_SERVICE_ACCOUNT_ID` (default: 1)

#### vision_call Image Block Format

The `vision_call` method constructs OpenAI-format image content blocks:

```python
{
    "role": "user",
    "content": [
        {"type": "text", "text": "...prompt..."},
        {
            "type": "image_url",
            "image_url": {"url": f"data:image/png;base64,{screenshot_b64}"}
        }
    ]
}
```

#### Error Handling

Custom exception classes to define in the same file or a shared exceptions module:

- `InsufficientCreditsError` -- raised on HTTP 402
- `GatewayUnavailableError` -- raised on HTTP 5xx after retry, or on timeout

Retry logic:
- **HTTP 429**: Check for `Retry-After` header. If present, sleep that many seconds. If absent, use exponential backoff starting at 1 second (`1, 2, 4`). Give up after 3 retries total.
- **HTTP 5xx**: Retry once with 1-second delay, then raise `GatewayUnavailableError`.
- **Timeout**: Default 120 seconds for chat completions, 600 seconds for Responses API calls. Raise `GatewayUnavailableError` with the `traceId`.
- All errors include the `traceId` for correlation with the gateway's JSONL audit logs.

#### Configuration

Reads from `python-backend/app/core/config.py` (existing `Settings` class):

| Env Var | Setting | Default | Notes |
|---------|---------|---------|-------|
| `SMARTSPEC_WEB_GATEWAY_URL` | `settings.SMARTSPEC_WEB_GATEWAY_URL` | `""` | Base URL, e.g. `http://localhost:3000` |
| `SMARTSPEC_WEB_GATEWAY_TOKEN` | `settings.SMARTSPEC_WEB_GATEWAY_TOKEN` | `""` | Shared secret |
| `SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS` | `settings.SMARTSPEC_WEB_GATEWAY_TIMEOUT_SECONDS` | `600` | Already exists |
| `SMARTSPEC_WEB_GATEWAY_RETRIES` | `settings.SMARTSPEC_WEB_GATEWAY_RETRIES` | `2` | Already exists |

One new setting to add to `config.py`:

| Env Var | Default | Purpose |
|---------|---------|---------|
| `LLM_GATEWAY_SERVICE_ACCOUNT_ID` | `1` | User ID for system credit pool (service account mode) |

#### Relationship to Existing web_gateway.py

The new `LLMGatewayClient` class does NOT replace `python-backend/app/clients/web_gateway.py`. That module uses `Authorization: Bearer` headers for user-token-based auth and is used by existing code paths (e.g., the Python OpenAI-compatible proxy surface). The new client uses `X-Internal-Token` headers, which is a different auth path recognized by the new `guardWithCreditsOrInternalToken()` on the Node side.

Future work may consolidate these, but for this section they coexist.

---

### Part B: Node.js guardWithCreditsOrInternalToken()

**File to modify**: `apps/web/server/_core/llmRoutes.ts`

#### Function Signature

```typescript
const guardWithCreditsOrInternalToken = async (
  req: Request,
  res: Response
): Promise<{ ok: true; userId: number; isInternal: boolean } | { ok: false }> => {
  // ...
};
```

The `isInternal` flag in the return value lets downstream code know whether this was an internal call (useful for rate limiter bypass decisions).

#### Logic Flow

1. Check for `X-Internal-Token` header on the request.
2. If present:
   a. Compare against `ENV.webGatewayToken` using `crypto.timingSafeEqual()` (with length pre-check to avoid throwing). If the token or the expected value is empty, fail.
   b. If valid: extract `userId` from `X-User-Id` header (parse as integer). If absent or invalid, use a configured service account ID (e.g., `1` or from env `LLM_GATEWAY_SERVICE_ACCOUNT_ID`).
   c. Extract `tenantId` from `X-Tenant-Id` header if needed downstream.
   d. Return `{ ok: true, userId, isInternal: true }`.
   e. If invalid token: fall through to step 3 (do NOT return 401 immediately -- the request might have a valid JWT).
3. If no internal token (or invalid token): delegate to existing `guardWithCredits(req, res)` and augment its result with `isInternal: false`.

#### Rate Limiter Bypass

Internal token callers should bypass the per-IP rate limiter (`llmLimiter`) but still respect per-provider rate limits. Implementation approach:

- The `/v1/chat/completions` route currently applies `llmLimiter` as middleware. To bypass for internal calls, either:
  - Check for a valid `X-Internal-Token` inside the limiter middleware and skip if valid, OR
  - Add a flag to `req` (e.g., `req.isInternalCall = true`) set by a preceding middleware, and have the limiter check it.

The simpler approach is to add a small middleware before `llmLimiter` that sets `res.locals.skipIpRateLimit = true` when a valid internal token is present, and modify the `rateLimit()` wrapper to check this flag.

Per-provider rate limits (handled inside `proxyChatWithCredits`) remain enforced for all callers to prevent cascading failures.

#### Where to Apply

Replace `guardWithCredits` with `guardWithCreditsOrInternalToken` on these routes:
- `POST /v1/chat/completions` -- the primary endpoint Python calls
- The upcoming `POST /v1/responses` route (Section 03)

Do NOT change other routes (`/api/llm/chat`, `/api/llm/stream`, `/api/llm/brainstorm`, etc.) -- those are client-facing and should continue using JWT-only auth via `guardWithCredits`.

#### Rollback

`guardWithCreditsOrInternalToken()` is a separate wrapper. Removing it and reverting to `guardWithCredits()` on the `/v1/chat/completions` route restores the original auth path. This does NOT affect existing endpoints.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/llm_gateway_client.py` | **Create** | `LLMGatewayClient` class with `chat_completion()`, `vision_call()`, `list_available_models()` |
| `python-backend/app/core/config.py` | **Modify** | Add `LLM_GATEWAY_SERVICE_ACCOUNT_ID: int = 1` setting |
| `python-backend/tests/test_llm_gateway_client.py` | **Create** | 11 test cases covering headers, body, errors, retries |
| `apps/web/server/_core/llmRoutes.ts` | **Modify** | Add `guardWithCreditsOrInternalToken()` wrapper, apply to `/v1/chat/completions` |
| `apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts` | **Create** | 6 test cases covering internal token auth, fallback, rate limiting |

---

## Verification Checklist

1. All 11 Python tests pass: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest tests/test_llm_gateway_client.py -v`
2. All 6 Node.js tests pass: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm vitest run server/__tests__/guardWithCreditsOrInternalToken.test.ts`
3. TypeScript check passes: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm check`
4. Python lint passes: `cd /home/dev/projects/SmartSpecPro/python-backend && ruff check app/services/llm_gateway_client.py`
5. Existing tests unaffected: all Feature 031 tests still pass
6. The existing `browserTool.ts` `X-Internal-Token` pattern continues working (shares the same `ENV.webGatewayToken`)