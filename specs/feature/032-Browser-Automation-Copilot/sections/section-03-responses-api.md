# Section 03: Responses API Proxy (`/v1/responses`)

## Overview

This section adds a new Express endpoint `/v1/responses` to the Node.js LLM gateway. It proxies requests to OpenAI's Responses API (used by GPT-5.4 for `web_search` built-in tool and function calling), handles SSE streaming, manages a tool-call loop for custom function tools, tracks `web_search` costs, and enforces a per-request budget cap.

The endpoint lives in a new file `apps/web/server/_core/responsesRoutes.ts` and is registered from the existing `llmRoutes.ts` via import. This keeps the already-large `llmRoutes.ts` (2200+ lines) manageable.

**Dependencies**: This section requires section-02-gateway-client (for `guardWithCreditsOrInternalToken()`) and section-01-db-config (for the GPT-5.4 `model_provider_map` entry with `apiStyle: "responses"` and the `responsesApi` feature flag).

---

## Tests

**File to create**: `apps/web/server/__tests__/responsesRoutes.test.ts`

All tests use Vitest. The test file should mock the upstream OpenAI fetch, the credit service, the feature flag service, the audit logger, and the browser tool dispatch route. Use `vi.mock()` for module-level mocks.

```typescript
// apps/web/server/__tests__/responsesRoutes.test.ts

// === Request Validation ===
// Test: reject request missing "model" field -> 400
// Test: reject request missing "input" field -> 400
// Test: enforce store=false as default when not provided
// Test: reject store=true when tenant policy disallows it
// Test: accept valid Responses API payload

// === Feature Flag Gating ===
// Test: global responsesApi flag off -> 404
// Test: global on but tenant flag off -> 403
// Test: both flags on -> request proceeds

// === Streaming Mode ===
// Test: SSE events from OpenAI proxied to client correctly
// Test: usage accumulated from response.completed event
// Test: credits deducted on stream end

// === Non-Streaming Mode ===
// Test: JSON response returned with usage parsed
// Test: credits deducted from usage.input_tokens + output_tokens

// === Tool-Call Loop ===
// Test: function_call in output -> dispatched to browser tool route
// Test: function_call_output sent back to OpenAI -> loop continues
// Test: max tool rounds (10) -> loop stops, returns partial results
// Test: tool call failure -> error output sent to OpenAI
// Test: credit exhaustion mid-loop -> loop stops with budget_exceeded flag
// Test: client disconnect -> loop aborted, partial usage logged

// === web_search Tracking ===
// Test: web_search_call items counted (not dispatched)
// Test: search cost calculated ($0.01 per call) and added to credit deduction
// Test: search cost logged as separate provider_usage_log entry

// === Budget Cap ===
// Test: max_budget_credits respected -> loop stops when exceeded
// Test: default budget from system_settings used when not specified
```

### Test Setup Guidance

Each test should:
1. Mock `getTenantFeatureFlag` to control feature flag gating. Import from `../services/featureFlags`.
2. Mock the upstream HTTP fetch to OpenAI (the function that calls `fetch()` with the provider's API URL) to return controlled Responses API JSON or SSE streams.
3. Mock `deductCreditsForUsage` from `llmRoutes.ts` internals (or the credit service methods it delegates to).
4. Mock `auditLogger.log()` to verify audit events are emitted.
5. Use supertest or a lightweight Express test harness to send POST requests to `/v1/responses`.

For SSE streaming tests, the mock should return a ReadableStream that emits SSE-formatted chunks including `response.completed` with usage data. For tool-call loop tests, the first mock response should contain `function_call` output items, and subsequent mock responses should contain final text output.

---

## Implementation Details

### File: `apps/web/server/_core/responsesRoutes.ts` (Create)

This file exports a single function `registerResponsesRoutes(app: Express)` that is called from `registerLLMRoutes()` in `llmRoutes.ts`.

#### Request Sanitization: `sanitizeResponsesBody(body)`

A pure function that:
- Enforces `store: false` as the default (ZDR compliance). If `store` is `true` and tenant policy disallows it, override to `false`.
- Validates required fields: `model` (string) and `input` (array). Returns a 400-shaped error object if missing.
- Strips disallowed fields -- only pass through fields defined in the OpenAI Responses API spec (`model`, `input`, `instructions`, `tools`, `tool_choice`, `temperature`, `top_p`, `max_output_tokens`, `store`, `metadata`, `stream`).
- Validates the `tools` array: only `web_search` (type `"web_search_preview"` or `"web_search"`) and registered function tool definitions are allowed.
- Accepts an optional `max_budget_credits` field (custom, not forwarded to OpenAI) for budget cap enforcement.

#### Feature Flag Gating

Before processing any request, check:

```typescript
import { getTenantFeatureFlag, getFeatureFlag } from "../services/featureFlags";

// Check global flag first
const globalEnabled = await getFeatureFlag("responsesApi");
if (!globalEnabled) return res.status(404).json({ error: { message: "Not found" } });

// Check tenant flag (getTenantFeatureFlag checks per-tenant first, falls back to global)
const tenantEnabled = await getTenantFeatureFlag("responsesApi", tenantId);
if (!tenantEnabled) return res.status(403).json({ error: { message: "Feature not enabled for this tenant" } });
```

The tenant ID comes from the auth result (either JWT-based or from internal token headers).

#### Model Resolution

Use the existing `resolveProviderModelAny(modelId)` function exported from `llmRoutes.ts` (or extracted to a shared utility). This returns `{ providerModelId, apiStyle }`. The `apiStyle` must be `"responses"` for models that use this endpoint. If the resolved model has a different `apiStyle`, fall back to the chat completions endpoint or return an error.

The API URL is constructed using the existing `resolveApiUrl()` helper, which for `apiStyle: "responses"` should route to the provider's `/v1/responses` endpoint.

#### Streaming Mode: `proxyResponsesStreamWithCredits()`

Similar pattern to the existing `proxyChatWithCredits()` in `llmRoutes.ts` but adapted for Responses API SSE event format:

1. Set request body `stream: true`.
2. Forward the sanitized request to the resolved provider URL with the decrypted API key.
3. Set response headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
4. Pipe SSE events from the upstream response to the client response.
5. Parse SSE events as they arrive:
   - Track `web_search_call` items from output for cost accounting (count only -- these are executed by OpenAI, not dispatched locally).
   - On `response.completed` event: extract `usage` object (`input_tokens`, `output_tokens`).
   - On `response.function_call_arguments.done` event: buffer function call for the tool-call loop (if applicable).
6. On stream end: call `deductCreditsForUsage()` with accumulated token counts.
7. Log a `responses_api_call` audit event.

#### Non-Streaming Mode: `proxyResponsesJsonWithCredits()`

1. Forward the sanitized request to the provider URL.
2. Receive the full JSON response.
3. Parse the `usage` object: `input_tokens`, `output_tokens`.
4. Count `web_search_call` items in the `output` array.
5. Deduct credits based on usage.
6. Return the JSON response to the client.

#### Tool-Call Loop Handler

This is the core complexity of this section. The loop handles custom function tools (like `browser.execute_actions`) that appear as `function_call` items in the Responses API output.

**Critical distinction**:
- `web_search` is a **hosted/built-in tool** -- OpenAI executes it internally. The gateway only counts `web_search_call` items for cost tracking. It does NOT dispatch them.
- Custom function tools (e.g., `browser.execute_actions`) produce `function_call` items that the gateway must dispatch locally and send results back to OpenAI.

**Loop flow**:

```
1. Send request to OpenAI
2. Receive response
3. Check output for function_call items
4. If no function_call items -> done, return response
5. For each function_call:
   a. Dispatch to internal handler (e.g., POST /api/internal/tools/browser)
   b. Collect result (or error message)
   c. Build function_call_output item
6. Accumulate usage from this round
7. Check budget: accumulated_credits + estimated_next_round <= max_budget_credits
8. Check round count: current_round < MAX_TOOL_ROUNDS (10)
9. Check client connected: req.socket.destroyed === false
10. If any check fails -> stop loop, return partial results
11. Send new request to OpenAI with function_call_output items appended to input
12. Go to step 2
```

**Loop constraints**:
- `MAX_TOOL_ROUNDS = 10` (configurable via `system_settings` key `max_tool_rounds`, category `llm`)
- Per-request budget cap: `max_budget_credits` from request body, or default from `system_settings` key `max_credits_per_request_{tenantId}` (default 500)
- On tool call failure: send error output to OpenAI as `{ "error": "<message>" }` -- let the model decide to retry/skip
- On credit exhaustion mid-loop: stop loop, return partial results with `budget_exceeded: true` flag in response metadata
- On OpenAI error mid-loop: retry with exponential backoff (max 3), then abort with partial results
- On client disconnect (`req.on('close')`): abort loop, log partial usage, do not send further requests to OpenAI
- Socket timeout: 600 seconds (matching chat completions)
- Accumulate usage across all rounds (sum `input_tokens` and `output_tokens` from each round)

**Function tool dispatch**: The gateway dispatches function calls to internal routes. For `browser.execute_actions`, this means an internal HTTP call to `POST /api/internal/tools/browser` with the function arguments as the body, plus `X-Internal-Token` for auth. The dispatch function should be extensible (a registry/map of tool name to handler URL).

#### Usage Parsing for Responses API

The Responses API usage format:
```json
{
  "usage": {
    "input_tokens": 150,
    "output_tokens": 300,
    "total_tokens": 450
  }
}
```

Map to the existing `LLMUsageInfo` interface:
- `promptTokens` = `input_tokens`
- `completionTokens` = `output_tokens`
- `totalTokens` = `total_tokens`

#### Web Search Cost Tracking

- Count `web_search_call` items in the response output array (items with `type: "web_search_call"`)
- Cost: $0.01 per call ($10 per 1,000 calls)
- Log as a separate entry in `provider_usage_log` with `modelUsed: "web_search"` (distinct from the LLM model usage entry)
- Add the search cost to the total credit deduction for the request
- Use the existing `logCostRequest()` from `costTracker.ts` for the separate log entry

#### Budget Cap Implementation

```typescript
interface BudgetState {
  maxBudgetCredits: number;      // From request body or system_settings default
  accumulatedCredits: number;    // Sum of all rounds so far
  currentRound: number;          // Tool-call loop round counter
}

function isBudgetExceeded(state: BudgetState, estimatedNextRound: number): boolean {
  return state.accumulatedCredits + estimatedNextRound > state.maxBudgetCredits;
}
```

The `estimatedNextRound` is a rough estimate based on average tokens per round from previous rounds in this request.

### File: `apps/web/server/_core/llmRoutes.ts` (Modify)

Minimal changes to the existing file:

1. Import and call `registerResponsesRoutes(app)` inside `registerLLMRoutes()`.
2. Export any shared utilities needed by `responsesRoutes.ts`:
   - `resolveProviderModelAny()` -- model resolution
   - `resolveApiUrl()` -- API URL construction
   - `deductCreditsForUsage()` -- credit deduction
   - `parseUsageFromResponse()` -- usage parsing (may need adaptation for Responses API format)
   - `getActiveLlmProvider()` -- provider config fetching
   - `getLlmProviderById()` -- specific provider config
   - `guardWithCreditsOrInternalToken()` -- auth (from section-02)
   - `checkCredits()` -- credit balance check
   - Type exports: `LLMUsageInfo`, `LlmProviderConfig`, `ResolvedModel`

If these functions are not currently exported, add `export` to their declarations. This is a safe, non-breaking change since `llmRoutes.ts` is not imported by external packages.

### File: `apps/web/server/services/auditLogger.ts` (Minor modification)

Add new audit event types to the `AuditEventType` union:

```typescript
| "responses_api_call"
| "web_search_call"
| "browser_tool_call"
```

These are additive additions to the existing union type -- no existing code is affected.

---

## Endpoint Registration

The `/v1/responses` endpoint is registered with the same middleware stack as `/v1/chat/completions`:

```typescript
// Inside registerResponsesRoutes(app):
app.post(
  "/v1/responses",
  llmLimiter,                          // Same rate limiter
  enforceJsonBodyMaxBytes(MAX_LLM_BODY_BYTES),  // Same body size limit
  async (req: Request, res: Response) => {
    req.socket.setTimeout(600_000);    // 10 min timeout (matches chat completions)
    res.setTimeout(600_000);

    // Feature flag gating
    // Auth via guardWithCreditsOrInternalToken()
    // Sanitize body
    // Route to streaming or non-streaming handler
    // Handle tool-call loop if needed
  }
);
```

---

## Key Design Decisions

1. **Separate file** (`responsesRoutes.ts`): Keeps `llmRoutes.ts` manageable. The Responses API has fundamentally different event parsing and tool-call loop logic.

2. **Gateway handles the tool-call loop**: The loop must dispatch `browser.execute_actions` to the local Node browser tool route (`/api/internal/tools/browser`). The Python caller does not have direct access to this route. For stateless single-turn calls, callers use `/v1/chat/completions` directly.

3. **`web_search` is NOT dispatched**: OpenAI handles it internally. The gateway only counts occurrences for cost tracking. This is different from function tools.

4. **`store: false` default**: For ZDR (zero data retention) compliance, all requests default to `store: false`. This is enforced in `sanitizeResponsesBody()` regardless of what the client sends.

5. **Budget cap at gateway level**: Rather than trusting callers to self-limit, the gateway enforces a hard credit cap per request. This prevents runaway costs from long tool-call loops.

---

## Rollback Strategy

Disable the `responsesApi` feature flag (both global and per-tenant) and the endpoint returns 404. The separate file `responsesRoutes.ts` can also be unregistered by removing the import call in `llmRoutes.ts`. No existing endpoints are affected.

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/_core/responsesRoutes.ts` | **Created** | Responses API handler: sanitizer, streaming/JSON proxying, tool-call loop, web_search tracking, budget cap (~640 lines) |
| `apps/web/server/_core/llmRoutes.ts` | **Modified** | Import `registerResponsesRoutes`, call with deps injection inside `registerLLMRoutes()` |
| `apps/web/server/services/auditLogger.ts` | **Modified** | Added `responses_api_call`, `web_search_call`, `browser_tool_call` event types to AuditEventType union |
| `apps/web/server/__tests__/responsesRoutes.test.ts` | **Created** | 30 test cases covering sanitization, feature flags, non-streaming mode, tool-call loop, web_search tracking, budget cap, auth, audit logging |

## Implementation Deviations from Plan

1. **Dependency injection pattern**: Instead of importing internal functions directly from `llmRoutes.ts`, `registerResponsesRoutes` receives all dependencies as a `deps` parameter. This avoids circular imports and makes testing easier.
2. **No exponential backoff retry**: Deferred per code review. Current behavior returns partial results on upstream error, which is safe.
3. **No tools array validation**: Deferred to section-09 security audit.
4. **MAX_TOOL_ROUNDS / budget defaults hardcoded**: Not loaded from system_settings (deferred — hardcoded defaults are functional for MVP).
5. **Feature flags fail-closed**: Changed from plan's "fail open" to "fail closed" (return 500 on flag service error) per code review security fix.
6. **Tenant ID security**: Internal callers can specify tenant via X-Tenant-Id header; external callers always use "default" tenant (not user-controlled header).
7. **Streaming function call deduplication**: Added dedup by callId to prevent double-dispatch from both `response.output_item.done` and `response.completed` events.