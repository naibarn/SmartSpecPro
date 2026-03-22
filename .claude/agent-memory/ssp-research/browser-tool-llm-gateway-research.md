# Browser Tool & LLM Gateway Research

## 1. LLM Gateway (apps/web/server/_core/llmRoutes.ts)

### Endpoints Implemented
- **POST /v1/chat/completions** — OpenAI-compatible chat endpoint with streaming (SSE)
- **POST /api/chat/save-assistant** — REST endpoint to save assistant messages after streaming completes (no rate limiter)
- **Brainstorm routes** — Multi-round debate streaming (lines 1780+)

### Current State
- **Line 498**: `/v1/responses` endpoint mentioned but NOT as a separate route
  - This is computed URL for OpenCode Zen provider (apiStyle=responses case)
  - Routed to external API, not a Node.js endpoint
- **No dedicated `/v1/responses` endpoint exists** in the LLM gateway

### Credit/Rate-Limit Infrastructure
- **Provider rate limiter**: `getProviderLimiter()` (line 29+)
  - Bottleneck with Redis distributed limiting (or in-memory fallback)
  - Per-provider concurrency control
  - Slot acquisition before request (line 79)
- **Credit deduction flow**:
  - Pre-check: `hasEnoughCredits(userId)` (line 152)
  - Deduct: `deductCredits()` (line 162, 1076)
  - Usage tracking: `logCostRequest()` (line 20)
  - For streaming: tokens extracted from final SSE chunk (lines 1049-1073, 1966-1978)

### Provider Resolution
- **Function**: `resolveProviderEndpoint(providerName, modelId, base, apiStyle)`
- **Provider routing** (lines 490-527):
  - **OpenCode Zen**: Routes to `/responses` or `/messages` or `chat/completions` or Gemini based on apiStyle
  - **Anthropic**: Routes to `/messages` (native API)
  - **Google**: Routes to `/models/{modelId}:generateContent`
  - **All others**: Routes to `/chat/completions` (OpenAI-compatible)

### Streaming (SSE) Handling
- **Setup**: Lines 1851-1854 (status 200, Content-Type: text/event-stream)
- **Data parsing**: Lines 1015-1017 (SSE data: lines)
- **Usage extraction**: Lines 1049-1073 (parse usage from final SSE chunk)
- **Credit deduction**: After stream completes (line 1075)
- **Message saving**: After streaming + credit deduction (lines 2012+)

### NotImplementedError Locations
- None found. No `/v1/responses` endpoint handler exists (intentional — external API routing only).

---

## 2. Browser Tool Route (apps/web/server/routes/browserTool.ts)

### Request/Response Schema
**Request** (line 103-109):
```typescript
{
  userId: number (required)
  tenantId: string (required)
  actions: Array<dict> (required, non-empty)
  allowedDomains: string[] (optional, default [])
  timeout: number (optional, default 300, max 300s)
}
```

**Response** (lines 209-215):
```typescript
{
  session_id: string
  results: Array<{action, success, data|error}>
  actual_cost: number (credits)
  screenshots_taken: number
  pages_loaded: number
}
```

### Credit Reservation/Refund Flow
1. **Pre-reserve**: `deductCredits({ sourceType: 'browser_automation', amount: 20 })` (line 162)
2. **On success**: Clamp actual_cost to [0, 20], refund excess (lines 218-226)
3. **On Python error**: Full refund (line 194)
4. **On Node error**: Full refund (line 231)

### Concurrency Control (Redis Semaphore)
- **Per-user**: SET NX EX (1 session max) — key: `browser:sem:user:{userId}` (line 54)
- **Per-tenant**: INCR + EXPIRE (2 sessions max) — key: `browser:sem:tenant:{tenantId}` (line 61-73)
- **TTL**: 310 seconds (USER_SEM_TTL, line 44)

### Python Backend Call
- **URL**: `POST ${ENV.pythonBackendUrl}/api/browser/execute` (line 172)
- **Timeout**: `(timeout + 10) * 1000` ms (line 186)
- **Headers**: `X-Internal-Token: ENV.webGatewayToken` (line 176)
- **Body**: snake_case conversion (session_id, allowed_domains, user_id, tenant_id)

---

## 3. Python Browser API (python-backend/app/api/browser.py)

### Endpoint
- **POST /api/browser/execute** (line 76)
- **Dependencies**: `_verify_internal_token` (FastAPI dependency, line 79)
- **Auth**: Checks `X-Internal-Token` OR `X-Proxy-Token` header against `SMARTSPEC_PROXY_TOKEN` or `SMARTSPEC_WEB_GATEWAY_TOKEN` (lines 30-46)

### Request/Response Models
**Request** (lines 52-60):
```python
class BrowserActionRequest(BaseModel):
    session_id: Optional[str] = None
    actions: list[dict]
    allowed_domains: list[str] = []
    timeout: int (10-300, default 300)
    user_id: int
    tenant_id: str
```

**Response** (lines 63-70):
```python
class BrowserActionResponse(BaseModel):
    session_id: str
    results: list[dict]
    actual_cost: int
    screenshots_taken: int
    pages_loaded: int
```

### BrowserSession Usage
- **Created**: Line 98 (user_id, tenant_id, allowed_domains passed)
- **Called**: `await session.execute_actions(req.actions)` (line 105)
- **Error handling**: ValueError (422) or generic Exception (500)

---

## 4. Python BrowserSession (python-backend/app/services/tools/browser_tool.py)

### Current Implementation State
- **STUB** — All methods return mock data without real Playwright execution
- **Line 297**: `async def execute_actions()` — processes action specs in a loop
- **Lines 333-350**: `_dispatch_action()` — routes action type to method handler

### SSRF Guards (3-Layer Protection)
1. **Layer 1 — URL validation** (`validate_url`, lines 61-117):
   - Checks scheme (http/https only)
   - Checks blocked hosts (localhost, 127.0.0.1, metadata.google.internal, etc.)
   - Checks private/reserved IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, ::1/128, fc00::/7, fe80::/10)
   - Whitelist check: hostname must match `allowed_domains` (exact or subdomain)

2. **Layer 2 — DNS rebinding check** (`validate_url_dns`, lines 119-157):
   - Resolves hostname via `socket.getaddrinfo()`
   - Verifies all IPs are not in BLOCKED_NETWORKS
   - Raises ValueError if DNS resolves to private IP

3. **Layer 3 — Container network isolation** (implicit):
   - Python backend runs in isolated Docker container
   - Private networks blocked at OS/Docker level

### Action Handlers (Stub Implementations)
- `navigate(url)` — Lines 352-357 — increments page counter, validates URL, returns {url, title, status}
- `click(selector)` — Lines 359-361 — returns {selector, clicked: true}
- `fill(selector, value)` — Lines 363-365 — returns {selector, filled: true}
- `screenshot()` — Lines 367-371 — increments counter, checks MAX_SCREENSHOTS (5), returns {index, data: ""}
- `extract_text(selector?)` — Lines 373-378 — truncates at MAX_TEXT_LENGTH (50k), checks output budget
- `extract_links()` — Lines 380-383 — stub, returns {links: []} capped at MAX_LINKS (200)
- `wait_for_selector(selector)` — Lines 385-387 — stub, returns {selector, found: true}
- `scroll_to(position)` — Lines 389-391 — stub, returns {position}

### Output/Resource Caps
- **MAX_TEXT_LENGTH**: 50,000 chars
- **MAX_HTML_LENGTH**: 100,000 chars
- **MAX_LINKS**: 200 links per extract_links()
- **MAX_SCREENSHOTS**: 5 per session
- **MAX_SCREENSHOT_SIZE**: 1,048,576 bytes (1 MB)
- **MAX_OUTPUT_SIZE**: 204,800 bytes (200 KB) total
- **ACTION_TIMEOUT**: 60 seconds per action
- **SESSION_TIMEOUT**: 300 seconds total

### Concurrency (Python Side)
- **ConcurrencyGuard class** (lines 163-227)
- **Per-user**: 1 concurrent session max (SET NX)
- **Per-tenant**: 2 concurrent sessions max (INCR + check)
- **TTL**: 310 seconds
- **Status**: Not currently used — pre-reserved by Node.js (browserTool.ts line 141)

### NotImplementedError Locations
- **None found explicitly** — all methods are stubs but don't raise NotImplementedError
- **Real Playwright integration missing**: All action handlers return mock data (empty screenshots, no real DOM interaction)

---

## 5. OpenSandbox / Sandbox Dispatcher

### Files Found
- `python-backend/app/orchestrator/sandbox.py` — Path security helpers (is_within, is_path_allowed, sanitize_env)
- `python-backend/app/services/sandbox_dispatcher.py` — Job dispatch logic

### Dispatcher Architecture (SandboxDispatcher class, python-backend/app/services/sandbox_dispatcher.py)
1. **dispatch()** method (lines 42-118):
   - Checks if sandbox is enabled (opensandbox_settings.is_enabled)
   - Resolves profile from feature_type or override
   - Enforces tenant policy (max concurrent, daily runtime limits)
   - Creates job record (SandboxJob) in DB
   - Dispatches Celery task via `_dispatch_celery_task(job_id)`
   - Emits audit event

2. **_enforce_policy()** (lines 126-150):
   - Loads TenantSandboxPolicy from DB
   - Checks max_concurrent_sandboxes limit
   - Checks max_daily_runtime_seconds limit
   - Raises PolicyDeniedError if exceeded

3. **Supported Feature Types** (via SandboxProfileService):
   - Feature profiles mapped to execution modes
   - FEATURE_PROFILE_MAP (re-exported from sandbox_profiles.py)
   - Profile resolves to slug and execution metadata

### Execution Modes (from code structure)
- Not explicitly listed in first 150 lines
- Inferred: Celery task dispatch based on profile
- Different profiles may use different execution contexts

### Policy Enforcement
- **Max concurrent sandboxes**: Per-tenant limit (TenantSandboxPolicy.max_concurrent_sandboxes)
- **Daily runtime**: Per-tenant max_daily_runtime_seconds
- **Fallback**: If sandbox disabled or no profile, returns None (legacy fallback)

### NotImplementedError Locations
- `_sum_daily_runtime()` call (line 148) — not shown in excerpt, likely tracks CPU time
- `_count_active_jobs()` call (line 140) — queries SandboxJob.status != terminal

---

## Summary Table

| Component | State | Key File | Key Functions |
|-----------|-------|----------|----------------|
| LLM Gateway | Implemented | `llmRoutes.ts` | `resolveProviderEndpoint()`, `proxyChatWithCredits()`, SSE streaming |
| `/v1/responses` | Referenced (not endpoint) | `llmRoutes.ts:498` | Route computation for OpenCode Zen only |
| Browser Tool (Node) | Implemented | `browserTool.ts` | Credit reservation, concurrency semaphore, Python delegation |
| Browser Tool (Python) | STUB | `browser_tool.py` | All action handlers return mock data, SSRF guards fully implemented |
| Sandbox Dispatcher | Implemented | `sandbox_dispatcher.py` | Policy enforcement, Celery dispatch, job lifecycle |
| OpenSandbox | Partial | `sandbox.py` + `sandbox_dispatcher.py` | Path validation, feature profiles, execution modes not detailed |

