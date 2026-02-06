# Section 04: LLM Router

## Overview

This section implements `llmRouter.ts`, the core routing service that replaces all 4 duplicated `getActiveLlmProvider()` calls across the codebase. It resolves which provider(s) can serve a given model, executes requests with automatic fallback, and handles the free-to-paid boundary crossing consent flow.

The service is implemented as pure async functions (no classes).

**Dependencies:** Section 01 (schema), Section 02 (providerHealth).
**Blocks:** Section 06 (llmRoutes), Section 07 (refactor consolidation).

---

## Tests First

File: `apps/web/server/services/llmRouter.test.ts`

### Provider Resolution
- **Test: `resolveProviders()` returns providers sorted by cost when routing mode is 'cost'** -- Free providers appear first, then sorted by `pricingInput + pricingOutput` ascending.
- **Test: `resolveProviders()` excludes 'down' providers** -- A provider with health status 'down' (and active cooldown) is not in the results.
- **Test: `resolveProviders()` includes 'down' provider if cooldown expired** -- A 'down' provider past its cooldown period appears in results for a probe request.
- **Test: `resolveProviders()` returns empty array when no providers match model** -- A model with no entries in `model_provider_map` yields an empty list.
- **Test: `resolveProviders()` uses `providerModelId` (not `modelId`) in upstream request** -- The returned candidates include the `providerModelId` for constructing the upstream API call.
- **Test: Routing rule precedence: exact match wins over glob over wildcard** -- When multiple `routing_rules` match, the most specific one determines routing mode.

### Request Execution with Fallback
- **Test: Successful primary provider returns `{type: 'success'}`** -- When the first provider responds successfully, the result type is 'success' with the response and provider ID.
- **Test: 429 from primary triggers fallback to next same-tier provider (transparent)** -- A rate-limit error causes transparent fallback to another provider in the same free/paid tier.
- **Test: 5xx from primary triggers fallback** -- Server errors are fallback-eligible.
- **Test: Free->paid boundary crossing returns `{type: 'fallback_required'}` with estimated credits** -- When all free providers fail and only paid providers remain, the router stops and returns a consent request.
- **Test: `preferredProvider` override skips routing, uses specified provider directly** -- When the caller specifies a provider (from consent retry), routing is bypassed.
- **Test: 400-level errors (except 429) do NOT trigger fallback, return `{type: 'error'}`** -- Client errors like 400, 401, 403 are not retriable.
- **Test: Max fallback attempts respected (default 3)** -- After 3 failed fallback attempts, return an error.
- **Test: All providers failing returns `{type: 'error'}`** -- When every candidate fails, return a final error.
- **Test: `recordSuccess()` called on success, `recordFailure()` called on failure** -- The circuit breaker is updated after each attempt.

### Streaming Fallback
- **Test: Pre-stream failure (before first chunk) triggers transparent fallback** -- If the provider fails before sending any data, the next provider is tried without the client knowing.
- **Test: First-chunk timeout triggers fallback** -- If no data arrives within the timeout (default 10s, configurable per provider), fallback occurs.
- **Test: Mid-stream failure sends SSE error event** -- After chunks have been sent to the client, a failure emits an `event: provider_error` SSE event.
- **Test: Buffer releases to client after first successful chunk** -- The router holds the response until confirmed working, then pipes through.

### Backward Compatibility
- **Test: Single provider configured behaves identically to legacy `getActiveLlmProvider()`** -- With only one provider, no fallback logic fires.
- **Test: No fallback logic triggered with single provider** -- The router resolves a single candidate and uses it directly.

---

## Implementation Details

### File Path

`apps/web/server/services/llmRouter.ts`

### Provider Resolution

```typescript
interface ProviderCandidate {
  providerId: number
  providerName: string
  baseUrl: string
  apiKey: string                // decrypted
  providerModelId: string      // what to send to the upstream API
  pricingInput: number
  pricingOutput: number
  isFree: boolean
  priority: number
}

function resolveProviders(modelId: string): Promise<ProviderCandidate[]>
```

Resolution steps:
1. Query `model_provider_map` JOIN `llm_providers` WHERE `modelId` matches AND both `model_provider_map.isEnabled` and `llm_providers.isEnabled` are true.
2. Filter by circuit breaker health via `providerHealth.isAvailable(providerId)` -- excludes 'down' providers unless cooldown expired.
3. Load matching routing rule from `routing_rules` table. Match precedence: exact `modelId` match > prefix glob (e.g., `"kimi-*"`) > wildcard (`"*"`). Load all active rules, filter in application code.
4. Sort candidates based on routing mode from the matched rule:
   - **cost mode**: Sort by `pricingInput + pricingOutput` ascending (free first)
   - **quality mode**: Sort by success rate descending (from providerHealth), then by latency
   - **priority mode**: Use admin-configured `providerOrder` array from the routing rule
5. Return ordered list with decrypted API keys.

### Request Execution with Fallback

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

**Fallback logic:**

1. If `preferredProvider` is set, use that provider directly (skip routing). Re-validate that the provider is healthy and the user has sufficient credits.
2. Otherwise, call `resolveProviders(model)` to get ordered candidates.
3. Attempt primary provider (first candidate).
4. On success: call `providerHealth.recordSuccess()`, return `{type: 'success'}`.
5. On fallback-eligible error (HTTP 429, 5xx, or timeout):
   - Call `providerHealth.recordFailure()`.
   - Check if the next candidate crosses the free-to-paid boundary (current candidate `isFree === true`, next candidate `isFree === false`).
   - If crossing tier boundary: return `{type: 'fallback_required', from, to, estimatedCredits}`. The HTTP handler sends this to the client for consent.
   - If same tier: proceed transparently to next candidate.
   - Continue up to `maxFallbacks` from the routing rule (default 3).
6. On client error (400, 401, 403 -- anything 400-level except 429): do NOT fallback. Return `{type: 'error'}` immediately.
7. If all candidates exhausted: return `{type: 'error'}`.

### Streaming Fallback

For streaming requests (`stream: true`), the router uses a buffer-until-first-chunk strategy:

- The router makes the upstream request and buffers the response.
- It waits for either: (a) the first data chunk arrives, (b) an error occurs, or (c) the first-chunk timeout expires.
- The first-chunk timeout is configurable per provider via `llm_providers.configJson.firstChunkTimeoutMs` (default 10 seconds).
- **Pre-stream fallback** (before first chunk sent to client): If the provider fails or times out before any chunk, transparently retry on the next provider. The client is unaware.
- **Mid-stream failure** (after chunks have been piped to the client): Cannot seamlessly switch. Send an SSE error event (`event: provider_error`) and let the frontend handle retry with user consent.
- Once the first chunk is confirmed, start piping the upstream response directly to the client response.

### Backward Compatibility

When only one provider is configured (e.g., just OpenRouter), the router resolves a single candidate. No fallback logic triggers. Credit deduction works the same as the current `getActiveLlmProvider()` + `proxyChatWithCredits()` flow. This ensures a safe, incremental rollout.
