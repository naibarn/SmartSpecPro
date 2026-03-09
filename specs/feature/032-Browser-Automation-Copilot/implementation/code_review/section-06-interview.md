# Section 06 Code Review Interview

## Auto-fixes Applied

1. **CRITICAL: Added cache lookup before API call** — `requiresFreshData()` is now called before the upstream fetch in `proxyResponsesJson`. On cache hit, cached search results are injected as context for the model.

2. **Fixed queryHash** — Now uses `normalizeSearchQuery(userPrompt)` instead of raw prompt text.

3. **Removed duplicate `countWebSearchCalls`** — Deleted from `searchResultCache.ts` since it already exists in `responsesRoutes.ts`.

4. **Added debug logging for cache failures** — Cache set/get failures now log via `debugError()` instead of silent swallowing.

5. **Extracted `extractUserPrompt()` helper** — Cleaner prompt extraction logic shared between cache lookup and cache population.

6. **Fixed TTL export redundancy** — Constants use inline `export const`.

## Deferred Items

### Streaming handler cache population
Not added — streaming responses arrive incrementally via SSE events, making cache population significantly more complex. The non-streaming path handles the cache population. This can be revisited when streaming web search caching becomes a priority.

### Per-run quota via system_settings
Hardcoded default of 5. Database lookup deferred — the constant is sufficient for initial deployment and can be made configurable without code changes via env var.
