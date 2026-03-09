# Section 03 Code Review Interview

## User Decisions

### Retry logic on OpenAI error mid-loop
- **Decision**: Defer to follow-up
- **Rationale**: Current "return partial results on error" is safe. Retry adds complexity for an edge case.

### Code deduplication between stream/non-stream handlers
- **Decision**: Leave as-is
- **Rationale**: Readable, handlers may diverge. Duplication contained in one file.

## Auto-fixes Applied

### Fix 1: Feature flag fail-closed (was fail-open)
- Both global and tenant feature flag checks now deny access on error instead of silently continuing
- Changed catch blocks to return 500 instead of swallowing errors

### Fix 2: Tenant ID from auth context (was untrusted header)
- For non-internal callers, tenantId is no longer read from X-Tenant-Id header
- Internal callers can still specify via header; external callers use "default" tenant

### Fix 3: Streaming function call deduplication
- Added dedup by callId to prevent double-dispatching function calls from both response.output_item.done and response.completed events

### Fix 4: parseResponsesUsage uses ?? instead of ||
- Changed || to ?? for nullish coalescing in totalTokens calculation

### Fix 5: Pass tenantStoreAllowed through endpoint
- sanitizeResponsesBody now receives tenantStoreAllowed=false explicitly (matches plan intent)

## Items Let Go

- Tools array validation: Deferred to section-09 security audit
- deps typed as any: Minor, internal detail
- system_settings lookup for max_tool_rounds: Hardcoded defaults fine for MVP
- Streaming tests: Core logic tested via non-streaming; SSE tests add significant complexity
