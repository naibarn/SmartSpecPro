# Opus Review

**Model:** claude-opus-4-6
**Generated:** 2026-03-07T00:00:00Z

---

## Implementation Plan Review: Feature 032 — Browser Automation Copilot

### Overall Assessment

The plan is well-structured with clear dependency ordering, good security awareness, and realistic scope. However, there are several significant issues ranging from security gaps to architectural mismatches with the existing codebase. Below is a section-by-section analysis.

---

### Section 1: LLMGatewayClient — Critical Issues

**1. Auth token mismatch between MCP and Gateway.**
The existing `internal_mcp.py` uses `X-Proxy-Token` / `SMARTSPEC_PROXY_TOKEN` for internal auth, while the browser tool route uses `X-Internal-Token` / `webGatewayToken`. The plan references `X-Internal-Token` for the gateway client but does not address this existing split. The implementer will need to decide which token scheme the `LLMGatewayClient` uses and whether it matches what `guardWithCredits()` will accept.

**2. `guardWithCredits()` modification is underspecified.**
The current implementation calls `authorizeRequest()` which handles JWT/session auth. The plan says "when `X-Internal-Token` is present and valid, skip JWT auth" but does not specify:
- How `tenantId` is resolved (current `guardWithCredits` only returns `{ ok, userId }`).
- Whether `checkCredits()` will be modified to accept a passed-in `userId`.
- How to prevent privilege escalation: any caller with the internal token can specify arbitrary `userId`.

**3. Missing `list_available_models` endpoint.**
The plan references `GET /api/internal/models` but this endpoint does not exist. Either create a new internal endpoint or specify how existing `/v1/models` will be reused with internal token auth.

**4. Retry on 429 may compound rate limiting.**
Retries from Python will consume the same rate limit pool, potentially causing cascading failures. Consider respecting `Retry-After` header or bypassing per-IP rate limiter for internal calls.

---

### Section 2: Responses API Proxy — Significant Concerns

**5. The `apiStyle: 'responses'` routing already exists but creates ambiguity.**
The gateway would now both *expose* `/v1/responses` as a local endpoint AND *proxy to* upstream `/v1/responses`. The plan needs to clearly differentiate between local gateway endpoint and upstream OpenAI endpoint.

**6. Tool-call loop in the gateway is architecturally risky.**
A single HTTP request could run for minutes (up to 10 tool rounds). Problems: Express request timeouts, memory accumulation, no cleanup on client disconnect. Consider returning function_call items to the caller and letting the caller orchestrate the loop.

**7. `web_search` cost model is speculative.**
The plan should specify where this cost is configured (presumably `model_provider_map` or `system_settings`) so it can be updated without code changes.

**8. Feature flag naming inconsistency.**
The existing `getTenantFeatureFlag()` uses a single `flagName` for both global and per-tenant lookups. The flag name should be the same string for both tiers, not `responses_api_enabled` vs `responsesApi`.

---

### Section 3: Activate LLM Calls — Missing Details

**9. `_diagnose_failure()` stub is not a `NotImplementedError`.**
It returns a `FailureDiagnosis` with `confidence=0.0`. Existing tests likely pass with this behavior. Verify replacement doesn't break test contract.

**10. No fallback when LLM gateway is down.**
No mention of what happens if the gateway is entirely unavailable. Should preserve degradation path (return `confidence=0.0`).

**11. `response_format: { type: "json_schema" }` may not work with all models.**
If the gateway routes to a non-OpenAI fallback model, this parameter will fail. Need provider-specific parameter translation.

---

### Section 4: Browser Runner — Architecture Mismatch

**12. `execute_actions()` is NOT a stub -- it has real logic.**
The individual action methods are stubs, but the orchestration layer is real. Consider wiring individual action methods to real Playwright calls rather than replacing the entire flow.

**13. `SandboxDispatcher` requires an `AsyncSession` (database session).**
`BrowserSession` constructor does not receive a DB session. Either modify the class or inject the dispatcher differently.

**14. MAX_PAGES = 5 should abort remaining actions, not reject upfront.**
Pages loaded are not known in advance.

---

### Section 5: Web Search Cache -- Potential Issues

**15. Cache key collision risk.**
"Normalized" is undefined. Specify exact normalization steps.

**16. Tenant-shared cache may cause confusion.**
Include metadata about original query context.

**17. Freshness keyword detection is fragile.**
Consider time-sensitive entity types or opt-in caching.

---

### Section 6: MCP Tool Registry -- Missing Auth Consistency

**18. Auth token inconsistency between MCP and browser tool.**
When MCP dispatches to the browser tool route, which token does it send? Need to resolve.

**19. `sandbox.exec_command` is a dangerous tool.**
No command allowlist, no restrictions on who can call it. Needs hardening.

---

### Section 7: Credit Flow -- Design Gap

**20. `skip_credit_reserve` flag creates a trust boundary problem.**
Consider a "parent reservation ID" pattern instead.

**21. Cost estimation formula is vague.**
Need concrete formula for estimated_credits and max_possible_credits.

---

### Section 8: Security -- Missing Items

**22. HTML sanitization library not specified.**
Specify `bleach` (Python) or `sanitize-html` (Node).

**23. `store=false` enforcement may break future features.**
Clarify if hard requirement or configurable default.

**24. No CSP headers mentioned for rendered content.**

---

### Section 9: DB + Config -- Ordering Problem

**25. Dependency diagram shows Section 9 last but recommended order puts it first.** Diagram is misleading.

**26. GPT-5.4 may need fallback model for development/testing.**

**27. No migration for `apiStyle` column.**
Verify database enum includes `"responses"` value.

---

### Cross-Cutting Concerns

**28. No rollback plan.**
Internal token auth modification affects ALL LLM calls. Consider separate middleware wrapper.

**29. No load testing or capacity planning.**
Specify expected concurrency limits.

**30. No integration test specification.**
Only unit test strategies; no end-to-end test specification.

**31. `llmRoutes.ts` is already 2200+ lines.**
Consider separate `responsesRoutes.ts` file.

---

### Summary of Highest-Priority Issues

1. **Security**: `sandbox.exec_command` without an allowlist is dangerous (#19)
2. **Security**: `skip_credit_reserve` trust boundary problem (#20)
3. **Architecture**: Tool-call loop inside Express request handler will cause timeout/memory issues (#6)
4. **Architecture**: `execute_actions()` replacement discards existing orchestration logic (#12)
5. **Bug risk**: Feature flag naming inconsistency will cause dual-flag check to never work (#8)
6. **Auth**: Token scheme mismatch between MCP and gateway needs resolution (#18)
