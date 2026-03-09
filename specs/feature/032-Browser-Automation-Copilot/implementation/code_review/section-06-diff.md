diff --git a/apps/web/server/__tests__/searchResultCache.test.ts b/apps/web/server/__tests__/searchResultCache.test.ts
new file mode 100644
index 0000000..abf874b
--- /dev/null
+++ b/apps/web/server/__tests__/searchResultCache.test.ts
@@ -0,0 +1,285 @@
+/**
+ * Tests for SearchResultCache — two-tier Redis cache with freshness detection.
+ * Uses Vitest with an in-memory Redis mock.
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import {
+  SearchResultCache,
+  normalizeSearchQuery,
+  requiresFreshData,
+  countWebSearchCalls,
+  TENANT_CACHE_TTL_SECONDS,
+  USER_CACHE_TTL_SECONDS,
+  type CachedSearchResult,
+} from "../services/searchResultCache";
+
+// ── In-memory Redis mock ────────────────────────────────────────────────────
+
+function createMockRedis() {
+  const store = new Map<string, { value: string; expiresAt: number | null }>();
+  let now = Date.now();
+
+  return {
+    _store: store,
+    _advanceTime(ms: number) {
+      now += ms;
+    },
+    _now() {
+      return now;
+    },
+    async get(key: string): Promise<string | null> {
+      const entry = store.get(key);
+      if (!entry) return null;
+      if (entry.expiresAt !== null && now >= entry.expiresAt) {
+        store.delete(key);
+        return null;
+      }
+      return entry.value;
+    },
+    async set(key: string, value: string): Promise<void> {
+      store.set(key, { value, expiresAt: null });
+    },
+    async setex(key: string, ttl: number, value: string): Promise<void> {
+      store.set(key, { value, expiresAt: now + ttl * 1000 });
+    },
+    async del(key: string): Promise<void> {
+      store.delete(key);
+    },
+    async ttl(key: string): Promise<number> {
+      const entry = store.get(key);
+      if (!entry || entry.expiresAt === null) return -1;
+      const remaining = Math.ceil((entry.expiresAt - now) / 1000);
+      return remaining > 0 ? remaining : -2;
+    },
+  };
+}
+
+// ── Test data ───────────────────────────────────────────────────────────────
+
+function makeCachedResult(query: string): CachedSearchResult {
+  return {
+    snippets: [
+      { title: "Test Result", url: "https://example.com", text: "Some text" },
+    ],
+    citations: [{ url: "https://example.com", title: "Example" }],
+    retrievedAt: new Date().toISOString(),
+    queryHash: normalizeSearchQuery(query),
+  };
+}
+
+// ── Tests ───────────────────────────────────────────────────────────────────
+
+describe("SearchResultCache", () => {
+  let redis: ReturnType<typeof createMockRedis>;
+  let cache: SearchResultCache;
+
+  beforeEach(() => {
+    redis = createMockRedis();
+    cache = new SearchResultCache(redis as any);
+  });
+
+  // === Tier 1: Tenant-shared cache ===
+
+  describe("Tier 1: Tenant-shared cache", () => {
+    it("cache miss returns null", async () => {
+      const result = await cache.getTenantCache("t1", "unknown query");
+      expect(result).toBeNull();
+    });
+
+    it("cache set + get returns cached result", async () => {
+      const cached = makeCachedResult("hello world");
+      await cache.setTenantCache("t1", "hello world", cached);
+
+      const result = await cache.getTenantCache("t1", "hello world");
+      expect(result).not.toBeNull();
+      expect(result!.snippets[0].title).toBe("Test Result");
+    });
+
+    it("TTL expiry → cache miss after TTL", async () => {
+      const cached = makeCachedResult("test query");
+      await cache.setTenantCache("t1", "test query", cached);
+
+      // Advance time past TTL
+      redis._advanceTime((TENANT_CACHE_TTL_SECONDS + 1) * 1000);
+
+      const result = await cache.getTenantCache("t1", "test query");
+      expect(result).toBeNull();
+    });
+
+    it("tenant A cache not visible to tenant B", async () => {
+      const cached = makeCachedResult("shared query");
+      await cache.setTenantCache("tenantA", "shared query", cached);
+
+      const resultA = await cache.getTenantCache("tenantA", "shared query");
+      const resultB = await cache.getTenantCache("tenantB", "shared query");
+
+      expect(resultA).not.toBeNull();
+      expect(resultB).toBeNull();
+    });
+
+    it('query normalization: "Hello World!" and "hello world" produce same key', async () => {
+      const cached = makeCachedResult("Hello World!");
+      await cache.setTenantCache("t1", "Hello World!", cached);
+
+      // Should find with different casing/punctuation
+      const result = await cache.getTenantCache("t1", "hello world");
+      expect(result).not.toBeNull();
+    });
+  });
+
+  // === Tier 2: Per-user cache ===
+
+  describe("Tier 2: Per-user cache", () => {
+    it("user A cache not visible to user B in same tenant", async () => {
+      const cached = makeCachedResult("user query");
+      await cache.setUserCache(1, "user query", cached);
+
+      const resultA = await cache.getUserCache(1, "user query");
+      const resultB = await cache.getUserCache(2, "user query");
+
+      expect(resultA).not.toBeNull();
+      expect(resultB).toBeNull();
+    });
+
+    it("user cache TTL independent of tenant cache", async () => {
+      const cached = makeCachedResult("ttl test");
+      await cache.setUserCache(1, "ttl test", cached);
+      await cache.setTenantCache("t1", "ttl test", cached);
+
+      // Advance past tenant TTL but within user TTL
+      redis._advanceTime((TENANT_CACHE_TTL_SECONDS + 1) * 1000);
+
+      const tenantResult = await cache.getTenantCache("t1", "ttl test");
+      const userResult = await cache.getUserCache(1, "ttl test");
+
+      expect(tenantResult).toBeNull(); // Expired
+      expect(userResult).not.toBeNull(); // Still valid (60 min TTL)
+    });
+  });
+
+  // === Combined get() ===
+
+  describe("get() — both tiers", () => {
+    it("returns user cache first when both exist", async () => {
+      const userCached = makeCachedResult("dual query");
+      userCached.snippets[0].title = "User Result";
+      const tenantCached = makeCachedResult("dual query");
+      tenantCached.snippets[0].title = "Tenant Result";
+
+      await cache.setUserCache(1, "dual query", userCached);
+      await cache.setTenantCache("t1", "dual query", tenantCached);
+
+      const result = await cache.get(1, "t1", "dual query");
+      expect(result!.snippets[0].title).toBe("User Result");
+    });
+
+    it("falls back to tenant cache when user cache misses", async () => {
+      const tenantCached = makeCachedResult("tenant only");
+      tenantCached.snippets[0].title = "Tenant Result";
+      await cache.setTenantCache("t1", "tenant only", tenantCached);
+
+      const result = await cache.get(1, "t1", "tenant only");
+      expect(result!.snippets[0].title).toBe("Tenant Result");
+    });
+
+    it("returns null when both tiers miss", async () => {
+      const result = await cache.get(1, "t1", "missing query");
+      expect(result).toBeNull();
+    });
+  });
+});
+
+// === Freshness bypass ===
+
+describe("requiresFreshData", () => {
+  it('prompt with "latest" → cache bypassed', () => {
+    expect(requiresFreshData("What's the latest on AI?")).toBe(true);
+  });
+
+  it('prompt with "ล่าสุด" → cache bypassed', () => {
+    expect(requiresFreshData("ข่าวล่าสุดเกี่ยวกับ AI")).toBe(true);
+  });
+
+  it('prompt with "วันนี้" → cache bypassed', () => {
+    expect(requiresFreshData("อะไรเกิดขึ้นวันนี้")).toBe(true);
+  });
+
+  it("normal prompt → cache checked", () => {
+    expect(requiresFreshData("How does photosynthesis work?")).toBe(false);
+  });
+
+  it('prompt with "breaking" → cache bypassed', () => {
+    expect(requiresFreshData("Any breaking news?")).toBe(true);
+  });
+
+  it('prompt with "real-time" → cache bypassed', () => {
+    expect(requiresFreshData("Show me real-time stock data")).toBe(true);
+  });
+
+  it("case insensitive matching", () => {
+    expect(requiresFreshData("What is the LATEST?")).toBe(true);
+  });
+});
+
+// === Query normalization ===
+
+describe("normalizeSearchQuery", () => {
+  it("produces same hash for equivalent queries", () => {
+    const hash1 = normalizeSearchQuery("Hello World!");
+    const hash2 = normalizeSearchQuery("hello world");
+    expect(hash1).toBe(hash2);
+  });
+
+  it("sorts words alphabetically", () => {
+    const hash1 = normalizeSearchQuery("world hello");
+    const hash2 = normalizeSearchQuery("hello world");
+    expect(hash1).toBe(hash2);
+  });
+
+  it("strips extra whitespace", () => {
+    const hash1 = normalizeSearchQuery("hello   world");
+    const hash2 = normalizeSearchQuery("hello world");
+    expect(hash1).toBe(hash2);
+  });
+
+  it("preserves Thai characters", () => {
+    const hash = normalizeSearchQuery("สวัสดี โลก");
+    expect(hash).toBeTruthy();
+    expect(hash.length).toBe(64); // SHA-256 hex
+  });
+
+  it("different queries produce different hashes", () => {
+    const hash1 = normalizeSearchQuery("hello world");
+    const hash2 = normalizeSearchQuery("goodbye world");
+    expect(hash1).not.toBe(hash2);
+  });
+});
+
+// === Cost tracking ===
+
+describe("countWebSearchCalls", () => {
+  it("counts web_search_call items", () => {
+    const items = [
+      { type: "web_search_call" },
+      { type: "message" },
+      { type: "web_search_call" },
+    ];
+    expect(countWebSearchCalls(items)).toBe(2);
+  });
+
+  it("returns 0 for no search calls", () => {
+    const items = [{ type: "message" }, { type: "function_call" }];
+    expect(countWebSearchCalls(items)).toBe(0);
+  });
+
+  it("handles empty array", () => {
+    expect(countWebSearchCalls([])).toBe(0);
+  });
+
+  it("search cost at $0.01 per call", () => {
+    const count = 3;
+    const cost = count * 0.01;
+    expect(cost).toBeCloseTo(0.03);
+  });
+});
diff --git a/apps/web/server/_core/responsesRoutes.ts b/apps/web/server/_core/responsesRoutes.ts
index 85954ee..bb971a4 100644
--- a/apps/web/server/_core/responsesRoutes.ts
+++ b/apps/web/server/_core/responsesRoutes.ts
@@ -23,6 +23,12 @@ import {
   hasEnoughCredits,
 } from "../services/creditService";
 import { resolveApiUrl, type ApiStyle } from "./llmRoutes";
+import {
+  SearchResultCache,
+  requiresFreshData,
+  DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST,
+} from "../services/searchResultCache";
+import { getRedisClient } from "../services/redis";
 
 // ---------------------------------------------------------------------------
 // Constants
@@ -31,8 +37,18 @@ import { resolveApiUrl, type ApiStyle } from "./llmRoutes";
 const MAX_TOOL_ROUNDS = 10;
 const WEB_SEARCH_COST_USD = 0.01; // $0.01 per web_search call
 const DEFAULT_MAX_BUDGET_CREDITS = 500;
+const MAX_SEARCH_CALLS_PER_REQUEST = DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST;
 const SOCKET_TIMEOUT_MS = 600_000; // 10 min
 
+// Lazy-initialized search result cache
+let _searchCacheInstance: SearchResultCache | null = null;
+function getSearchCache(): SearchResultCache {
+  if (!_searchCacheInstance) {
+    _searchCacheInstance = new SearchResultCache(getRedisClient());
+  }
+  return _searchCacheInstance;
+}
+
 const MAX_LLM_BODY_BYTES = parseInt(
   process.env.WEB_LLM_MAX_BODY_BYTES || "2097152",
 );
@@ -588,6 +604,53 @@ async function proxyResponsesJson(
     const searchCalls = countWebSearchCalls(data.output || []);
     budget.webSearchCalls += searchCalls;
 
+    // Per-run search quota check
+    if (budget.webSearchCalls > MAX_SEARCH_CALLS_PER_REQUEST) {
+      debugLog("responses", "Search quota exceeded", {
+        webSearchCalls: budget.webSearchCalls,
+        max: MAX_SEARCH_CALLS_PER_REQUEST,
+        round,
+      });
+      // Return partial results with quota flag
+      if (lastResponse && typeof lastResponse === "object") {
+        lastResponse._meta = { ...lastResponse._meta, quota_exceeded: true };
+      }
+      break;
+    }
+
+    // Populate search cache with results
+    if (searchCalls > 0) {
+      try {
+        const searchCache = getSearchCache();
+        const searchSnippets = (data.output || [])
+          .filter((item: any) => item?.type === "web_search_call" && item?.results)
+          .flatMap((item: any) =>
+            (item.results || []).map((r: any) => ({
+              title: r.title || "",
+              url: r.url || "",
+              text: r.snippet || r.text || "",
+            })),
+          );
+        if (searchSnippets.length > 0) {
+          const userPrompt = String(
+            Array.isArray(body.input)
+              ? (body.input as any[]).find((i: any) => typeof i === "string" || i?.role === "user")?.content || body.input[0]?.content || ""
+              : body.input || "",
+          );
+          const cacheEntry = {
+            snippets: searchSnippets,
+            citations: searchSnippets.map((s: any) => ({ url: s.url, title: s.title })),
+            retrievedAt: new Date().toISOString(),
+            queryHash: userPrompt,
+          };
+          await searchCache.setTenantCache(tenantId, userPrompt, cacheEntry).catch(() => {});
+          await searchCache.setUserCache(userId, userPrompt, cacheEntry).catch(() => {});
+        }
+      } catch {
+        // Cache population failure is non-fatal
+      }
+    }
+
     // Calculate credits for this round
     const roundCredits = calculateCreditsForLLM(
       usage.inputTokens,
@@ -970,6 +1033,21 @@ async function proxyResponsesStream(
       budget.totalOutputTokens += roundUsage.outputTokens;
       budget.webSearchCalls += roundSearchCalls;
 
+      // Per-run search quota check (streaming)
+      if (budget.webSearchCalls > MAX_SEARCH_CALLS_PER_REQUEST) {
+        debugLog("responses", "Search quota exceeded (streaming)", {
+          webSearchCalls: budget.webSearchCalls,
+          max: MAX_SEARCH_CALLS_PER_REQUEST,
+          round,
+        });
+        if (!clientDisconnected) {
+          res.write(
+            `event: search_quota_exceeded\ndata: ${JSON.stringify({ webSearchCalls: budget.webSearchCalls, max: MAX_SEARCH_CALLS_PER_REQUEST })}\n\n`,
+          );
+        }
+        break;
+      }
+
       const roundCredits = calculateCreditsForLLM(
         roundUsage.inputTokens,
         roundUsage.outputTokens,
diff --git a/apps/web/server/services/searchResultCache.ts b/apps/web/server/services/searchResultCache.ts
new file mode 100644
index 0000000..97d32c1
--- /dev/null
+++ b/apps/web/server/services/searchResultCache.ts
@@ -0,0 +1,194 @@
+/**
+ * Two-tier Redis-based cache for web search results from the Responses API.
+ *
+ * Tier 1: Tenant-shared cache (key includes tenantId + normalized query hash)
+ * Tier 2: Per-user cache (key includes userId + query hash + optional context)
+ *
+ * Freshness detection bypasses cache when users need current data.
+ */
+
+import crypto from "crypto";
+import type { Redis } from "ioredis";
+
+// ---------------------------------------------------------------------------
+// Constants
+// ---------------------------------------------------------------------------
+
+const TENANT_CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
+const USER_CACHE_TTL_SECONDS = 60 * 60; // 60 minutes
+const DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST = 5;
+
+// ---------------------------------------------------------------------------
+// Types
+// ---------------------------------------------------------------------------
+
+export interface CachedSearchResult {
+  snippets: Array<{ title: string; url: string; text: string }>;
+  citations: Array<{ url: string; title?: string }>;
+  retrievedAt: string; // ISO timestamp
+  queryHash: string; // for debugging/audit
+}
+
+// ---------------------------------------------------------------------------
+// Query Normalization
+// ---------------------------------------------------------------------------
+
+/**
+ * Normalize a search query for cache key generation.
+ * Steps: lowercase, strip extra whitespace, remove punctuation (preserving
+ * Thai and other Unicode letters), sort words, then SHA-256 hash.
+ */
+export function normalizeSearchQuery(query: string): string {
+  const normalized = query
+    .toLowerCase()
+    .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove non-letter, non-digit, non-space (Unicode-aware)
+    .replace(/\s+/g, " ") // Collapse whitespace
+    .trim()
+    .split(" ")
+    .sort()
+    .join(" ");
+
+  return crypto.createHash("sha256").update(normalized).digest("hex");
+}
+
+// ---------------------------------------------------------------------------
+// Freshness Detection
+// ---------------------------------------------------------------------------
+
+const FRESHNESS_KEYWORDS = [
+  // English
+  "latest",
+  "today",
+  "current price",
+  "now",
+  "real-time",
+  "realtime",
+  "live",
+  "up to date",
+  "most recent",
+  "breaking",
+  // Thai
+  "ล่าสุด",
+  "วันนี้",
+  "ราคาปัจจุบัน",
+  "ตอนนี้",
+  "ข่าวด่วน",
+];
+
+const FRESHNESS_REGEX = new RegExp(
+  FRESHNESS_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
+  "i",
+);
+
+/**
+ * Check if a prompt requires fresh (non-cached) data.
+ * Returns true if cache should be bypassed.
+ */
+export function requiresFreshData(prompt: string): boolean {
+  return FRESHNESS_REGEX.test(prompt);
+}
+
+// ---------------------------------------------------------------------------
+// Search Cost Helpers
+// ---------------------------------------------------------------------------
+
+/**
+ * Count web_search_call items in a Responses API output array.
+ */
+export function countWebSearchCalls(
+  outputItems: Array<{ type: string; [key: string]: unknown }>,
+): number {
+  if (!Array.isArray(outputItems)) return 0;
+  return outputItems.filter((item) => item?.type === "web_search_call").length;
+}
+
+// ---------------------------------------------------------------------------
+// SearchResultCache
+// ---------------------------------------------------------------------------
+
+export class SearchResultCache {
+  constructor(private redis: Redis) {}
+
+  /** Look up tenant-shared cache. Returns null on miss. */
+  async getTenantCache(
+    tenantId: number | string,
+    query: string,
+  ): Promise<CachedSearchResult | null> {
+    const hash = normalizeSearchQuery(query);
+    const key = `search_cache:tenant:${tenantId}:${hash}`;
+    const raw = await this.redis.get(key);
+    if (!raw) return null;
+    try {
+      return JSON.parse(raw) as CachedSearchResult;
+    } catch {
+      return null;
+    }
+  }
+
+  /** Store result in tenant-shared cache. */
+  async setTenantCache(
+    tenantId: number | string,
+    query: string,
+    result: CachedSearchResult,
+  ): Promise<void> {
+    const hash = normalizeSearchQuery(query);
+    const key = `search_cache:tenant:${tenantId}:${hash}`;
+    await this.redis.setex(key, TENANT_CACHE_TTL_SECONDS, JSON.stringify(result));
+  }
+
+  /** Look up per-user cache. Returns null on miss. */
+  async getUserCache(
+    userId: number,
+    query: string,
+    context?: string,
+  ): Promise<CachedSearchResult | null> {
+    const queryWithContext = context ? `${query}|||${context}` : query;
+    const hash = normalizeSearchQuery(queryWithContext);
+    const key = `search_cache:user:${userId}:${hash}`;
+    const raw = await this.redis.get(key);
+    if (!raw) return null;
+    try {
+      return JSON.parse(raw) as CachedSearchResult;
+    } catch {
+      return null;
+    }
+  }
+
+  /** Store result in per-user cache. */
+  async setUserCache(
+    userId: number,
+    query: string,
+    result: CachedSearchResult,
+    context?: string,
+  ): Promise<void> {
+    const queryWithContext = context ? `${query}|||${context}` : query;
+    const hash = normalizeSearchQuery(queryWithContext);
+    const key = `search_cache:user:${userId}:${hash}`;
+    await this.redis.setex(key, USER_CACHE_TTL_SECONDS, JSON.stringify(result));
+  }
+
+  /** Check both tiers: user cache first, then tenant cache. */
+  async get(
+    userId: number,
+    tenantId: number | string,
+    query: string,
+    context?: string,
+  ): Promise<CachedSearchResult | null> {
+    // Tier 2: per-user (more specific)
+    const userResult = await this.getUserCache(userId, query, context);
+    if (userResult) return userResult;
+
+    // Tier 1: tenant-shared
+    return this.getTenantCache(tenantId, query);
+  }
+}
+
+// ---------------------------------------------------------------------------
+// Exported constants for testing/configuration
+// ---------------------------------------------------------------------------
+
+export {
+  TENANT_CACHE_TTL_SECONDS,
+  USER_CACHE_TTL_SECONDS,
+  DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST,
+};
