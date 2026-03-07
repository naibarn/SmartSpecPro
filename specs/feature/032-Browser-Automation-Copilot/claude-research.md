# Feature 032 — Codebase Research Report

## 1. LLM Gateway (Node.js)

### File: `apps/web/server/_core/llmRoutes.ts`

**Endpoint**: `POST /v1/chat/completions` — main LLM proxy

**Credit Flow**:
1. `guardWithCredits()` — checks user balance before routing
2. Provider call with streaming or JSON
3. `deductCreditsForUsage()` — post-request, deducts actual tokens spent
4. Atomic SQL: `UPDATE users SET credits = credits - amount WHERE credits >= amount`

**API URL Resolution** (`resolveApiUrl()`, line 483+):
```typescript
function resolveApiUrl(baseUrl, modelId, providerName, apiStyle?: ApiStyle): string
```
- Provider-specific routing based on `apiStyle` column from DB:
  - `'responses'` -> `/v1/responses`
  - `'messages'` -> `/v1/messages`
  - `'gemini'` -> `/v1/models/{modelId}`
  - `'chat-completions'` (default) -> `/v1/chat/completions`
- **Key**: The `'responses'` case already exists in `resolveApiUrl()` — can be reused

**SSE Streaming** (`proxyChatWithCredits()`):
- Buffers token counts from OpenAI-compatible `usage` object
- Credits deducted on `stream_end` event
- Pattern can be adapted for Responses API streaming

**Auth Mechanisms**:
- JWT via `jose` library (session cookies)
- `X-Internal-Token` header for service-to-service calls
- All provider API keys stored encrypted in DB

### File: `apps/web/server/services/creditService.ts`

**Exchange Rate**: 1 credit = $0.001 USD
- `calculateCreditsFromCost(costUsd)` = `costUsd * 1000`, minimum 1 credit

**Cost Sources** (priority):
1. Provider-reported cost (from `usage.completion_tokens_details`)
2. Dynamic pricing from `modelProviderMap` table (`pricingInput`/`pricingOutput` per 1M tokens)
3. Hardcoded fallback: `MODEL_PRICING` dict

---

## 2. Browser Tool (Node.js + Python)

### Node.js: `apps/web/server/routes/browserTool.ts`

**Endpoint**: `POST /api/internal/tools/browser`

**Credit Pre-reservation**:
```typescript
const BROWSER_RESERVE_CREDITS = 20; // Line 29
```

**Flow**:
1. Verify `X-Internal-Token` (timing-safe comparison against `ENV.webGatewayToken`)
2. Validate `userId`, `tenantId`, `actions[]`
3. Feature flag: `getTenantFeatureFlag("browserAutomation", tenantId)`
4. Concurrency limits (Redis semaphore):
   - Per-user: 1 session max (SET NX EX 310s)
   - Per-tenant: 2 sessions max (INCR + EXPIRE)
5. Credit pre-check: `hasEnoughCredits(userId, 20)`
6. Pre-reserve 20 credits: `deductCredits({ sourceType: "browser_automation", amount: 20 })`
7. Forward to Python: `POST http://127.0.0.1:8000/api/browser/execute`
8. On success: refund `20 - actualCost`
9. On failure: full refund of 20
10. Finally: release semaphores

**Concurrency semaphore keys**:
- `browser:sem:user:{userId}` (NX)
- `browser:sem:tenant:{tenantId}` (INCR + EXPIRE)
- TTL: 310 seconds

### Python: `python-backend/app/services/tools/browser_tool.py`

**SSRF Protection** (3-layer):
1. URL validation: blocked networks (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.169.254)
2. DNS resolution check (catches rebinding)
3. Container network isolation

**BrowserSession class** (line 232+):
- Timeouts: `ACTION_TIMEOUT=60s`, `SESSION_TIMEOUT=300s`
- Caps: `MAX_TEXT_LENGTH=50000`, `MAX_SCREENSHOTS=5`, `MAX_SCREENSHOT_SIZE=1MB`, `MAX_TOTAL_OUTPUT=200KB`, `MAX_LINKS=200`
- **Missing caps**: `MAX_ACTIONS` and `MAX_PAGES` — must be added
- Actions: navigate, click, fill, screenshot, extractText, extractLinks, waitForSelector, scrollTo
- **Stub**: `execute_actions()` needs real OpenSandbox dispatch

**ConcurrencyGuard** (line 163+):
- Per-user: 1 session, per-tenant: 2 sessions (Redis-backed)
- TTL: 310 seconds
- Raises `BrowserCapacityError`

### Python: `python-backend/app/services/sandbox_dispatcher.py`

**Dispatch flow**:
- `dispatch(feature_type, execution_mode, tenant_id, user_id, inputs)` -> job_id
- `SandboxExecutionMode.BROWSER` already exists
- Creates Celery task with manifest JSON

### Python: `python-backend/app/services/sandbox_profiles.py`

**Profile mapping**: `FEATURE_PROFILE_MAP` dict maps `"{feature_type}-{execution_mode}-default"` to profile IDs
- Need to add: `"connector-browser-default"` entry

---

## 3. Automation Copilot (Python)

### `python-backend/app/services/automation_copilot.py`

**Pipeline**:
```python
class AutomationCopilot:
    async def analyze(prompt, tenant_id, user_id) -> AutomationBuildResult
    async def build(intent, execution_id, ...) -> built scripts
    async def execute_scripts(execution_id, ...) -> results
```

**Intent types**: `browser_rpa`, `workflow`, `agency`, `hybrid`
**Status pipeline**: `needs_clarification` -> `preview_ready` -> `ready` -> `executing` -> `success`/`failed`

**NotImplementedError at line 130**: `_analyze_intent()` — needs LLM call to parse user prompt into `AutomationIntent`

### `python-backend/app/services/playwright_script_generator.py`

**Flow**:
1. SSRF validation -> cache check -> browser session
2. Navigate + inject overlay JS (numbered labels on interactive elements)
3. Screenshot capture + base64 encode
4. **NotImplementedError at line 231**: `_vision_llm_call()` — needs vision LLM to identify elements
5. Filter by confidence >= 0.7 (`CONFIDENCE_THRESHOLD`)
6. Build action strategies (ARIA > text > data-testid > CSS)
7. Validate selectors in live DOM
8. Cache and return `PlaywrightScript`

**Models**:
- `PlaywrightScript(url, goal, actions: list[PlaywrightAction])`
- `PlaywrightAction(action_type, selector_css, selector_strategies, description, confidence, value?)`
- `IdentifiedElement(element_index, action_type, value?, confidence)`

### `python-backend/app/services/self_healing_executor.py`

**Flow**:
1. Execute script action by action
2. On failure: `_diagnose_failure()` (line 185) -> up to 3 heal attempts
3. On success: cache successful pattern
4. Cancellation: check Redis `automation:{execution_id}:cancel`

**Stub at line 185**: Returns `FailureDiagnosis(confidence=0.0)` — effectively disables self-healing

### `python-backend/app/orchestrator/node_executors/web_automation_executor.py`

**Line 40**: `raise NotImplementedError("pending full pipeline implementation")`
- Needs to instantiate `AutomationCopilot` and run analyze -> build -> execute

---

## 4. Internal MCP + Agency Integration

### `python-backend/app/api/internal_mcp.py`

**Endpoints**:
- `GET /api/internal/mcp/tools` — list tools
- `POST /api/internal/mcp/tools/call` — execute tool

**Auth**: `X-Proxy-Token` (constant-time comparison)

**Tool registration**: `TOOL_HANDLERS` dict (currently: Google Drive + OneDrive handlers)
- Need to add: `browser.execute_actions` and `sandbox.exec_command`

### `python-backend/app/services/agency_orchestrator.py`

**Graph walker**: Routes by node type (agent, supervisor, router, aggregator, knowledge_base, skill_call, human_approval)
- `web_automation` node type would call `WebAutomationExecutor`

**Execution context**: `input`, `user_token`, `tenant_id`, `user_id`, `results` dict, `knowledge` list

---

## 5. Auth Patterns for Internal Calls

**Token env vars**:
- `SMARTSPEC_WEB_GATEWAY_TOKEN` / `WEB_GATEWAY_TOKEN` -> `ENV.webGatewayToken`
- `SMARTSPEC_PROXY_TOKEN` -> used in Python MCP verification

**Header patterns**:
- Node -> Python: `X-Internal-Token: ENV.webGatewayToken`
- Python -> Node (new for LLMGatewayClient): Need `X-Internal-Token` check in `guardWithCredits()`

**Key decision**: For Python -> Node LLM gateway calls, need to:
1. Add `X-Internal-Token` check in gateway's auth middleware
2. Use service account userId for credit deduction
3. Or create dedicated internal auth bypass for metered service calls

---

## 6. Feature Flags & System Settings

### Feature Flags (`apps/web/server/services/featureFlags.ts`)

**API**:
- `getFeatureFlag(flagName)` — global (Redis `feature-flag:{flagName}`)
- `getTenantFeatureFlag(flagName, tenantId)` — tenant override
- Fallback: `process.env[flagName]`

**Browser automation flag**: `"browserAutomation"` (checked in `browserTool.ts` line 125)

### System Settings (`drizzle/schema.ts`)

```typescript
systemSettings = pgTable("system_settings", {
  id, category, key, value, isSensitive, createdAt, updatedAt
})
```
- Key pattern for per-tenant: `{key}_{tenantId}`
- `isSensitive: true` auto-encrypts value
- Cached 5 minutes for credit pricing

---

## 7. Cost Tracking & Audit

### Audit Logger (`apps/web/server/services/auditLogger.ts`)

**JSONL format**: `logs/audit/audit-YYYY-MM-DD.jsonl`
```json
{
  "traceId": "nanoid-21",
  "eventType": "llm_request|llm_response|...",
  "userId": 123,
  "model": "gpt-4o",
  "inputTokens": 500,
  "outputTokens": 200,
  "costUsd": 0.0035,
  "creditsCharged": 4,
  "costCalculationMethod": "provider_reported|model_lookup|default_rate"
}
```
- Sanitization: strips auth headers, truncates messages
- Buffer: flush every 500ms or 50 entries
- Retention: 30 days

### Provider Usage Log (`drizzle/schema.ts`)

```typescript
providerUsageLog = pgTable("provider_usage_log", {
  id, userId, providerId, modelUsed, inputTokens, outputTokens,
  costUsd (varchar for precision), creditsCharged, responseTimeMs,
  statusCode, errorType, wasFallback, traceId, createdAt
})
```

### Cost Tracker (`costTracker.ts`)

**Priority**: provider-reported > DB lookup (modelProviderMap) > hardcoded fallback

---

## 8. Testing Setup

### TypeScript (Vitest)

- Mock pattern: `vi.mock("../../services/creditService", ...)`
- Test location: `apps/web/server/routers/__tests__/`
- Patterns: mock external dependencies, verify Zod validation, check credit flows

### Python (pytest)

- Markers: `@pytest.mark.unit`, `@pytest.mark.integration`, `@pytest.mark.asyncio`
- Async: `asyncio_mode = auto` in `pyproject.toml`
- Coverage: 80% minimum enforced
- Test files: `python-backend/tests/test_*.py`

---

## 9. Key Architectural Decisions for Feature 032

1. **All LLM calls via Node gateway**: Python must call Node `/v1/chat/completions` via `LLMGatewayClient` — never call OpenAI directly
2. **Responses API reuses gateway infra**: Same credit/rate-limit/audit as chat completions
3. **`resolveApiUrl()` already has `'responses'` case**: Minimal gateway changes needed
4. **Browser execution in OpenSandbox**: Reuse `SandboxDispatcher` with `execution_mode="browser"`
5. **Credit coordination**: Browser tool pre-reserves 20 credits, automation copilot reserves 100 — need coordination to avoid double-deduction
6. **Internal auth for Python->Node**: Add `X-Internal-Token` check to LLM gateway endpoint
