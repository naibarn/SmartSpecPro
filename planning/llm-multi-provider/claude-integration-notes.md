# Integration Notes: Opus Review Feedback

## Integrating

### 1. Fallback consent SSE event format (Review #1)
**Integrating.** The plan should specify the SSE event type (`event: fallback_required`) rather than implying a JSON response body on a streaming endpoint. The retry request naturally re-validates credits and health.

### 2. Seed circuit breaker from DB on startup (Review #2)
**Integrating.** On startup, read `llm_providers.healthStatus` to initialize in-memory state. Low cost, meaningful improvement for low-traffic deployments.

### 3. Timeout configuration (Review #3)
**Integrating.** Add `timeoutMs` and `firstChunkTimeoutMs` columns to `llm_providers.configJson`. Default 30s request timeout, 10s first-chunk timeout for streaming.

### 4. Usage log indexes + retention note (Review #4)
**Integrating.** Add composite indexes `(userId, createdAt)` and `(providerId, createdAt)`. Add a note about future retention policy (out of scope for this phase, but schema supports it).

### 5. Routing rule precedence (Review #5)
**Integrating.** Define precedence: exact match > prefix glob > wildcard. Application-level matching (load all rules, filter in code).

### 6. Replace `onFallbackRequired` callback with result type (Review #6)
**Integrating.** This is the strongest feedback item. The callback abstraction doesn't work for HTTP. Change `executeWithFallback` to return a discriminated union: `{type: 'success', response}` | `{type: 'fallback_required', from, to, estimatedCredits}` | `{type: 'error', ...}`.

### 7. First-chunk timeout for streaming buffer (Review #7)
**Integrating.** Already covered by #3 above (`firstChunkTimeoutMs`).

### 8. `modelId` semantics clarification (Review #8)
**Integrating.** Add `providerModelId` column to `model_provider_map` — the provider-specific string sent in API requests. `modelId` is the canonical internal ID used by the frontend/routing. This is a critical clarification.

### 9. Idempotent seed data (Review #11)
**Integrating.** Specify ON CONFLICT DO NOTHING for seed inserts.

### 10. NUMERIC precision (Review #13)
**Integrating.** Change to `NUMERIC(12,8)` for pricing and cost columns.

## NOT Integrating

### Review #9: API key handling for OpenCode Zen
**Not integrating.** The spec says Zen uses Bearer token auth (API key). It works the same as any other provider — admin enters the key, it gets encrypted. No special handling needed.

### Review #10: Credit deduction timing with streaming
**Not integrating.** This is a pre-existing behavior in the current system. The plan explicitly states backward compatibility. Fixing this race condition is out of scope.

### Review #12: Testing strategy detail
**Not integrating in the plan.** This will be addressed by the TDD plan (claude-plan-tdd.md) which is a separate step in this workflow.

### Minor: llm.ts type exports
**Not integrating.** The spec already identified this as dead code. Import verification is an implementation detail, not a plan concern.
