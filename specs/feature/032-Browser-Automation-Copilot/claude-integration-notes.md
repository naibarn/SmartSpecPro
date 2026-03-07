# Review Integration Notes

## Suggestions INTEGRATED into the plan

### #1 Auth token clarification
**Integrating**: Explicitly specify that `LLMGatewayClient` uses `X-Internal-Token` (same as browserTool.ts). Clarify trust boundary for userId pass-through.

### #2 guardWithCredits() underspecification
**Integrating**: Add detail on tenantId resolution and privilege escalation prevention. Internal-token callers are trusted services (Python backend on same host) — document this trust boundary.

### #4 Rate limiting for internal calls
**Integrating**: Internal calls (with `X-Internal-Token`) should bypass per-IP rate limiter but still respect per-provider rate limits. Add this distinction.

### #6 Tool-call loop architecture
**Integrating (partially)**: The reviewer suggests having the caller orchestrate the loop. This is a good point for the general API, but for the Responses API proxy, the gateway MUST handle the loop because it needs to dispatch browser.execute_actions to the local browser tool route (the caller doesn't have network access to this route). However, we should add: (a) separate the handler into its own file (`responsesRoutes.ts`), (b) add client disconnect detection via `req.on('close')`, (c) set socket timeout to 600s matching chat completions.

### #8 Feature flag naming
**Integrating**: Use single flag name `responsesApi` for both global and per-tenant, leveraging existing `getTenantFeatureFlag()` which already does dual-check.

### #9 _diagnose_failure() is not NotImplementedError
**Integrating**: Correct the description — it returns `confidence=0.0` stub, not NotImplementedError. Update test strategy to preserve this degradation path.

### #10 Fallback when gateway is down
**Integrating**: Add graceful degradation — if gateway unavailable, `_analyze_intent()` returns `needs_clarification`, `_vision_llm_call()` raises, `_diagnose_failure()` returns `confidence=0.0` (existing behavior).

### #11 json_schema not portable
**Integrating**: Use `response_format: { type: "json_object" }` (more widely supported) with explicit JSON instructions in the system prompt, rather than `json_schema` which is OpenAI-specific.

### #12 execute_actions() has real orchestration logic
**Integrating**: This is a critical correction. Wire the individual action methods (navigate, click, fill, etc.) to real Playwright calls rather than replacing the entire `execute_actions()` orchestration. The existing orchestration handles timeout tracking, cost accumulation, and result aggregation correctly.

### #13 SandboxDispatcher requires AsyncSession
**Integrating**: Add DB session injection path to BrowserSession or use a factory pattern.

### #14 MAX_PAGES runtime enforcement
**Integrating**: Abort remaining actions when cap exceeded (runtime check), not upfront rejection.

### #15 Cache key normalization
**Integrating**: Specify normalization: lowercase, strip extra whitespace, remove punctuation, sort words alphabetically, then SHA-256 hash.

### #18 Auth token inconsistency MCP ↔ browser tool
**Integrating**: Explicitly document that Python MCP handler calls Node browser route using `X-Internal-Token` (the Python service has access to `SMARTSPEC_WEB_GATEWAY_TOKEN` env var which is the same token).

### #19 sandbox.exec_command hardening
**Integrating**: Add command allowlist, max execution time, and restrict to internal-only callers (not exposed to LLMs directly). Only agency nodes with explicit `sandbox_command` capability can invoke it.

### #20 skip_credit_reserve → parent reservation ID
**Integrating**: Better design — use a `parent_reservation_id` pattern. Automation copilot creates a reservation, browser tool draws from that reservation ID instead of making its own.

### #21 Cost estimation formula
**Integrating**: Add concrete formula: `estimated = (num_browser_tasks * 15) + (num_llm_calls * 5) + (num_web_searches * 10)`.

### #22 Sanitization library
**Integrating**: Use `bleach` for Python, `sanitize-html` for Node.

### #25 Dependency diagram correction
**Integrating**: Fix the diagram to show Section 9 first.

### #27 apiStyle enum verification
**Integrating**: Add step to verify `apiStyleEnum` in `drizzle/schema.ts` includes `"responses"` value, add migration if needed.

### #28 Rollback plan
**Integrating**: Add rollback section — internal token auth as separate middleware wrapper that can be disabled independently.

### #31 Separate responsesRoutes.ts file
**Integrating**: Move Responses API handler to `apps/web/server/_core/responsesRoutes.ts`, imported and registered by `llmRoutes.ts`.

## Suggestions NOT integrated

### #3 list_available_models endpoint
**Not integrating now**: The `LLMGatewayClient` can query models by attempting a call and handling failures. A dedicated endpoint is nice-to-have but not blocking. Can be added later.

### #5 Local vs upstream /v1/responses ambiguity
**Not integrating (already clear)**: The local endpoint IS the proxy — it accepts client requests and forwards to upstream. This is the same pattern as `/v1/chat/completions`. No ambiguity in practice.

### #7 web_search cost configurability
**Not integrating separately**: Already covered — web_search costs will be in `system_settings` table, which is the existing pattern for configurable costs.

### #16 Cache metadata for context
**Not integrating**: Cache keys are already query-specific. Consumers don't need to assess relevance — they either get a cache hit on their exact (normalized) query or miss.

### #17 Freshness detection improvement
**Not integrating now**: The keyword list is a reasonable first pass. Can be improved in future iterations with NLP-based detection.

### #23 store=false as configurable default
**Not integrating**: ZDR compliance is a hard requirement per spec. Admin can create an override in system_settings if needed in the future, but default stays `false`.

### #24 CSP headers
**Not integrating**: Existing frontend already has CSP headers configured in Nginx. Browser automation results are rendered as text/JSON, not raw HTML.

### #26 GPT-5.4 availability
**Not integrating (not applicable)**: User confirmed GPT-5.4 is available now (interview Q3).

### #29 Load testing
**Not integrating in plan**: Important but separate concern. Should be done before production rollout, not as part of implementation plan.

### #30 Integration test specification
**Not integrating as separate section**: Integration tests are mentioned in each section's test strategy. A dedicated E2E test section would be nice but is not blocking.
