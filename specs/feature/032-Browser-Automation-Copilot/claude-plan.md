# Feature 032: Browser Automation Copilot — Implementation Plan

## Overview

This plan upgrades SmartSpecPro's Browser Automation Copilot and LLM Gateway to support GPT-5.4 via the OpenAI Responses API, enabling live web research, real browser control, and LLM-powered automation intelligence. The feature activates existing stubs and extends the gateway — it does not create a new system.

### Project Context

SmartSpecPro is an AI-driven specification and media generation platform. It has a Node.js web app (React + Express + tRPC), a Python FastAPI backend, PostgreSQL + Redis infrastructure, and a Celery task queue. Feature 031 built the automation copilot pipeline skeleton with Playwright integration, but left 4 critical LLM call sites as `NotImplementedError` stubs. This feature fills those gaps and adds the Responses API proxy.

### Architecture Principle

**Single Gateway, Multiple Tools**: The Node.js LLM Gateway (`/v1/chat/completions` and now `/v1/responses`) is the sole entry point for all LLM calls. All credit deduction, rate limiting, provider routing, and audit logging happen at this gateway. Python services call the gateway via HTTP — never calling OpenAI directly.

---

## Section 1: LLMGatewayClient (Python HTTP Client)

### Rationale

Three `NotImplementedError` stubs and one `confidence=0.0` stub in the Python backend need real LLM calls. Rather than each calling OpenAI directly (which would bypass credits/audit), they call the existing Node.js gateway via a shared HTTP client. This is a prerequisite for all subsequent sections.

### What to Build

Create `python-backend/app/services/llm_gateway_client.py` — an async HTTP client that calls the Node.js LLM gateway endpoints.

**Class: `LLMGatewayClient`**

```python
class LLMGatewayClient:
    """Async HTTP client for Node.js LLM Gateway.

    All LLM calls from Python services go through this client.
    Gateway handles credit deduction, rate limiting, and audit.
    """

    async def chat_completion(self, messages, model, user_id, tenant_id,
                               response_format=None, temperature=None) -> dict:
        """POST /v1/chat/completions via internal HTTP."""

    async def vision_call(self, messages_with_images, model, user_id, tenant_id) -> dict:
        """POST /v1/chat/completions with base64 image content blocks."""

    async def list_available_models(self, category=None) -> list[dict]:
        """GET /api/internal/models — query enabled models from model_provider_map."""
```

### Auth Design (Hybrid Credit Attribution)

Two auth modes based on the call context:

1. **User pass-through**: For user-initiated flows (automation copilot, browser tool), the client sends `X-Internal-Token` header plus `X-User-Id` and `X-Tenant-Id` headers. The gateway deducts credits from the specified user.

2. **Service account**: For background/system tasks, the client sends only `X-Internal-Token`. The gateway uses a pre-configured service account for credit deduction.

**Token choice**: Uses `X-Internal-Token` with `SMARTSPEC_WEB_GATEWAY_TOKEN` — the same token scheme used by `browserTool.ts`. The Python service has access to this token via environment variable. (Note: `internal_mcp.py` uses `X-Proxy-Token` / `SMARTSPEC_PROXY_TOKEN` — a different token for MCP-specific calls. These remain separate.)

**Trust boundary**: The Python backend runs on the same host as Node.js and is a trusted service. The `X-Internal-Token` is a shared secret between co-located services. The gateway trusts that the Python service passes the correct `userId` — this is the same trust model used by `browserTool.ts` today.

### Gateway Modification Required

Implement internal token auth as a **separate middleware wrapper** around `guardWithCredits()` (not modifying `guardWithCredits()` directly) so it can be disabled independently for rollback safety:

**New function: `guardWithCreditsOrInternalToken()`**:
- Check for `X-Internal-Token` header first (timing-safe comparison against `ENV.webGatewayToken`)
- If valid internal token: extract `userId` from `X-User-Id` header, `tenantId` from `X-Tenant-Id` header
- If no `X-User-Id`: fall back to service account `userId` from config
- If no internal token: delegate to existing `guardWithCredits()` (JWT path)
- All existing credit/rate-limit logic applies unchanged
- Internal calls bypass per-IP rate limiter but respect per-provider rate limits (to avoid cascading failures)

### Configuration

```python
# Environment variables
SMARTSPEC_WEB_URL = "http://localhost:3000"     # Node.js gateway URL
SMARTSPEC_WEB_GATEWAY_TOKEN = "..."              # Internal auth token (existing)
LLM_GATEWAY_SERVICE_ACCOUNT_ID = 1               # User ID for system credit pool
```

### Error Handling

- HTTP 402 (insufficient credits) → raise `InsufficientCreditsError`
- HTTP 429 (rate limited) → respect `Retry-After` header if present, otherwise exponential backoff (max 3 attempts)
- HTTP 5xx → retry once, then raise `GatewayUnavailableError`
- Timeout: 120 seconds default, 600 seconds for Responses API calls
- All errors include `traceId` for correlation with gateway audit logs

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/llm_gateway_client.py` | Create | HTTP client class |
| `apps/web/server/_core/llmRoutes.ts` | Modify | Add `guardWithCreditsOrInternalToken()` wrapper |

### Test Strategy

- Mock `httpx.AsyncClient` responses for all three methods
- Test auth header construction (user pass-through vs service account)
- Test error handling: 402, 429, 5xx, timeout
- Test retry logic with backoff
- Integration test: verify gateway actually accepts `X-Internal-Token` auth

---

## Section 2: Responses API Proxy (`/v1/responses`)

### Rationale

GPT-5.4's `web_search` built-in tool and function calling require the Responses API format. The existing gateway handles `/v1/chat/completions` — this adds a parallel endpoint using identical infrastructure.

### What to Build

Create a new file `apps/web/server/_core/responsesRoutes.ts` for the Responses API handler (keeping `llmRoutes.ts` at its current 2200+ lines manageable). Register it from `llmRoutes.ts` via import.

### Request Processing

**`sanitizeResponsesBody(body)`**:
- Enforce `store: false` as default (ZDR compliance)
- Validate required fields: `model`, `input` array
- Strip disallowed fields (anything not in the Responses API spec)
- Validate `tools` array format (only `web_search` and registered function tools)

**Model resolution**: Use existing `resolveProviderModelAny(model)` → checks `model_provider_map` for enabled models → `resolveApiUrl()` with `apiStyle='responses'`.

### Feature Flag Gating

Single flag name `responsesApi` with the existing dual-check pattern:
- `getTenantFeatureFlag("responsesApi", tenantId)` — this already checks per-tenant first (`feature-flag:responsesApi:{tenantId}`), then falls back to global (`feature-flag:responsesApi`)
- Both levels default to `false`; enable globally first, then per-tenant for staged rollout

### Streaming Mode (`proxyResponsesStreamWithCredits()`)

Similar pattern to `proxyChatWithCredits()` but parsing Responses API SSE events:
- Forward SSE events from OpenAI to client
- Accumulate usage from `response.completed` event
- Track `web_search_call` items from output for cost accounting
- On stream end: `deductCreditsForUsage()` with accumulated totals

### Non-Streaming Mode (`proxyResponsesJsonWithCredits()`)

- Forward request to OpenAI, receive JSON response
- Parse `usage` object (same structure: `input_tokens`, `output_tokens`)
- Deduct credits based on usage

### Tool-Call Loop Handler

**Critical distinction**:
- `web_search` is a **hosted/built-in tool** — OpenAI executes it internally. The gateway does NOT dispatch it. Only counts `web_search_call` items for cost tracking.
- Custom function tools (e.g., `browser.execute_actions`) produce `function_call` items that the gateway must dispatch locally.

**Loop flow** (for custom function tools only):
1. Receive response with `function_call` items in `output`
2. For each function call: dispatch to the appropriate internal handler (browser tool route)
3. Collect results as `function_call_output` items
4. Send back to OpenAI with the outputs
5. Repeat until response has no more function calls or max rounds reached

**Loop constraints**:
- Max tool rounds: 10 (configurable via `system_settings`)
- Per-request budget cap: check accumulated credits against user's budget limit
- On tool call failure: send error output to OpenAI (`{ "error": "<message>" }`) — let the model decide to retry/skip
- On credit exhaustion mid-loop: stop loop, return partial results with accumulated usage
- On OpenAI error mid-loop: retry with exponential backoff (max 3), then abort with partial results
- Accumulate usage across all rounds
- **Client disconnect detection**: Listen for `req.on('close')` and abort the loop if client disconnects (release resources, log partial usage)
- **Socket timeout**: Set to 600 seconds (matching chat completions)

**Why the gateway handles the loop** (not the caller): The tool-call loop must dispatch `browser.execute_actions` to the local Node browser tool route (`/api/internal/tools/browser`). The Python caller does not have direct access to this route — the gateway sits between them. For stateless single-turn calls, the caller can use `/v1/chat/completions` directly.

### Usage Parsing

- Input/output tokens from `response.usage`
- Credit calculation via existing `deductCreditsForUsage()`
- Additional: count `web_search_call` items → $10/1k calls → add to credit deduction
- Add `web_search` cost as separate line in `provider_usage_log`

### Budget Cap Implementation

- Request body accepts optional `max_budget_credits` field
- Before each tool round, check: `accumulated_credits + estimated_next_round <= max_budget_credits`
- If exceeded: stop loop, return partial results with `budget_exceeded: true` flag
- Default cap from `system_settings`: `max_credits_per_request_{tenantId}` (default: 500)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/_core/responsesRoutes.ts` | Create | Responses API handler: sanitizer, streaming/JSON, tool-call loop |
| `apps/web/server/_core/llmRoutes.ts` | Modify | Import and register responsesRoutes |

### Test Strategy

- Schema validation: reject missing `model`/`input`
- `store=false` enforcement
- Credit accounting: success, partial-fail, tool-call-heavy scenarios
- SSE streaming: delta events proxied correctly
- Tool-call loop: function_call → dispatch → output → continue
- Max tool rounds enforcement
- Budget cap: stops at limit, returns partial results
- web_search cost tracking: count calls correctly
- Feature flag gating: global off, tenant off, both on

---

## Section 3: Activate Automation Copilot LLM Calls

### Rationale

Three `NotImplementedError` stubs and one `confidence=0.0` stub in the Python backend prevent the automation pipeline from functioning. Each needs a real LLM call via the `LLMGatewayClient` from Section 1.

**Graceful degradation**: If the LLM gateway is unavailable (network error, 5xx after retries), each stub should degrade gracefully rather than crash:
- `_analyze_intent()` → return `needs_clarification` with generic questions
- `_vision_llm_call()` → raise (cannot proceed without vision)
- `_diagnose_failure()` → return `FailureDiagnosis(confidence=0.0)` (existing behavior — disables self-healing)
- `WebAutomationExecutor.execute()` → return `{"status": "error", "message": "LLM gateway unavailable"}`

### 3.1: `_analyze_intent()` — Intent Analysis

**File**: `python-backend/app/services/automation_copilot.py` (line 130)

Replace `NotImplementedError` with:
- Call `gateway_client.chat_completion()` with a system prompt instructing the model to return structured `AutomationIntent` JSON
- Use `response_format: { type: "json_object" }` (more portable across providers than `json_schema`) with explicit JSON instructions in the system prompt
- Model: GPT-5.4 (primary), fallback via gateway's `model_provider_map` priority
- System prompt should define the `AutomationIntent` schema: `intent_type`, `confidence`, `browser_tasks[]`, `required_inputs[]`, `clarification_questions[]`
- If LLM returns invalid JSON → return `needs_clarification` with generic questions
- If LLM returns `confidence < 0.5` → return `needs_clarification` with the model's questions

### 3.2: `_vision_llm_call()` — Vision Element Identification

**File**: `python-backend/app/services/playwright_script_generator.py` (line 231)

Replace `NotImplementedError` with:
- Call `gateway_client.vision_call()` with screenshot (base64 PNG) + numbered overlay
- Model: vision-capable model from `vision_model` setting (default: `gpt-4o`)
- System prompt: "Identify interactive elements in this screenshot that match the user's goal. Return JSON array of IdentifiedElement objects."
- Output schema: `[{ element_index, action_type, value?, confidence }]`
- Filter results by `CONFIDENCE_THRESHOLD = 0.7` (existing constant)
- This uses `/v1/chat/completions` (not `/v1/responses`) — single-turn, no tool loop needed

### 3.3: `_diagnose_failure()` — Self-Healing Diagnosis

**File**: `python-backend/app/services/self_healing_executor.py` (line 185)

Replace stub (currently returns `FailureDiagnosis(confidence=0.0)` — not a `NotImplementedError`, but effectively disables self-healing) with:
- Call `gateway_client.vision_call()` with failure screenshot + error message + failed action details
- Model: same vision model as 3.2
- System prompt: "Diagnose why this browser action failed. Suggest a new CSS/ARIA/data-testid selector. Do NOT suggest JavaScript evaluate."
- Output: `FailureDiagnosis(root_cause, suggested_new_selector, confidence, action_type_still_valid)`
- Constraint: suggested selectors must be CSS, ARIA role+name, or data-testid — never arbitrary JS
- On successful heal: invalidate selector cache via `cache.invalidate()`
- Max heal attempts: 3 (existing `MAX_HEAL_ATTEMPTS` constant)

### 3.4: `WebAutomationExecutor.execute()` — Workflow Node

**File**: `python-backend/app/orchestrator/node_executors/web_automation_executor.py` (line 40)

Replace `NotImplementedError` with full pipeline orchestration:
- Instantiate `AutomationCopilot` with `PlaywrightScriptGenerator` and `SelfHealingExecutor`
- Call `copilot.analyze(inputs["prompt"], context["tenant_id"], context["user_id"])`
- If `needs_clarification`: return `{"status": "needs_input", "questions": result.questions}`
- Call `copilot.build(...)` then `copilot.execute_scripts(...)`
- Return `{"extracted_data": result.extracted_data, "screenshots": result.screenshots}`
- Pass through `allowed_domains` from node config or tenant settings

### Vision Model Configuration

The vision model is configurable per-tenant via `system_settings`:
- Key: `vision_model_{tenantId}`, category: `automation`
- Default: `gpt-4o` (must be vision-capable)
- `LLMGatewayClient` queries this setting before making vision calls

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/automation_copilot.py` | Modify | Implement `_analyze_intent()` |
| `python-backend/app/services/playwright_script_generator.py` | Modify | Implement `_vision_llm_call()` |
| `python-backend/app/services/self_healing_executor.py` | Modify | Implement `_diagnose_failure()` |
| `python-backend/app/orchestrator/node_executors/web_automation_executor.py` | Modify | Implement `execute()` |

### Test Strategy

- `_analyze_intent()`: mock gateway, verify structured output parsing, test invalid JSON fallback
- `_vision_llm_call()`: mock gateway, verify image content block construction, test confidence filtering
- `_diagnose_failure()`: mock gateway, verify no JS evaluate in suggestions, test cache invalidation
- `WebAutomationExecutor`: mock copilot, test full pipeline flow including `needs_clarification` path
- All existing 102 Feature 031 tests must continue passing

---

## Section 4: Browser Runner — Real Execution

### Rationale

`BrowserSession` has real orchestration logic in `execute_actions()` (dispatches actions sequentially, tracks costs, checks timeouts, accumulates results) but the individual action methods (`navigate`, `click`, `fill`, etc.) return dummy data. This section wires those individual action methods to real Playwright execution via `SandboxDispatcher`, preserving the existing orchestration layer. Docker containerization is deferred.

### What to Build

#### 4.1: Wire Individual Action Methods to Real Execution

**File**: `python-backend/app/services/tools/browser_tool.py`

**Important**: Do NOT replace `execute_actions()` — it already has working orchestration logic (timeout tracking, cost accumulation, result aggregation). Instead, wire the individual action methods to real Playwright calls via `SandboxDispatcher`:

- Each action method (`_do_navigate`, `_do_click`, `_do_fill`, `_do_screenshot`, `_do_extract_text`, etc.) currently returns stub/dummy data
- Replace each stub with a call to `SandboxDispatcher.dispatch()` with `execution_mode="browser"`, `feature_type="connector"`
- The dispatcher needs a `db_session` — inject via factory pattern since `BrowserSession.__init__` doesn't currently accept one. Create `BrowserSessionFactory` that provides the session with dispatcher pre-configured
- Wait for job completion via `await wait_job(job_id)`
- Parse results: screenshots (as base64 or signed URLs), extracted data, metrics

Keep all existing guards (already in the orchestration layer):
- SSRF validation (`validate_url_with_dns`) — already present
- Allowlist check — already present
- Concurrency guard — already present
- Session timeout — already present

#### 4.2: Add Missing Caps

Add to `browser_tool.py`:
- `MAX_ACTIONS = 50` — validate upfront (action count is known before execution), reject with 422
- `MAX_PAGES = 5` — enforce at runtime during execution. When `_pages_loaded` reaches the cap, abort remaining actions gracefully (return partial results with `pages_cap_reached: true`), not reject upfront since page count depends on which actions involve navigation

#### 4.3: Sandbox Profile Mapping

**File**: `python-backend/app/services/sandbox_profiles.py`

Add entry to `FEATURE_PROFILE_MAP`:
```python
"connector-browser-default": <profile_id>
```

Create the sandbox profile record in DB (seed script or migration) with:
- Playwright + Chromium dependencies
- Network: default deny, allowlist-only
- Resource limits: memory, CPU, timeout

#### 4.4: SSRF Defense-in-Depth

The browser runner's entrypoint (whether local or Docker) must install a `page.route()` handler that:
- Intercepts all outgoing requests
- Blocks requests to private IP ranges
- Blocks requests to domains not in the allowlist
- Logs blocked requests for audit

This supplements the existing pre-navigation DNS check.

#### 4.5: Node-Side Domain Validation (Gap Fix)

**File**: `apps/web/server/routes/browserTool.ts`

Currently, Node reserves credits before Python validates domains — wasting time on invalid requests.
Add allowlist validation at the Node layer before `deductCredits()`:
- Query tenant's `allowed_domains` from `system_settings`
- Validate all URLs in the `actions[]` array against allowlist
- Return 403 immediately if any domain is not allowed

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/tools/browser_tool.py` | Modify | Real execution + caps |
| `python-backend/app/services/sandbox_profiles.py` | Modify | Browser profile mapping |
| `apps/web/server/routes/browserTool.ts` | Modify | Node-side domain validation |

### Test Strategy

- Caps enforcement: exceed MAX_ACTIONS → 422, exceed MAX_PAGES → 422
- Allowlist: domain outside allowlist → blocked
- DNS rebinding: hostname resolving to private IP → blocked
- SSRF: `page.route()` handler blocks internal IPs
- Node domain validation: fail fast before credit deduction
- Redaction: fill/type actions with secrets not in logs
- Integration: full flow from Node → Python → sandbox → results

---

## Section 5: Web Search Integration + Cache

### Rationale

When GPT-5.4 uses `web_search` (built-in tool), the results appear in the Responses API output. Caching these results reduces costs for repeated queries and enables conversation recall.

### What to Build

#### 5.1: Two-Tier Search Result Cache

**File to create**: `apps/web/server/services/searchResultCache.ts`

**Tier 1 — Tenant-shared cache** (public search results):
- Redis key: `search_cache:tenant:{tenantId}:{sha256(normalized_query)}`
- **Query normalization**: lowercase → strip extra whitespace → remove punctuation → sort words alphabetically → SHA-256 hash
- Value: JSON with result snippets, citations, URLs, `retrieved_at` timestamp
- TTL: 15-60 minutes (configurable per query type)
- Cache population: extract search results from Responses API `web_search_call` output events

**Tier 2 — Per-user cache** (contextual data):
- Redis key: `search_cache:user:{userId}:{hash(query_with_context)}`
- Value: user-specific query results, browser session references
- TTL: session duration or 60 minutes
- Never shared across users

**Cache bypass**:
- When user prompt contains freshness keywords ("latest", "today", "current price", "now", Thai: "ล่าสุด", "วันนี้", "ราคาปัจจุบัน")
- When explicitly requested by user
- Always include `retrieved_at` timestamp in cached responses

#### 5.2: Search Cost Tracking

In the `/v1/responses` handler:
- Count `web_search_call` items from Responses API output
- Cost: $10/1k calls → $0.01 per call
- Search content tokens: billed at model input rate (from `model_provider_map`)
- Log as separate line item in `provider_usage_log` with `modelUsed: "web_search"`
- Per-run quota: max search calls per request (default 5, configurable via `system_settings`)

#### 5.3: Freshness Policy

Detect freshness requirements from the user prompt:
- Keyword detection (multilingual: English + Thai)
- When detected: skip cache, add `freshness_required: true` to metadata
- Always include citations with source URLs in the response
- Log `retrieved_at` for audit trail

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/services/searchResultCache.ts` | Create | Two-tier Redis cache |
| `apps/web/server/_core/llmRoutes.ts` | Modify | Cache population from Responses API events, cost tracking |

### Test Strategy

- Cache hit returns cached result, cache miss makes API call
- TTL expiry works correctly
- Freshness keywords bypass cache
- Tenant isolation: user A's cache not visible to different tenant
- Per-user data: user A's contextual cache not visible to user B in same tenant
- Cost tracking: search calls counted and logged correctly
- Per-run quota: exceeding max search calls → quota error

---

## Section 6: MCP Tool Registry for Agencies

### Rationale

Agency workflows need to call browser actions and trigger web searches. The internal MCP router already handles Google Drive and OneDrive tools — this extends it with browser and sandbox capabilities.

### What to Build

#### 6.1: Register Browser Tool in MCP

**File**: `python-backend/app/api/internal_mcp.py`

Add to `TOOL_HANDLERS`:

**Tool: `browser.execute_actions`**
- Parameters: `allowed_domains[]`, `actions[]`, `session_id?`, `timeout_seconds?`
- Dispatch: call back to Node browser tool route (`POST /api/internal/tools/browser`) — reuses credit/concurrency controls
- Context: `user_id`, `tenant_id` passed from agency execution context
- Returns: screenshots, extracted data, actual cost

**Tool: `sandbox.exec_command`**
- Parameters: `command`, `working_dir?`, `timeout_seconds?`
- Dispatch: call `SandboxDispatcher` with `execution_mode="command"`
- Returns: stdout, stderr, exit_code
- **Security hardening**:
  - Command allowlist: only pre-approved commands (e.g., `python`, `node`, `curl` to allowed hosts). Arbitrary shell commands are rejected.
  - Max execution time: 300 seconds (matches browser session timeout)
  - **Not exposed to LLMs directly** — only agency nodes with explicit `sandbox_command` capability in their `nodeConfig` can invoke it
  - Callers must have valid `X-Proxy-Token`
  - All invocations logged to audit trail

**MCP auth for browser tool dispatch**: When MCP dispatches to the Node browser tool route, it uses `X-Internal-Token` with the `SMARTSPEC_WEB_GATEWAY_TOKEN` env var (same token the Python backend already has for other Node calls).

Both tools appear in the `/tools` endpoint response.

#### 6.2: Agency Integration

When an agency workflow graph walks a node that needs browser/search:
- The node executor calls the MCP tool via internal MCP endpoint
- MCP dispatches to browser tool route (Node) or sandbox dispatcher (Python)
- Credit/concurrency enforcement happens at Node layer (for browser) or Python layer (for sandbox)
- `persona_prefix` injection guard in agency orchestrator must not be bypassed by tool inputs

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/api/internal_mcp.py` | Modify | Add browser + sandbox tool handlers |
| `apps/web/server/routes/browserTool.ts` | Minor | Accept MCP-originated context headers |

### Test Strategy

- MCP tool list includes `browser.execute_actions` and `sandbox.exec_command`
- Tool call dispatches to correct handler
- Auth: proxy token required for all calls
- Context: user_id/tenant_id propagated correctly
- persona_prefix guard not bypassed by tool inputs
- Credit enforcement: browser tool calls deduct from user

---

## Section 7: Credit Flow + Frontend UI

### Rationale

The automation copilot and browser tool have separate credit reserves that can lead to double-deduction. The UI needs to show cost estimates and support the per-request budget cap.

### What to Build

#### 7.1: Credit Flow Coordination

**Problem**: Automation copilot pre-reserves 100 credits. When it internally uses the browser tool, the browser tool tries to pre-reserve 20 more. This could double-deduct 120 credits when actual cost might be 30.

**Solution — Parent Reservation Pattern**:
- Automation copilot creates a credit reservation (100 credits) and receives a `reservation_id`
- When calling browser tool internally, pass `parent_reservation_id` instead of a boolean flag
- Browser tool route validates the reservation exists and draws from it (deducts against the parent's reserved pool) instead of creating its own reservation
- Final credit reconciliation happens at the automation copilot level — unused credits from the reservation are refunded
- `parent_reservation_id` is only accepted with valid `X-Internal-Token` — external requests always create their own reservation
- This avoids the trust boundary problem of a simple `skip_credit_reserve` flag and provides an auditable credit chain

#### 7.2: Cost Estimate in Analyze Response

**File**: `python-backend/app/api/automation_copilot.py`

Add `cost_estimate` field to the analyze response:
```python
class AnalyzeResponse(BaseModel):
    status: str
    intent: AutomationIntent | None
    cost_estimate: CostEstimate | None

class CostEstimate(BaseModel):
    estimated_credits: int        # Formula: (num_browser_tasks * 15) + (num_llm_calls * 5) + (num_web_searches * 10)
    breakdown: dict[str, int]     # {"llm_calls": 30, "browser_actions": 20, "web_search": 10}
    max_possible_credits: int     # Worst case (all retries, max tool rounds)
```

#### 7.3: Frontend UI Enhancements

**File**: `apps/web/client/src/components/automation/AutomationChatModal.tsx`

Additions to the existing modal:
- **Research + Browse mode toggle**: Radio/switch for "Search only" vs "Search + Browse"
- **Cost estimate display**: Card showing estimated credits before execution, with breakdown
- **Budget input**: Optional field for user to set max credits per request
- **Live progress**: Poll status endpoint, show current step ('analyzing...', 'searching web...', 'browsing page...', 'extracting data...')
- **Citations panel**: Collapsible section showing source URLs with `retrieved_at` timestamps
- **Allowed domains input**: Multi-tag input for user to add domains beyond tenant defaults

#### 7.4: Status Streaming

The existing status polling in `AutomationChatModal` needs to return richer status:
- Current step name and description
- Tool calls in progress (web_search count, browser action index)
- Accumulated cost so far
- Remaining budget (if cap set)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/routers/automationCopilot.ts` | Modify | Credit coordination, parent_reservation_id |
| `apps/web/server/routes/browserTool.ts` | Modify | Accept parent_reservation_id from internal calls |
| `apps/web/server/services/creditService.ts` | Modify | Add reservation create/draw/refund methods |
| `python-backend/app/api/automation_copilot.py` | Modify | Add cost_estimate to analyze response |
| `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Modify | UI enhancements |

### Test Strategy

- Credit coordination: no double-deduction when copilot uses browser tool internally
- parent_reservation_id: only accepted with X-Internal-Token, draws from parent pool
- Cost estimate: reasonable values for different intent types
- UI: mode toggle, cost display, budget input render correctly
- Status polling: progressive updates shown

---

## Section 8: Security Controls + Audit

### Rationale

Browser automation and web search introduce new attack surfaces. This section hardens the system and ensures comprehensive audit logging.

### What to Build

#### 8.1: Prompt Injection Mitigation

All tool outputs (web_search results, browser extracted data) are untrusted content:
- Never use tool outputs as system prompts directly
- Sanitize tool outputs before sending back to OpenAI as `function_call_output`
- Strip HTML/script tags from extracted text using `bleach` (Python) or `sanitize-html` (Node)
- Log tool outputs for audit (with PII/secrets redacted)
- `tool_choice` enforcement: limit to registered tools only

#### 8.2: SSRF Defense Enhancement

Existing defenses (pre-navigation DNS check, blocked CIDRs) plus:
- `page.route()` handler in browser runner intercepting all outgoing requests
- Runtime IP check: even after navigation, block requests resolving to private ranges
- Block metadata endpoints: `169.254.169.254/32`, `metadata.google.internal`

#### 8.3: Audit Events

New event types for the JSONL audit log:

**`browser_tool_call`**: domains accessed, action count, screenshots taken, actual cost, outcome (success/failure), wall time
**`web_search_call`**: query hash (not full query — privacy), result count, latency, cache hit/miss
**`responses_api_call`**: model, tool_calls count, web_search calls count, total tokens, cost, tool rounds count

Format follows existing JSONL pattern in `apps/web/logs/audit/`. Each event has `traceId` for correlation.

#### 8.4: Redaction Policy

- Never log `text` values from `fill`/`type` actions on password/sensitive fields
- Detect sensitive fields: `input[type=password]`, `input[name*=token]`, `input[name*=secret]`, `input[name*=key]`
- Screenshots: capped at 5 per session (existing), stored per media retention policy (12 days)
- Future: optional password field blur in screenshots (deferred)

#### 8.5: Data Retention

- Responses API: `store=false` default (enforced in `sanitizeResponsesBody`)
- Browser screenshots: 12 days (existing media retention policy)
- Search cache: 15-60 minute TTL (self-cleaning)
- Audit logs: 30 days (existing rotation)

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `python-backend/app/services/tools/browser_tool.py` | Modify | Audit events, redaction |
| `apps/web/server/_core/llmRoutes.ts` | Modify | Audit events for /v1/responses |
| `apps/web/server/services/auditLogger.ts` | Minor | New event type constants |

### Test Strategy

- Prompt injection: tool outputs sanitized (no script tags passed through)
- SSRF: page.route blocks internal IPs during navigation
- Audit: all 3 new event types logged correctly with traceId
- Redaction: password field values not in logs
- store=false: enforced regardless of client request

---

## Section 9: Database + Configuration Changes

### Rationale

GPT-5.4 needs an entry in `model_provider_map` for pricing, and new feature flags/system settings need to be configured.

### What to Build

#### 9.1: GPT-5.4 Model Entry

Add to `model_provider_map` table:
- `modelId`: "gpt-5.4"
- `providerModelId`: "gpt-5.4" (or provider-specific variant)
- `pricingInput`: 2.50 (per 1M tokens)
- `pricingOutput`: 15.00 (per 1M tokens)
- `apiStyle`: "responses" (routes to Responses API)
- `isEnabled`: true
- Provider: OpenAI

This is a DB seed/insert — not a schema migration. Use a script or manual insert.

**Pre-check**: Verify that `apiStyleEnum` in `drizzle/schema.ts` includes the value `"responses"`. If not, add it to the enum and run a migration (`ALTER TYPE ... ADD VALUE 'responses'`) before inserting the GPT-5.4 row.

#### 9.2: Feature Flags

Configure via Redis or admin UI — single flag name `responsesApi`:
- `feature-flag:responsesApi` (global): default `false` → set to `true` when ready
- `feature-flag:responsesApi:{tenantId}` (per-tenant): override for staged rollout
- Uses existing `getTenantFeatureFlag("responsesApi", tenantId)` which checks per-tenant first, falls back to global

#### 9.3: System Settings

Insert into `system_settings` table:
- `vision_model_{tenantId}` (category: `automation`): default `gpt-4o`
- `max_search_calls_per_request` (category: `llm`): default `5`
- `max_credits_per_request_{tenantId}` (category: `llm`): default `500`
- `max_browser_sessions_{tenantId}` (category: `automation`): default `3`

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| Seed script or manual SQL | Create | GPT-5.4 model_provider_map entry |
| Admin UI or Redis CLI | Configure | Feature flags |

### Test Strategy

- GPT-5.4 model resolves correctly via `resolveProviderModelAny()`
- Feature flags gate access correctly (both flags required)
- System settings return correct defaults when no override exists

---

## Implementation Order

The sections have the following dependency chain:

```
Section 9 (DB + Config) ←── prerequisite for everything
    ↓
Section 1 (LLMGatewayClient) ←── prerequisite for Section 3
    ↓
    ├──→ Section 2 (Responses API) ←── can parallel with Section 3
    ├──→ Section 3 (Activate LLM Calls) ←── depends on Section 1
    └──→ Section 4 (Browser Runner) ←── can parallel with 2, 3
              ↓
         Section 5 (Web Search Cache) ←── depends on Section 2
              ↓
         Section 6 (MCP Tools) ←── depends on Sections 3, 4
              ↓
         Section 7 (Credit Flow + UI) ←── depends on Sections 2-6
              ↓
         Section 8 (Security + Audit) ←── final hardening pass
```

**Recommended implementation order**:
1. Section 9 (DB + Config) — prerequisite for everything
2. Section 1 (LLMGatewayClient) — prerequisite for Section 3
3. Section 2 (Responses API) — can parallel with Section 3
4. Section 3 (Activate LLM Calls) — depends on Section 1
5. Section 4 (Browser Runner) — can parallel with Sections 2-3
6. Section 5 (Web Search Cache) — depends on Section 2
7. Section 6 (MCP Tools) — depends on Sections 3, 4
8. Section 7 (Credit Flow + UI) — depends on all above
9. Section 8 (Security + Audit) — final hardening pass

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Prompt injection from web content | HIGH | Sanitize all tool outputs, never use as system prompts, audit logging |
| SSRF/DNS rebinding | HIGH | 3-layer defense: pre-check + page.route + container isolation |
| Runaway costs from tool loops | HIGH | Per-request budget cap, max tool rounds, web_search quota |
| Double credit deduction | MEDIUM | Parent reservation pattern, coordinated reserves |
| GPT-5.4 rate limits | MEDIUM | Existing provider fallback + circuit breaker |
| Feature 031 test regression | MEDIUM | Run full 102-test suite after each section |
| Gateway internal auth bypass | HIGH | X-Internal-Token validation with timing-safe comparison |

---

## Rollback Strategy

Each section can be independently disabled without a full revert:

| Section | Rollback mechanism |
|---------|-------------------|
| Section 1 (LLMGatewayClient) | `guardWithCreditsOrInternalToken()` is a separate wrapper — remove it to restore original auth path. Does NOT affect existing `/v1/chat/completions`. |
| Section 2 (Responses API) | Disable `responsesApi` feature flag → endpoint returns 404. Separate file (`responsesRoutes.ts`) can be unregistered. |
| Section 3 (LLM Calls) | Each stub has graceful degradation built in. Set `AUTOMATION_LLM_ENABLED=false` env var to revert to stub behavior. |
| Section 4 (Browser Runner) | Existing orchestration preserved. Individual action methods can fall back to stubs. |
| Section 5 (Search Cache) | Cache miss = no impact. Delete Redis keys `search_cache:*` to clear. |
| Section 6 (MCP Tools) | Remove tool handlers from `TOOL_HANDLERS` dict. |
| Section 7 (Credit Flow) | Remove reservation pattern, revert to independent reserves. |
| Section 8 (Security) | Audit events are additive — no rollback needed. |
| Section 9 (DB Config) | Disable GPT-5.4 in `model_provider_map` (`isEnabled=false`). |

---

## Verification Checklist

After all sections are implemented:

1. **Feature 031 tests**: All 102 existing tests pass
2. **New tests**: All new tests pass (target 80% coverage per section)
3. **TypeScript**: `pnpm check` passes
4. **Python**: `pytest`, `mypy app/`, `ruff check app/` all pass
5. **Integration**: End-to-end flow from UI → gateway → Python → browser → results
6. **Security**: SSRF blocked, secrets redacted, audit events logged
7. **Credits**: Correct deduction, no double-charge, budget cap works
8. **Feature flags**: Responses API gated correctly (global + per-tenant)
