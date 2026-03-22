# Adversarial Self-Review — Round 1

Date: 2026-03-22

## Issues Found & Fixed

### 1. Parallel Fan-Out Credit Budget (HIGH)
**Issue**: Plan didn't specify what happens when run credit budget is exceeded mid-branch.
**Fix**: Added cooperative cancellation — remaining branches cancelled via context flag when budget exceeded.

### 2. ExecutionContext.clone() vs AgencyRunContext (HIGH)
**Issue**: Unclear whether cloned branches share AgencyRunContext or get isolated copies.
**Fix**: Clarified that all branches share the SAME AgencyRunContext instance (thread-safe). clone() only copies results/knowledge, not shared context.

### 3. Guardrail llm_classify Latency (MEDIUM)
**Issue**: llm_classify adds an LLM call per message without latency guidance.
**Fix**: Added recommendation to use fast/cheap model, with config.model field defaulting to agency default.

### 4. OpenAPI Import vs 50-Tool Cap (MEDIUM)
**Issue**: Import allows up to 100 operations but plan didn't connect to 50-tool-per-tenant cap.
**Fix**: Added validation: imported operations + existing tools must not exceed 50. Reject import if exceeds.

### 5. SSE Backpressure (MEDIUM)
**Issue**: No mechanism for slow-consuming clients causing Redis message buildup.
**Fix**: Added bounded event buffer (max 1000) in Node.js SSE route. Overflow drops oldest events; reconnect replays via event IDs.

## Regression Check
- Verified: clone() semantics consistent with parallel_fan_out description
- Verified: credit tracking additions don't conflict with other sections
- No cross-references broken
