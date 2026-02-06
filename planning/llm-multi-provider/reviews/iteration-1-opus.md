# Opus Review

**Model:** claude-opus-4-5-20251101
**Generated:** 2026-02-03T00:00:00Z

---

## Review: LLM Multi-Provider Implementation Plan

### 1. Race Condition in Fallback Consent Flow (Section 12.2)

The fallback consent flow requires a full HTTP round-trip: the server returns a `{fallbackRequired: true}` response, the frontend shows a banner, the user clicks "Switch", and a new request is sent. Between the original failure and the retry, the paid provider could also be down, the user's credits could have changed, or another request could have consumed remaining credits. The plan does not address this window. The retry request should re-validate credits and provider health, not assume the state from the first attempt is still valid.

Additionally, for streaming requests (`/api/llm/stream`), the plan says the router returns a "special response" when fallback is required (Section 12.2, step 4a). But the streaming endpoint uses SSE -- returning a JSON object `{fallbackRequired: true}` breaks the SSE protocol unless it is sent as a typed SSE event. The plan should specify the exact SSE event format (e.g., `event: fallback_required\ndata: {...}\n\n`).

### 2. In-Memory Circuit Breaker Lost on Restart (Section 4.4)

The plan acknowledges health state is lost on restart and says it "recovers within minutes." This is optimistic. If a provider is genuinely down and the app restarts, all users will hit the broken provider again until enough failures accumulate. With the threshold at "minimum 10 requests in 5% failure window," that means at least 10 requests must fail before the circuit breaker kicks in. For a low-traffic deployment, this could take much longer than minutes. Consider seeding the in-memory state from `llm_providers.healthStatus` on startup.

### 3. No Timeout Configuration

The plan mentions timeout as a fallback-eligible error (Section 5.2, step 4) but never defines what the timeout values are, whether they are per-provider configurable, or how they differ for streaming vs. non-streaming requests. Streaming requests to slow free models could have very different latency profiles than paid models. This needs explicit configuration, likely as a column on `llm_providers` or `model_provider_map`.

### 4. `provider_usage_log` Table Will Grow Unbounded (Section 3.3)

Every LLM request (including failures) inserts a row. There is no retention policy, partitioning strategy, or cleanup mechanism mentioned. For a moderately active deployment, this table will become the largest in the database. The plan should specify either: time-based partitioning, a cleanup job (e.g., aggregate and purge after 90 days), or at minimum an index strategy beyond the implicit PK.

Missing indexes: queries in `costTracker.ts` (Section 6.3) filter by `userId`, `providerId`, `createdAt`, and date ranges. Without explicit indexes on `(userId, createdAt)` and `(providerId, createdAt)`, the dashboard aggregation queries will degrade as the table grows.

### 5. `routing_rules` Glob Matching is Underspecified (Section 3.4)

The `modelPattern` field supports "glob-style: `*`, `kimi-*`, or exact model ID." But:
- What happens when multiple rules match a model? The plan does not define precedence (most-specific-first? lowest ID? most recently created?).
- Who implements the glob matching? Standard SQL `LIKE` does not support globs. This requires either application-level matching (load all rules and filter) or a specific SQL pattern. This should be specified.

### 6. `onFallbackRequired` Callback Does Not Work for HTTP Endpoints (Section 5.2)

The `executeWithFallback` function accepts an `onFallbackRequired` callback, which is an async function. But the callers are HTTP request handlers -- the callback would need to somehow pause execution, respond to the client, wait for user input, and resume. That is not how HTTP works. The actual implementation (as described in Section 12.2) is to return a special response and have the client re-request. The callback abstraction is misleading and should be removed from the interface. Instead, `executeWithFallback` should simply return a result type that can be `{type: 'fallback_required', ...}` or `{type: 'success', ...}`.

### 7. Streaming Buffer Strategy Needs Bounds (Section 5.3)

"The router buffers the upstream response until either (a) the first data chunk arrives or (b) an error occurs." What if the upstream provider sends headers (200 OK) but then hangs without sending data? This buffer would wait indefinitely. There must be a "time to first chunk" timeout, separate from the overall request timeout.

### 8. `modelId` Semantics Are Ambiguous (Section 3.2)

The `modelId` in `model_provider_map` uses values like `"kimi-k2.5-free"`. But users/frontends send model IDs that correspond to provider-specific identifiers (e.g., OpenRouter uses `"anthropic/claude-3.5-sonnet"`). The plan does not clarify:
- Is `modelId` a canonical internal ID that differs from the provider's model identifier?
- If so, where is the mapping from canonical ID to provider-specific model string stored?
- If not, how do two providers offering the "same" model get the same `modelId`?

This is a fundamental data model question that affects every layer.

### 9. No API Key Handling for OpenCode Zen

The plan mentions decrypted API keys in Section 5.1 ("Return ordered list of candidates with decrypted API keys"). But if OpenCode Zen is free and does not require API keys (or uses a different auth mechanism), this is not addressed. How does the admin configure a provider that may not need an API key, or uses a different auth scheme?

### 10. Credit Deduction Timing with Streaming (Section 12.1)

Step 3e says "deductCreditsForUsage() -- 0 if free model" happens after step 3c "Accumulate response." For streaming, the response is being sent to the client as it arrives. If credit deduction fails (insufficient credits mid-stream, race condition), the user has already received partial content for free. The current system likely has this same issue, but the plan should acknowledge it and decide if it matters.

### 11. Missing Error Handling for Seed Data (Section 3.5)

"Insert OpenCode Zen provider row and model_provider_map entries for the 3 free models." What if the migration runs twice? The seed should be idempotent (ON CONFLICT DO NOTHING or equivalent).

### 12. No Testing Strategy

Section 13 (Phase 4) says "End-to-end testing" but provides no detail on:
- Unit tests for the circuit breaker state machine transitions
- Integration tests for the fallback chain
- How to test against OpenCode Zen without hitting the real API (mocking strategy)
- Load testing to validate the circuit breaker thresholds are sensible

### 13. `NUMERIC(10,6)` for Pricing May Be Insufficient

`pricingInput` and `pricingOutput` are `NUMERIC(10,6)` -- max value 9999.999999. Some models price at very small fractions per token. More critically, `costUsd` in `provider_usage_log` uses the same precision. A single request to a cheap model might cost $0.0000001, which rounds to 0.000000 and loses data. Consider `NUMERIC(12,8)` or similar.

### Minor Issues

- **Section 8.2** marks `llm.ts` as dead code to delete, but that file exports types (`Message`, `Role`, etc.) that may be imported elsewhere. The git status shows it is modified. Verify no live imports exist before deletion.
- **Section 11.2** uses an emoji in the UI copy ("lightning bolt"). This is fine for the UI but noting it is specified in the plan rather than left to design.
- The plan references `creditService.ts` (Sections 6.2, 7.1, 7.2) but never gives its file path. There are likely import path considerations when this file needs to query `model_provider_map`.

---

Overall this is a solid plan with clear decomposition. The biggest risks are: the `onFallbackRequired` callback abstraction not matching the actual HTTP request/response model (item 6), the ambiguous `modelId` semantics (item 8), and the unbounded usage log table (item 4). I would resolve those three before starting implementation.
