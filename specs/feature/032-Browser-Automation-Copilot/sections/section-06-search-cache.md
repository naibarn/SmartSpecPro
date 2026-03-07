# Section 06: Web Search Integration + Cache

## Overview

This section implements a two-tier Redis-based cache for web search results from the Responses API, freshness detection to bypass cache when users need current data, and search cost tracking. The cache reduces costs for repeated queries and enables conversation recall by storing search results at both tenant-shared and per-user levels.

## Dependencies

- **Section 03 (Responses API)**: The `/v1/responses` endpoint must exist and be processing `web_search_call` output events. This section hooks into that endpoint's event processing to populate the cache and enforce quotas.
- **Section 01 (DB + Config)**: The `max_search_calls_per_request` system setting must be available.
- **Redis**: The existing `getRedisClient()` from `apps/web/server/services/redis.ts` provides the IORedis connection.

## Files to Create

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/services/searchResultCache.ts` | **Create** | Two-tier Redis cache with freshness detection |
| `apps/web/server/__tests__/searchResultCache.test.ts` | **Create** | Full test suite |

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/web/server/_core/responsesRoutes.ts` | **Modify** | Integrate cache lookups, cache population from Responses API `web_search_call` events, and per-run quota enforcement |

---

## Tests First

**File**: `apps/web/server/__tests__/searchResultCache.test.ts`

All tests use Vitest. Mock Redis with an in-memory map to avoid requiring a running Redis instance.

```typescript
// === Tier 1: Tenant-shared cache ===
// Test: cache miss returns null
// Test: cache set + get returns cached result
// Test: TTL expiry → cache miss after TTL
// Test: tenant A cache not visible to tenant B (different keys)
// Test: query normalization: "Hello World!" and "hello world" produce same key

// === Tier 2: Per-user cache ===
// Test: user A cache not visible to user B in same tenant
// Test: user cache TTL independent of tenant cache

// === Freshness bypass ===
// Test: prompt with "latest" → cache bypassed
// Test: prompt with "ล่าสุด" → cache bypassed
// Test: prompt with "วันนี้" → cache bypassed
// Test: normal prompt → cache checked

// === Cost tracking ===
// Test: web_search_call count extracted from Responses API output
// Test: search cost calculated at $0.01 per call
// Test: per-run quota (default 5) → exceeded returns quota error
```

### Test Setup Details

Mock the Redis client by creating a fake in-memory store object that implements `get`, `set`, `setex`, `del`, and `ttl` methods. Use `vi.mock('../services/redis')` to replace `getRedisClient()` with the mock.

For TTL tests, use `vi.useFakeTimers()` to advance time beyond the TTL and verify that the mock returns `null` for expired keys.

For freshness bypass tests, call the freshness detection function directly with various prompts and assert whether it returns `true` (bypass) or `false` (use cache).

For cost tracking tests, construct mock Responses API output arrays containing `web_search_call` items and verify the extraction/calculation logic.

---

## Implementation Details

### SearchResultCache Class

**File**: `apps/web/server/services/searchResultCache.ts`

This module exports a `SearchResultCache` class (or a set of standalone functions) that manages both tiers of cache.

#### Redis Key Structure

- **Tier 1 (tenant-shared)**: `search_cache:tenant:{tenantId}:{sha256(normalizedQuery)}`
- **Tier 2 (per-user)**: `search_cache:user:{userId}:{sha256(queryWithContext)}`

#### Query Normalization

Normalize queries before hashing to maximize cache hits:

1. Convert to lowercase
2. Strip extra whitespace (collapse multiple spaces to single)
3. Remove punctuation (regex: strip characters matching `/[^\w\s]/g` but preserve Thai characters with a Unicode-aware pattern)
4. Sort words alphabetically
5. SHA-256 hash the result

The normalization function should be exported for testing. Signature:

```typescript
export function normalizeSearchQuery(query: string): string;
```

#### Cache Value Structure

Each cached entry stores:

```typescript
interface CachedSearchResult {
  snippets: Array<{ title: string; url: string; text: string }>;
  citations: Array<{ url: string; title?: string }>;
  retrievedAt: string; // ISO timestamp
  queryHash: string;   // for debugging/audit
}
```

Values are JSON-serialized before storing in Redis via `setex` (set with expiry).

#### TTL Configuration

- Tier 1 (tenant-shared): 15 minutes default, configurable up to 60 minutes
- Tier 2 (per-user): session duration or 60 minutes, whichever is shorter

TTL values should be configurable via constants at the top of the file. They can later be moved to `system_settings` if needed.

```typescript
const TENANT_CACHE_TTL_SECONDS = 15 * 60;  // 15 minutes
const USER_CACHE_TTL_SECONDS = 60 * 60;    // 60 minutes
```

#### Core Methods

```typescript
export class SearchResultCache {
  constructor(private redis: Redis) {}

  /** Look up tenant-shared cache. Returns null on miss. */
  async getTenantCache(tenantId: number, query: string): Promise<CachedSearchResult | null>;

  /** Store result in tenant-shared cache. */
  async setTenantCache(tenantId: number, query: string, result: CachedSearchResult): Promise<void>;

  /** Look up per-user cache. Returns null on miss. */
  async getUserCache(userId: number, query: string, context?: string): Promise<CachedSearchResult | null>;

  /** Store result in per-user cache. */
  async setUserCache(userId: number, query: string, result: CachedSearchResult, context?: string): Promise<void>;

  /** Check both tiers: user cache first, then tenant cache. */
  async get(userId: number, tenantId: number, query: string, context?: string): Promise<CachedSearchResult | null>;
}
```

The `get()` method checks user cache first (more specific), then falls back to tenant cache.

#### Tenant Isolation

Tenant isolation is inherent in the key structure: the `tenantId` is part of the Redis key for Tier 1, so tenant A's results cannot appear for tenant B. Similarly, `userId` scopes Tier 2 keys.

### Freshness Detection

**Exported function**: `requiresFreshData(prompt: string): boolean`

Checks the user's prompt against a list of freshness indicator keywords. If any match, the cache should be bypassed entirely.

Keywords to detect (case-insensitive):

- **English**: `latest`, `today`, `current price`, `now`, `real-time`, `live`, `up to date`, `most recent`, `breaking`
- **Thai**: `ล่าสุด`, `วันนี้`, `ราคาปัจจุบัน`, `ตอนนี้`, `ข่าวด่วน`

Implementation: build a single regex from all keywords joined with `|`, test against the lowercased prompt. Keep the keyword list as a module-level constant array for easy maintenance.

### Search Cost Tracking

#### Extracting web_search_call Count

The Responses API output array contains items with `type: "web_search_call"`. The cost tracking function counts these items:

```typescript
export function countWebSearchCalls(outputItems: Array<{ type: string }>): number;
```

This is called from `responsesRoutes.ts` after receiving a response (streaming or non-streaming).

#### Cost Calculation

- Rate: $0.01 per `web_search_call` ($10 per 1,000 calls)
- Calculation: `searchCount * 0.01`
- This cost is added to the credit deduction alongside the token-based cost

#### Logging

Each request with web searches should produce a separate `provider_usage_log` entry:

- `modelUsed`: `"web_search"`
- `costUsd`: calculated search cost
- `inputTokens`: 0 (not token-based)
- `outputTokens`: 0
- `requestType`: `"web_search"`
- `traceId`: same as the parent Responses API request

This is logged via the existing `providerUsageLog` insert pattern in `llmRoutes.ts`.

#### Per-Run Quota

Before processing web search results, check the accumulated count against the per-run quota:

- Default quota: 5 searches per request
- Configurable via `system_settings` key `max_search_calls_per_request` (category: `llm`)
- When exceeded: stop the tool-call loop and return a response with `quota_exceeded: true` flag
- The quota check happens in `responsesRoutes.ts` during the tool-call loop or SSE event processing

### Integration with responsesRoutes.ts

The following integration points need to be added to the Responses API handler created in Section 03:

1. **Before sending request to OpenAI**: Call `requiresFreshData(userPrompt)`. If false, check `searchResultCache.get()`. On cache hit, consider returning cached results without an API call (or letting the model use the cached data as context).

2. **After receiving response**: Extract `web_search_call` items from output. For each:
   - Increment the search call counter
   - Check against per-run quota
   - Extract result snippets and citations
   - Populate both cache tiers

3. **On stream end / response complete**: Calculate total search cost and add to credit deduction. Log the separate `provider_usage_log` entry for web searches.

### Rollback

Cache is fully additive. To disable:
- Delete all Redis keys matching `search_cache:*`
- Remove cache lookups from `responsesRoutes.ts` (the Responses API continues to work without caching)
- Cost tracking and quota enforcement can be disabled independently by removing the count/check logic

---

## Verification Checklist

1. All tests in `searchResultCache.test.ts` pass
2. Cache keys use correct format and tenant/user isolation holds
3. Query normalization produces consistent hashes for equivalent queries
4. Freshness keywords bypass cache (both English and Thai)
5. Search cost is calculated at $0.01 per call and logged as separate `provider_usage_log` entry
6. Per-run quota (default 5) stops the loop when exceeded
7. `pnpm check` passes with no type errors in the new file
8. Existing tests are not broken (`pnpm test` passes)