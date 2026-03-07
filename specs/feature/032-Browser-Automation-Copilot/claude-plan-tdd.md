# Feature 032: Browser Automation Copilot — TDD Plan

Testing frameworks: **Vitest** (TypeScript), **pytest** (Python, asyncio_mode=auto, 80% coverage enforced).

---

## Section 1: LLMGatewayClient (Python HTTP Client)

**File**: `python-backend/tests/test_llm_gateway_client.py`

```python
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

**File**: `apps/web/server/__tests__/guardWithCreditsOrInternalToken.test.ts`

```typescript
// Test: valid X-Internal-Token + X-User-Id → returns userId from header
// Test: valid X-Internal-Token without X-User-Id → returns service account userId
// Test: invalid X-Internal-Token → falls through to JWT auth
// Test: no X-Internal-Token → delegates to existing guardWithCredits()
// Test: internal token callers bypass per-IP rate limiter
// Test: internal token callers still respect per-provider rate limits
```

---

## Section 2: Responses API Proxy (`/v1/responses`)

**File**: `apps/web/server/__tests__/responsesRoutes.test.ts`

```typescript
// === Request Validation ===
// Test: reject request missing "model" field → 400
// Test: reject request missing "input" field → 400
// Test: enforce store=false as default when not provided
// Test: reject store=true when tenant policy disallows it
// Test: accept valid Responses API payload

// === Feature Flag Gating ===
// Test: global responsesApi flag off → 404
// Test: global on but tenant flag off → 403
// Test: both flags on → request proceeds

// === Streaming Mode ===
// Test: SSE events from OpenAI proxied to client correctly
// Test: usage accumulated from response.completed event
// Test: credits deducted on stream end

// === Non-Streaming Mode ===
// Test: JSON response returned with usage parsed
// Test: credits deducted from usage.input_tokens + output_tokens

// === Tool-Call Loop ===
// Test: function_call in output → dispatched to browser tool route
// Test: function_call_output sent back to OpenAI → loop continues
// Test: max tool rounds (10) → loop stops, returns partial results
// Test: tool call failure → error output sent to OpenAI
// Test: credit exhaustion mid-loop → loop stops with budget_exceeded flag
// Test: client disconnect → loop aborted, partial usage logged

// === web_search Tracking ===
// Test: web_search_call items counted (not dispatched)
// Test: search cost calculated ($0.01 per call) and added to credit deduction
// Test: search cost logged as separate provider_usage_log entry

// === Budget Cap ===
// Test: max_budget_credits respected → loop stops when exceeded
// Test: default budget from system_settings used when not specified
```

---

## Section 3: Activate Automation Copilot LLM Calls

**File**: `python-backend/tests/test_automation_copilot_llm.py`

```python
# === _analyze_intent() ===
# Test: valid JSON response parsed into AutomationIntent correctly
# Test: invalid JSON from LLM → returns needs_clarification with generic questions
# Test: confidence < 0.5 → returns needs_clarification with model's questions
# Test: gateway unavailable → returns needs_clarification (graceful degradation)
# Test: response_format set to json_object (not json_schema)

# === Existing tests preserved ===
# Test: all 102 Feature 031 tests still pass (run as part of suite)
```

**File**: `python-backend/tests/test_playwright_script_generator_llm.py`

```python
# === _vision_llm_call() ===
# Test: screenshot base64 + overlay sent as image content block
# Test: vision model from tenant settings (not hardcoded)
# Test: elements with confidence >= 0.7 kept, < 0.7 filtered
# Test: overall confidence < 0.5 → returns empty list
# Test: gateway unavailable → raises (cannot proceed without vision)
```

**File**: `python-backend/tests/test_self_healing_executor_llm.py`

```python
# === _diagnose_failure() ===
# Test: failure screenshot + error message sent to vision model
# Test: valid FailureDiagnosis returned with confidence > 0.0
# Test: suggested selector is CSS/ARIA/data-testid (no JS evaluate)
# Test: gateway unavailable → returns FailureDiagnosis(confidence=0.0) (degradation)
# Test: successful heal → selector cache invalidated
# Test: max 3 heal attempts then gives up
```

**File**: `python-backend/tests/test_web_automation_executor_impl.py`

```python
# === WebAutomationExecutor.execute() ===
# Test: full pipeline: analyze → build → execute → results
# Test: needs_clarification → returns status=needs_input with questions
# Test: allowed_domains passed from node config
# Test: gateway unavailable → returns status=error with message
```

---

## Section 4: Browser Runner — Real Execution

**File**: `python-backend/tests/test_browser_session_real.py`

```python
# === Individual action methods ===
# Test: _do_navigate calls SandboxDispatcher with correct execution_mode
# Test: _do_click dispatches click action and returns result
# Test: _do_fill dispatches fill action and returns result
# Test: _do_screenshot returns base64 PNG and increments screenshot counter
# Test: _do_extract_text returns extracted text truncated at MAX_TEXT_LENGTH

# === Caps enforcement ===
# Test: MAX_ACTIONS=50 → reject upfront when actions[] > 50 (422)
# Test: MAX_PAGES=5 → abort remaining actions at runtime when cap reached
# Test: MAX_PAGES abort returns partial results with pages_cap_reached=true
# Test: MAX_SCREENSHOTS=5 → reject screenshot action when cap reached

# === SSRF defense ===
# Test: page.route handler blocks requests to 10.0.0.0/8
# Test: page.route handler blocks requests to 169.254.169.254
# Test: page.route handler allows requests to allowlisted domains
# Test: blocked requests logged for audit

# === BrowserSessionFactory ===
# Test: factory injects SandboxDispatcher with db_session
```

**File**: `apps/web/server/__tests__/browserToolDomainValidation.test.ts`

```typescript
// Test: domain in tenant allowlist → passes validation
// Test: domain NOT in allowlist → returns 403 before credit deduction
// Test: multiple URLs in actions, one invalid → returns 403
// Test: no allowed_domains configured → all domains blocked
```

---

## Section 5: Web Search Integration + Cache

**File**: `apps/web/server/__tests__/searchResultCache.test.ts`

```typescript
// === Tier 1: Tenant-shared cache ===
// Test: cache miss returns null
// Test: cache set + get returns cached result
// Test: TTL expiry → cache miss after TTL
// Test: tenant A cache not visible to tenant B (different keys)
// Test: query normalization: "Hello World!" and "hello world" produce same key

// === Tier 2: Per-user cache ===
// Test: user A cache not visible to user B in same tenant
// Test: user cache TTL independent of tenant cache

// === Freshness bypass ===
// Test: prompt with "latest" → cache bypassed
// Test: prompt with "ล่าสุด" → cache bypassed
// Test: prompt with "วันนี้" → cache bypassed
// Test: normal prompt → cache checked

// === Cost tracking ===
// Test: web_search_call count extracted from Responses API output
// Test: search cost calculated at $0.01 per call
// Test: per-run quota (default 5) → exceeded returns quota error
```

---

## Section 6: MCP Tool Registry for Agencies

**File**: `python-backend/tests/test_mcp_browser_tools.py`

```python
# === Tool registration ===
# Test: GET /tools includes browser.execute_actions in response
# Test: GET /tools includes sandbox.exec_command in response
# Test: tool schemas match expected parameter definitions

# === browser.execute_actions dispatch ===
# Test: tool call dispatches to Node browser tool route
# Test: X-Internal-Token header sent to Node route
# Test: user_id/tenant_id propagated from agency context
# Test: missing proxy token → 401

# === sandbox.exec_command hardening ===
# Test: allowed command (python) → executes
# Test: disallowed command (rm, curl to non-allowed host) → rejected
# Test: max execution time enforced (300s)
# Test: not callable without sandbox_command capability in node config

# === Agency integration ===
# Test: persona_prefix injection guard not bypassed by tool inputs
```

---

## Section 7: Credit Flow + Frontend UI

**File**: `apps/web/server/__tests__/creditReservation.test.ts`

```typescript
// === Parent reservation pattern ===
// Test: create reservation → returns reservation_id with reserved amount
// Test: draw from reservation → deducts from parent pool
// Test: draw exceeding remaining reservation → rejected
// Test: refund unused reservation → credits returned to user
// Test: parent_reservation_id only accepted with X-Internal-Token
// Test: external request without internal token → creates own reservation

// === Cost estimate ===
// Test: analyze response includes cost_estimate
// Test: estimated_credits formula: (tasks*15) + (llm_calls*5) + (searches*10)
// Test: max_possible_credits includes retry overhead
```

**File**: `apps/web/client/src/components/automation/__tests__/AutomationChatModal.test.tsx`

```typescript
// Test: research+browse mode toggle renders
// Test: cost estimate card displays breakdown
// Test: budget input field accepts numeric value
// Test: progress status updates shown during execution
// Test: citations panel shows source URLs
// Test: allowed domains input renders multi-tag input
```

---

## Section 8: Security Controls + Audit

**File**: `python-backend/tests/test_browser_security.py`

```python
# === Prompt injection mitigation ===
# Test: HTML script tags stripped from extracted text (using bleach)
# Test: tool outputs sanitized before function_call_output

# === Redaction ===
# Test: fill action on input[type=password] → value not in audit log
# Test: fill action on input[name*=token] → value not in audit log
# Test: fill action on normal input → value preserved in audit log
```

**File**: `apps/web/server/__tests__/responsesAudit.test.ts`

```typescript
// === Audit events ===
// Test: browser_tool_call event logged with traceId, domains, action count
// Test: web_search_call event logged with query hash (not full query)
// Test: responses_api_call event logged with model, tool rounds, cost

// === store=false enforcement ===
// Test: store=true in request body → overridden to false
// Test: store field absent → defaults to false
```

---

## Section 9: Database + Configuration Changes

**File**: `apps/web/server/__tests__/gpt54ModelConfig.test.ts`

```typescript
// Test: resolveProviderModelAny("gpt-5.4") returns correct provider config
// Test: apiStyle "responses" routes to /v1/responses endpoint
// Test: pricing matches spec (input: 2.50, output: 15.00 per 1M tokens)
// Test: feature flag responsesApi gates access (global + per-tenant)
// Test: system settings return defaults when no tenant override exists
```
