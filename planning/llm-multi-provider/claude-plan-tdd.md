# TDD Plan: LLM Multi-Provider System

Testing framework: **Vitest** with `vi.mock()`, co-located `.test.ts` files, context factories (`createPublicContext`, `createUserContext`, `createAdminContext`), tRPC `createCaller(context)`.

---

## 3. Database Changes

### 3.1-3.5 Schema & Migration
- Test: New tables (`model_provider_map`, `provider_usage_log`, `routing_rules`) are created by migration
- Test: `llm_providers` has new columns (`providerType`, `healthStatus`, `lastHealthCheck`, `failureCount`, `successCount`)
- Test: `model_provider_map` unique constraint on (modelId, providerId) rejects duplicates
- Test: Seed data inserts are idempotent (running twice doesn't error)
- Test: Foreign key constraints on `provider_usage_log` → `users`, `llm_providers`

---

## 4. Provider Health & Circuit Breaker (`providerHealth.ts`)

### 4.1-4.2 Health State Transitions
- Test: New provider defaults to 'healthy'
- Test: Recording failures below 5% rate keeps status 'healthy' (with 10+ requests)
- Test: Recording failures above 5% rate transitions to 'degraded'
- Test: Recording failures above 20% rate transitions to 'down'
- Test: 'down' provider returns `isAvailable() = false`
- Test: 'down' provider with expired cooldown returns `isAvailable() = true`
- Test: Successful request after cooldown transitions 'down' → 'healthy'
- Test: Failure rate dropping below 5% transitions 'degraded' → 'healthy'
- Test: `getHealthSummary()` returns all tracked providers

### 4.4 Persistence
- Test: On startup, `initFromDb()` seeds in-memory state from `llm_providers.healthStatus`
- Test: Provider marked 'down' in DB starts as 'down' in memory
- Test: `persistHealth()` writes current status to `llm_providers.healthStatus`

---

## 5. LLM Router (`llmRouter.ts`)

### 5.1 Provider Resolution
- Test: `resolveProviders()` returns providers sorted by cost when routing mode is 'cost'
- Test: `resolveProviders()` excludes 'down' providers
- Test: `resolveProviders()` includes 'down' provider if cooldown expired
- Test: `resolveProviders()` returns empty array when no providers match model
- Test: `resolveProviders()` uses `providerModelId` (not `modelId`) in upstream request
- Test: Routing rule precedence: exact match wins over glob over wildcard

### 5.2 Request Execution with Fallback
- Test: Successful primary provider returns `{type: 'success'}`
- Test: 429 from primary triggers fallback to next same-tier provider (transparent)
- Test: 5xx from primary triggers fallback
- Test: Free→paid boundary crossing returns `{type: 'fallback_required'}` with estimated credits
- Test: `preferredProvider` override skips routing, uses specified provider directly
- Test: 400-level errors (except 429) do NOT trigger fallback, return `{type: 'error'}`
- Test: Max fallback attempts respected (default 3)
- Test: All providers failing returns `{type: 'error'}`
- Test: `recordSuccess()` called on success, `recordFailure()` called on failure

### 5.3 Streaming Fallback
- Test: Pre-stream failure (before first chunk) triggers transparent fallback
- Test: First-chunk timeout triggers fallback
- Test: Mid-stream failure sends SSE error event
- Test: Buffer releases to client after first successful chunk

### 5.4 Backward Compatibility
- Test: Single provider configured behaves identically to legacy `getActiveLlmProvider()`
- Test: No fallback logic triggered with single provider

---

## 6. Cost Tracker (`costTracker.ts`)

### 6.1 Request Logging
- Test: `logRequest()` inserts row into `provider_usage_log`
- Test: Failed requests logged with `errorType` and `statusCode`
- Test: Fallback requests logged with `wasFallback: true` and `fallbackFromProviderId`

### 6.2 Cost Calculation
- Test: Provider-reported cost (usage.cost) used when available
- Test: Model pricing from `model_provider_map` used as fallback
- Test: Default pricing (1.00/4.00) used when model not in map
- Test: Free model returns cost = 0

### 6.3 Dashboard Aggregation
- Test: `getAdminUsageStats()` aggregates by provider, model, date range
- Test: `getUserUsageStats()` returns only the specified user's data
- Test: Date range filtering works correctly

---

## 7. Credit Service Updates

### 7.1 Free Model Handling
- Test: Free model skips credit deduction (amount=0)
- Test: Free model still logs to `credit_transactions` with metadata `{freeModel: true}`
- Test: `checkCredits()` skips balance check for free models but still validates auth
- Test: Paid model deduction unchanged from current behavior

### 7.2 Dynamic Model Pricing
- Test: Pricing lookup from `model_provider_map` used when model exists in map
- Test: Hardcoded `MODEL_PRICING` fallback used when model not in map
- Test: Price changes in DB reflected without restart (cache invalidation or no-cache)

---

## 8. Refactoring: Consolidate Provider Resolution

### 8.1 Files to Update
- Test: `skills.ts` uses `llmRouter.resolveProviders()` (mock llmRouter, verify call)
- Test: `translation.ts` uses `llmRouter.resolveProviders()`
- Test: `scheduler.ts` uses `llmRouter.resolveProviders()`
- Test: No direct DB query for provider in any of these files

### 8.2 Dead Code Removal
- Test: `llm.ts` is deleted (import should fail)
- Test: `openaiCompatGateway.ts` is deleted

---

## 9. `llmRoutes.ts` Changes

### 9.1-9.2 Endpoint Decomposition
- Test: `/api/llm/stream` returns SSE stream on success
- Test: `/api/llm/stream` returns `event: fallback_required` SSE when tier crossing
- Test: `/api/llm/stream` with `preferredProvider` uses override
- Test: `/api/llm/chat` returns JSON response on success
- Test: `/api/llm/chat` returns fallback_required JSON when tier crossing
- Test: `/v1/chat/completions` OpenAI-compat endpoint works with router
- Test: Credit deduction called after successful response
- Test: `costTracker.logRequest()` called after every attempt

### 9.3 Brainstorm Mode
- Test: Each model in brainstorm resolves its own provider chain independently
- Test: Credits deducted per model output (unchanged behavior)

---

## 10. tRPC Router Updates (`llmProviders.ts`)

### 10.1 New Endpoints
- Test: `listModelMappings` returns all mappings grouped by model (admin only)
- Test: `upsertModelMapping` creates new mapping
- Test: `upsertModelMapping` updates existing mapping
- Test: `deleteModelMapping` removes mapping
- Test: `listRoutingRules` returns all active rules
- Test: `upsertRoutingRule` validates modelPattern format
- Test: `getProviderHealth` returns health status for all providers
- Test: `getAdminUsageStats` returns aggregated data (admin only)
- Test: `getAvailableModelsWithProviders` returns models with pricing (user procedure)
- Test: `getUserUsageStats` returns only calling user's data

### 10.2 Auth Guards
- Test: Admin endpoints reject non-admin users
- Test: User endpoints reject unauthenticated requests

---

## 11. Frontend Changes

### 11.1 Model Selector
- Test: Model list shows provider name and "FREE" badge for free models
- Test: Selecting model stores both model and provider in conversation state
- Test: Default selection is cheapest provider

### 11.2 Fallback Consent UI
- Test: `event: fallback_required` SSE triggers consent banner
- Test: "Switch" button re-sends request with `preferredProvider`
- Test: "Cancel" button aborts and shows error message

### 11.3-11.4 Admin & User Pages
- Test: Provider health indicators render correct colors (green/yellow/red)
- Test: Model mapping CRUD operations work via tRPC
- Test: Routing rule CRUD operations work via tRPC
- Test: Usage dashboard renders with date range filter
