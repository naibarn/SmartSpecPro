# Section 03 Code Review: Responses API Proxy

## Critical Issues

### 1. Feature Flag Fail-Open on Global Check (HIGH - Security)
The global feature flag check has a `catch` block that logs the error but continues execution ("Fail open"). If the feature flag service is down, the endpoint is accessible to everyone. Should fail closed.

### 2. Tenant Feature Flag Also Fails Open (HIGH - Security)
Same pattern — tenant-level check catch block logs and continues. Should deny on error.

### 3. Tenant ID from Untrusted Header (MEDIUM - Security)
`tenantId` is read from `req.headers['x-tenant-id']` with fallback to `'default'`. For non-internal callers, this is user-controlled. Plan says tenant ID should come from auth result.

### 4. No Exponential Backoff Retry on OpenAI Error Mid-Loop (MEDIUM - Completeness)
Plan requires retry with exponential backoff (max 3) on OpenAI error mid-loop. Implementation breaks immediately.

### 5. Streaming Double-Counting of Function Calls (MEDIUM - Correctness)
Function calls extracted from both `response.completed` AND `response.output_item.done` events. OpenAI sends both, causing duplicate dispatches. Need dedup by callId.

## Moderate Issues

### 6. `parseResponsesUsage` Uses `||` Instead of `??` (MEDIUM)
`usage.total_tokens || usage.input_tokens + usage.output_tokens || 0` — should use `??` for nullish coalescing.

### 7. No `tools` Array Validation (MEDIUM - Completeness)
Plan requires validating tools array. Implementation passes through without validation.

### 8. `deps` Typed as `any` in Handler Functions (LOW)
Both `proxyResponsesJson` and `proxyResponsesStream` accept `deps: any` despite parent having full types.

### 9. Credit Deduction Code Duplication (LOW)
~130 lines of identical credit/audit/cost logic duplicated between stream and non-stream handlers.

### 10. `max_tool_rounds` / `max_credits_per_request` Not from system_settings (LOW)
Plan says these should be configurable via system_settings. Implementation hardcodes defaults.

## Test Coverage Gaps

### 11. No Streaming Tests
All tests use non-streaming JSON mode. Plan requires SSE streaming tests.

### 12. No Client Disconnect Test
Plan requires testing client disconnect mid-loop.

### 13. `store=true` Always Disabled at Endpoint Level
Endpoint calls `sanitizeResponsesBody(req.body)` without `tenantStoreAllowed`, so store=true is impossible.
