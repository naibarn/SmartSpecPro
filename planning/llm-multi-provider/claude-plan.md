# Implementation Plan: LLM Multi-Provider System

## 1. Project Summary

SmartSpecPro currently routes all LLM requests through a single provider (OpenRouter) via `llmRoutes.ts`. The provider resolution logic (`getActiveLlmProvider()`) is duplicated in 4 files, there is no fallback mechanism, and dead code exists (`llm.ts`, `openaiCompatGateway.ts`).

This plan transforms the system into a multi-provider architecture:
- **OpenRouter** remains the primary provider for paid models
- **OpenCode Zen** is added as a secondary provider offering free models (Kimi K2.5, MiniMax M2.1, GLM 4.7) via `/v1/chat/completions`
- A routing layer selects the best provider per request based on cost, priority, and health
- A circuit breaker tracks provider health and removes unhealthy providers
- Fallback from free→paid models requires explicit user consent (never silent)
- Admin controls which providers/models are available; users see a smart default with override option
- Cost tracking feeds into admin and user dashboards

The existing credit system (1 credit = $0.001 USD) serves as budget control — no separate budget layer is needed. Free model requests cost 0 credits.

---

## 2. Architecture Overview

### Current Flow
```
Request → getActiveLlmProvider() → single provider → response → deduct credits
```

### New Flow
```
Request → llmRouter.resolveProvider(model, user) → provider candidates
  → circuit breaker filter → routing mode sort → attempt primary
  → on 429/5xx: fallback (same tier = transparent, cross-tier = ask user)
  → costTracker.log(request, response) → deduct credits (0 for free)
```

### New Service Layer
```
apps/web/server/services/
  llmRouter.ts        — Provider resolution, fallback chain, replaces 4 duplicated functions
  providerHealth.ts   — In-memory circuit breaker (healthy/degraded/down)
  costTracker.ts      — Request logging, dashboard aggregation
```

All three are pure async functions (matching existing service pattern). No classes.

---

## 3. Database Changes

### 3.1 Extend `llm_providers` Table

Add columns to the existing table:

- `providerType` (VARCHAR, default 'primary') — classification: 'primary', 'secondary', 'fallback'
- `healthStatus` (VARCHAR, default 'healthy') — 'healthy', 'degraded', 'down' (managed by circuit breaker at runtime, persisted for dashboard visibility)
- `lastHealthCheck` (TIMESTAMPTZ, nullable)
- `failureCount` (INTEGER, default 0) — rolling failure count
- `successCount` (INTEGER, default 0) — rolling success count

### 3.2 New Table: `model_provider_map`

Maps which providers offer which models. This replaces the `availableModels` JSON column approach with a queryable relational structure.

Fields:
- `id` (SERIAL PK)
- `modelId` (VARCHAR 128) — canonical model identifier, e.g. "kimi-k2.5-free"
- `providerId` (INTEGER FK → llm_providers.id)
- `modelName` (VARCHAR 128) — human-readable display name
- `providerModelId` (VARCHAR 256) — the provider-specific model string sent in API requests (e.g., "anthropic/claude-3.5-sonnet" for OpenRouter, "kimi-k2.5" for Zen). This is what gets sent to the upstream API. `modelId` is the canonical internal ID used by frontend/routing.
- `pricingInput` (NUMERIC 12,8) — cost per 1M input tokens (0 for free)
- `pricingOutput` (NUMERIC 12,8) — cost per 1M output tokens (0 for free)
- `isFree` (BOOLEAN, default false)
- `contextLength` (INTEGER)
- `isEnabled` (BOOLEAN, default true)
- `priority` (INTEGER, default 0) — lower = higher priority within this provider

Unique constraint on (modelId, providerId).

### 3.3 New Table: `provider_usage_log`

Per-request tracking for dashboards and cost reconciliation.

Fields:
- `id` (SERIAL PK)
- `userId` (INTEGER FK → users.id)
- `providerId` (INTEGER FK → llm_providers.id)
- `modelUsed` (VARCHAR 128)
- `inputTokens` (INTEGER)
- `outputTokens` (INTEGER)
- `costUsd` (NUMERIC 12,8) — provider-reported or calculated
- `creditsCharged` (INTEGER)
- `responseTimeMs` (INTEGER)
- `statusCode` (INTEGER)
- `errorType` (VARCHAR 64, nullable) — 'rate_limit', 'timeout', 'server_error'
- `wasFallback` (BOOLEAN, default false)
- `fallbackFromProviderId` (INTEGER FK, nullable)
- `createdAt` (TIMESTAMPTZ, default NOW())

Indexes: `(userId, createdAt)`, `(providerId, createdAt)` for dashboard aggregation queries. Retention policy (e.g., aggregate and purge after 90 days) is out of scope for this phase but the schema supports it.

### 3.4 New Table: `routing_rules`

Admin-configured routing preferences per model pattern.

Fields:
- `id` (SERIAL PK)
- `modelPattern` (VARCHAR 128) — glob-style: "*", "kimi-*", or exact model ID. Precedence: exact match > prefix glob (e.g., "kimi-*") > wildcard ("*"). Multiple rules matching the same model are resolved by most-specific-first. Matching is done application-side (load all active rules, filter in code).
- `routingMode` (VARCHAR 32) — 'cost', 'quality', 'priority'
- `providerOrder` (JSON) — array of provider IDs for priority mode
- `maxFallbacks` (INTEGER, default 3)
- `isActive` (BOOLEAN, default true)
- `createdAt` (TIMESTAMPTZ, default NOW())

### 3.5 Migration Strategy

Use Drizzle ORM migration (`drizzle-kit generate` then `drizzle-kit migrate`). Schema defined in `apps/web/drizzle/schema.ts`.

Seed data: After migration, insert OpenCode Zen provider row and model_provider_map entries for the 3 free models using idempotent inserts (ON CONFLICT DO NOTHING). Existing OpenRouter data remains untouched.

---

## 4. Provider Health & Circuit Breaker (`providerHealth.ts`)

### 4.1 In-Memory State

A `Map<number, ProviderHealthState>` keyed by provider ID. Each entry tracks:
- `successCount`, `failureCount` (rolling, reset periodically)
- `lastFailureAt` (timestamp)
- `status`: 'healthy' | 'degraded' | 'down'
- `cooldownUntil` (timestamp, null if not in cooldown)

### 4.2 Health Transitions

- **healthy → degraded**: Failure rate exceeds 5% (minimum 10 requests in window)
- **degraded → down**: Failure rate exceeds 20%
- **down → healthy**: After cooldown period (60 seconds), next request succeeds
- **degraded → healthy**: Failure rate drops below 5%

### 4.3 Interface

```typescript
function recordSuccess(providerId: number): void
function recordFailure(providerId: number, errorType: string): void
function getHealthStatus(providerId: number): 'healthy' | 'degraded' | 'down'
function isAvailable(providerId: number): boolean
  // true if healthy or degraded, false if down (unless cooldown expired)
function getHealthSummary(): Map<number, ProviderHealthState>
  // For admin dashboard
```

### 4.4 Persistence

Health state is primarily in-memory. On startup, seed the in-memory state from `llm_providers.healthStatus` to avoid hitting a known-down provider until enough failures accumulate. The `llm_providers.healthStatus` column is updated periodically (every 60s or on state change) for dashboard display and startup seeding.

---

## 5. LLM Router (`llmRouter.ts`)

This is the core new service. It replaces all 4 duplicated `getActiveLlmProvider()` calls.

### 5.1 Provider Resolution

```typescript
function resolveProviders(modelId: string): Promise<ProviderCandidate[]>
```

1. Query `model_provider_map` JOIN `llm_providers` WHERE modelId matches AND both are enabled
2. Filter by circuit breaker health (exclude 'down' providers unless cooldown expired)
3. Sort by routing rule:
   - **cost mode**: Sort by `pricingInput + pricingOutput` ascending (free first)
   - **quality mode**: Sort by success rate descending, then latency
   - **priority mode**: Use admin-configured `providerOrder` from routing_rules
4. Return ordered list of candidates with decrypted API keys

### 5.2 Request Execution with Fallback

```typescript
type ExecuteResult =
  | { type: 'success'; response: LLMResponse; providerId: number }
  | { type: 'fallback_required'; from: ProviderCandidate; to: ProviderCandidate; estimatedCredits: number }
  | { type: 'error'; error: string; statusCode: number }

function executeWithFallback(params: {
  model: string
  messages: Message[]
  stream: boolean
  userId: number
  conversationId?: number
  preferredProvider?: number  // provider ID override (from fallback consent retry)
}): Promise<ExecuteResult>
```

Returns a discriminated union. When fallback crosses the free/paid boundary, the function returns `{type: 'fallback_required'}` instead of attempting the paid provider. The HTTP handler returns this to the client, which can re-send with `preferredProvider` set. The retry request re-validates credits and provider health.

**Fallback logic:**
1. If `preferredProvider` is set, use that provider directly (skip routing)
2. Otherwise, get ordered provider candidates via `resolveProviders()`
3. Attempt primary provider
4. On success: `providerHealth.recordSuccess()`, `costTracker.log()`, return `{type: 'success'}`
5. On fallback-eligible error (429, 5xx, timeout):
   - `providerHealth.recordFailure()`
   - Check if next candidate crosses free→paid boundary
   - If crossing: return `{type: 'fallback_required', from, to, estimatedCredits}`
   - If same tier: proceed transparently
   - Attempt next provider (up to `maxFallbacks` from routing rule, default 3)
6. On client error (400-level except 429): do NOT fallback — return `{type: 'error'}` immediately

### 5.3 Streaming Fallback

- **Pre-stream** (before first SSE chunk is sent to client): Transparent retry on next provider. Client doesn't know.
- **Mid-stream** (after chunks sent): Cannot seamlessly switch. Send SSE error event, let frontend handle retry with user consent.

Implementation detail: The router buffers the upstream response until either (a) the first data chunk arrives (confirming provider is responding) or (b) an error occurs or (c) a "first chunk timeout" expires (configurable per provider via `configJson.firstChunkTimeoutMs`, default 10 seconds). Only after the first chunk does it start piping to the client response. This enables transparent pre-stream fallback. Timeout configuration (request timeout, first-chunk timeout) is stored in `llm_providers.configJson` and can differ per provider.

### 5.4 Backward Compatibility

When only one provider is configured (e.g., just OpenRouter), the router behaves identically to the current `getActiveLlmProvider()` + `proxyChatWithCredits()` flow. No fallback logic is triggered. Credit deduction remains the same.

---

## 6. Cost Tracker (`costTracker.ts`)

### 6.1 Request Logging

```typescript
function logRequest(params: {
  userId: number
  providerId: number
  modelUsed: string
  inputTokens: number
  outputTokens: number
  costUsd: number
  creditsCharged: number
  responseTimeMs: number
  statusCode: number
  errorType?: string
  wasFallback: boolean
  fallbackFromProviderId?: number
}): Promise<void>
```

Inserts into `provider_usage_log`. Called by `llmRouter` after every provider attempt (including failures, for tracking).

### 6.2 Cost Calculation

Priority (unchanged from current):
1. Provider-reported cost (`usage.cost` from OpenRouter) — preferred
2. Model pricing from `model_provider_map` table — replaces hardcoded `MODEL_PRICING`
3. Fallback to default pricing (1.00/4.00 per 1M tokens)

For free models: cost = 0, credits = 0. The `creditService.ts` must be updated to check `isFree` from `model_provider_map` before calculating.

### 6.3 Dashboard Aggregation

```typescript
function getAdminUsageStats(filters: { dateRange, providerId?, userId? }): Promise<UsageStats>
function getUserUsageStats(userId: number, dateRange: DateRange): Promise<UserUsageStats>
```

These query `provider_usage_log` with aggregation:
- Admin: total requests, total cost, cost per provider, cost per model, error rates, top users
- User: own requests, own cost, models used, credits consumed

---

## 7. Credit Service Updates

### 7.1 Free Model Handling

Update `creditService.ts`:
- Before deducting credits, check if the model is marked `isFree` in `model_provider_map`
- If free: skip credit deduction, still log to `credit_transactions` with amount=0 and metadata noting it was a free model
- `checkCredits()` should still run (even for free models) to validate user is authenticated, but skip the balance check for free models

### 7.2 Dynamic Model Pricing

Replace hardcoded `MODEL_PRICING` object with a lookup from `model_provider_map.pricingInput/pricingOutput`. Fall back to the hardcoded table for models not in the map (backward compat during migration).

---

## 8. Refactoring: Consolidate Provider Resolution

### 8.1 Files to Update

Replace the duplicated `getActiveLlmProvider()` pattern in:
1. `llmRoutes.ts` — Replace with `llmRouter.resolveProviders()` + `llmRouter.executeWithFallback()`
2. `routers/skills.ts` — Replace inline provider query with `llmRouter.resolveProviders()`
3. `routers/translation.ts` — Same
4. `services/scheduler.ts` — Same

Each callsite currently does:
```
const provider = await getActiveLlmProvider()
// use provider.baseUrl, provider.apiKey
```

After refactoring, they call:
```
const providers = await llmRouter.resolveProviders(modelId)
// or use llmRouter.executeWithFallback() for the full chain
```

### 8.2 Dead Code Removal

Delete:
- `apps/web/server/_core/llm.ts` — `invokeLLM()` throws errors, never called
- `apps/web/server/_core/openaiCompatGateway.ts` — `registerOpenAICompatRoutes()` never registered

---

## 9. `llmRoutes.ts` Changes

This is the largest file change. The current `proxyChatWithCredits()` function handles provider resolution, request proxying, streaming, and credit deduction all in one function.

### 9.1 Decomposition

Split `proxyChatWithCredits()` into:
1. **Provider resolution**: Delegate to `llmRouter.resolveProviders()`
2. **Request execution**: Delegate to `llmRouter.executeWithFallback()`
3. **Credit deduction**: Remains in `llmRoutes.ts` but calls updated `creditService`
4. **Usage logging**: New call to `costTracker.logRequest()`

The HTTP endpoint handlers (`/api/llm/stream`, `/api/llm/chat`, `/v1/chat/completions`) remain in `llmRoutes.ts` but become thinner — they parse the request, call the router, and format the response.

### 9.2 Streaming Endpoint Changes

`/api/llm/stream` currently does byte-for-byte relay. With multi-provider:
1. Call `llmRouter.executeWithFallback()` with `stream: true`
2. The router handles pre-stream fallback internally (buffering until first chunk)
3. Once a provider starts streaming, the response is piped to the client as before
4. On mid-stream failure: router sends an SSE error event (`event: provider_error`) with data indicating the failure
5. Frontend can then retry (new request) or show error to user

### 9.3 Brainstorm Mode

Brainstorm calls the LLM twice per round (two different models). Each call goes through `llmRouter.executeWithFallback()` independently. No special handling needed — each model resolves its own provider chain.

---

## 10. tRPC Router Updates (`llmProviders.ts`)

### 10.1 New Endpoints

Add to the existing `llmProviders` tRPC router:

**Admin procedures:**
- `llmProviders.listModelMappings` — Query: list all model_provider_map entries grouped by model
- `llmProviders.upsertModelMapping` — Mutation: add/update a model-provider mapping
- `llmProviders.deleteModelMapping` — Mutation: remove a mapping
- `llmProviders.listRoutingRules` — Query: list all routing rules
- `llmProviders.upsertRoutingRule` — Mutation: add/update a routing rule
- `llmProviders.deleteRoutingRule` — Mutation: remove a rule
- `llmProviders.getProviderHealth` — Query: get health status of all providers
- `llmProviders.getAdminUsageStats` — Query: aggregated usage data for dashboard

**User procedures:**
- `llmProviders.getAvailableModelsWithProviders` — Query: list models with their provider options and pricing (replaces current `availableModels` query)
- `llmProviders.getUserUsageStats` — Query: user's own usage data

### 10.2 Existing Endpoint Changes

- `llmProviders.update` — Add support for new columns (providerType, etc.)
- `llmProviders.list` — Include healthStatus in response

---

## 11. Frontend Changes

### 11.1 Model Selector Enhancement (`ChatView.tsx`)

The current model selector shows a flat list of models. Change to:
- Group models by category (or keep flat, but add provider badge)
- Each model entry shows: model name, provider name, "FREE" badge if applicable, estimated cost per 1K tokens
- Default selection: cheapest provider (auto-selected)
- "Change provider" link/button next to selected model → opens popover/dropdown showing all providers for that model with pricing comparison
- Selected provider stored alongside model in conversation state

### 11.2 Fallback Consent UI

When `llmRouter` returns a "fallback required" response (free model failed, paid alternative available):
- Show an inline banner in the chat area: "⚡ [Model] is temporarily unavailable. Use [Alternative] via [Provider] for ~X credits?"
- Two buttons: "Switch" (proceeds with paid model) and "Cancel" (aborts request)
- If user clicks "Switch": re-send the request with the specified provider override
- The frontend sends a `preferredProvider` field in the request body to override routing

### 11.3 Admin Page Updates (`AdminLLMProviders.tsx`)

**Provider List:**
- Add health status indicator (green dot = healthy, yellow = degraded, red = down)
- Add `providerType` badge
- Add quick stats: requests today, error rate, avg latency

**New Tab/Section: Model Mappings**
- Table: model ID, provider, pricing (input/output), free?, enabled?, priority
- Add/edit/delete model-provider mappings
- Bulk import from provider's model list (optional, nice-to-have)

**New Tab/Section: Routing Rules**
- Table: model pattern, routing mode, provider order, max fallbacks, active?
- Add/edit/delete rules

**New Tab/Section: Usage Dashboard**
- Date range picker
- Charts: requests over time (by provider), cost over time (by provider), error rate
- Table: top models by usage, top users by cost
- Uses `getAdminUsageStats` tRPC query

### 11.4 User Usage Section

Add a "Usage" section (could be in profile or sidebar):
- Credits used this month
- Breakdown by model
- Number of requests
- Uses `getUserUsageStats` tRPC query

---

## 12. Request Flow (End-to-End, After Implementation)

### 12.1 Chat Message Flow
```
1. User sends message (ChatView.onSend)
2. Frontend POST /api/llm/stream {model, messages, preferredProvider?}
3. llmRoutes handler:
   a. checkCredits(user) — skip balance check if model is free
   b. llmRouter.executeWithFallback({model, messages, stream: true, userId, preferredProvider?})
      i.   resolveProviders(model) → [provider1, provider2, ...]
      ii.  Try provider1: fetch(provider1.baseUrl + '/v1/chat/completions', {...})
      iii. If 429/5xx: recordFailure(), check tier boundary, try provider2
      iv.  If success: recordSuccess(), start streaming to client
   c. Accumulate response (content + usage tokens)
   d. costTracker.logRequest({...})
   e. deductCreditsForUsage() — 0 if free model
   f. Save message to DB
   g. Send event: message_saved
```

### 12.2 Fallback Consent Flow
```
1. Free model (Zen) returns 429
2. Router returns {type: 'fallback_required', from: zenProvider, to: openrouterProvider, estimatedCredits: N}
3. llmRoutes handler:
   - For streaming: send SSE event `event: fallback_required\ndata: {"from": "zen", "to": "openrouter", "estimatedCredits": N}\n\n`
   - For JSON: return HTTP 200 with {fallbackRequired: true, from, to, estimatedCredits}
4. Frontend shows consent banner
5. User clicks "Switch"
6. Frontend re-sends request with preferredProvider: openrouterProviderId
7. Router uses OpenRouter directly (preferredProvider override), re-validates credits and health
```

---

## 13. Implementation Order

### Phase 1: Foundation
1. Database schema changes (new tables + columns in schema.ts, generate migration)
2. `providerHealth.ts` — circuit breaker service
3. `costTracker.ts` — usage logging service
4. `llmRouter.ts` — provider resolution + fallback chain

### Phase 2: Integration
5. Update `creditService.ts` — free model handling, dynamic pricing
6. Refactor `llmRoutes.ts` — use llmRouter, decompose proxyChatWithCredits
7. Refactor `skills.ts`, `translation.ts`, `scheduler.ts` — use shared llmRouter
8. Remove dead code (`llm.ts`, `openaiCompatGateway.ts`)

### Phase 3: tRPC & Frontend
9. Add new tRPC endpoints in `llmProviders.ts`
10. Update model selector in `ChatView.tsx`
11. Add fallback consent UI
12. Update `AdminLLMProviders.tsx` — health, model mappings, routing rules, usage dashboard
13. Add user usage section

### Phase 4: Seed & Test
14. Seed OpenCode Zen provider + free model mappings
15. End-to-end testing: single provider, multi-provider, fallback, free→paid consent
16. Backward compatibility verification: all existing features work unchanged

---

## 14. Risk Mitigation

### 14.1 OpenCode Zen Reliability
Free models are in "limited beta" — they may disappear. The system must gracefully handle a provider becoming entirely unavailable (circuit breaker marks it down, routing skips it).

### 14.2 Streaming Fallback Complexity
Mid-stream fallback is inherently unreliable. The plan uses a buffer-until-first-chunk approach for pre-stream fallback (transparent) and an error-event approach for mid-stream failures (user-visible). This keeps complexity manageable.

### 14.3 Backward Compatibility
The router is designed so that with a single provider configured, behavior is identical to the current system. The refactoring can be validated by running the existing test suite with only OpenRouter enabled.

### 14.4 Data Privacy
Free models (Zen) may use data for training. The admin controls which models are enabled — this is documented in the admin UI. No per-user privacy toggle is needed (interview decision).
