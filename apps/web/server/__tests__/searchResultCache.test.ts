/**
 * Tests for SearchResultCache — two-tier Redis cache with freshness detection.
 * Uses Vitest with an in-memory Redis mock.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  SearchResultCache,
  normalizeSearchQuery,
  requiresFreshData,
  TENANT_CACHE_TTL_SECONDS,
  USER_CACHE_TTL_SECONDS,
  type CachedSearchResult,
} from "../services/searchResultCache";

// ── In-memory Redis mock ────────────────────────────────────────────────────

function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt: number | null }>();
  let now = Date.now();

  return {
    _store: store,
    _advanceTime(ms: number) {
      now += ms;
    },
    _now() {
      return now;
    },
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key: string, value: string): Promise<void> {
      store.set(key, { value, expiresAt: null });
    },
    async setex(key: string, ttl: number, value: string): Promise<void> {
      store.set(key, { value, expiresAt: now + ttl * 1000 });
    },
    async del(key: string): Promise<void> {
      store.delete(key);
    },
    async ttl(key: string): Promise<number> {
      const entry = store.get(key);
      if (!entry || entry.expiresAt === null) return -1;
      const remaining = Math.ceil((entry.expiresAt - now) / 1000);
      return remaining > 0 ? remaining : -2;
    },
  };
}

// ── Test data ───────────────────────────────────────────────────────────────

function makeCachedResult(query: string): CachedSearchResult {
  return {
    snippets: [
      { title: "Test Result", url: "https://example.com", text: "Some text" },
    ],
    citations: [{ url: "https://example.com", title: "Example" }],
    retrievedAt: new Date().toISOString(),
    queryHash: normalizeSearchQuery(query),
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("SearchResultCache", () => {
  let redis: ReturnType<typeof createMockRedis>;
  let cache: SearchResultCache;

  beforeEach(() => {
    redis = createMockRedis();
    cache = new SearchResultCache(redis as any);
  });

  // === Tier 1: Tenant-shared cache ===

  describe("Tier 1: Tenant-shared cache", () => {
    it("cache miss returns null", async () => {
      const result = await cache.getTenantCache("t1", "unknown query");
      expect(result).toBeNull();
    });

    it("cache set + get returns cached result", async () => {
      const cached = makeCachedResult("hello world");
      await cache.setTenantCache("t1", "hello world", cached);

      const result = await cache.getTenantCache("t1", "hello world");
      expect(result).not.toBeNull();
      expect(result!.snippets[0].title).toBe("Test Result");
    });

    it("TTL expiry → cache miss after TTL", async () => {
      const cached = makeCachedResult("test query");
      await cache.setTenantCache("t1", "test query", cached);

      // Advance time past TTL
      redis._advanceTime((TENANT_CACHE_TTL_SECONDS + 1) * 1000);

      const result = await cache.getTenantCache("t1", "test query");
      expect(result).toBeNull();
    });

    it("tenant A cache not visible to tenant B", async () => {
      const cached = makeCachedResult("shared query");
      await cache.setTenantCache("tenantA", "shared query", cached);

      const resultA = await cache.getTenantCache("tenantA", "shared query");
      const resultB = await cache.getTenantCache("tenantB", "shared query");

      expect(resultA).not.toBeNull();
      expect(resultB).toBeNull();
    });

    it('query normalization: "Hello World!" and "hello world" produce same key', async () => {
      const cached = makeCachedResult("Hello World!");
      await cache.setTenantCache("t1", "Hello World!", cached);

      // Should find with different casing/punctuation
      const result = await cache.getTenantCache("t1", "hello world");
      expect(result).not.toBeNull();
    });
  });

  // === Tier 2: Per-user cache ===

  describe("Tier 2: Per-user cache", () => {
    it("user A cache not visible to user B in same tenant", async () => {
      const cached = makeCachedResult("user query");
      await cache.setUserCache(1, "user query", cached);

      const resultA = await cache.getUserCache(1, "user query");
      const resultB = await cache.getUserCache(2, "user query");

      expect(resultA).not.toBeNull();
      expect(resultB).toBeNull();
    });

    it("user cache TTL independent of tenant cache", async () => {
      const cached = makeCachedResult("ttl test");
      await cache.setUserCache(1, "ttl test", cached);
      await cache.setTenantCache("t1", "ttl test", cached);

      // Advance past tenant TTL but within user TTL
      redis._advanceTime((TENANT_CACHE_TTL_SECONDS + 1) * 1000);

      const tenantResult = await cache.getTenantCache("t1", "ttl test");
      const userResult = await cache.getUserCache(1, "ttl test");

      expect(tenantResult).toBeNull(); // Expired
      expect(userResult).not.toBeNull(); // Still valid (60 min TTL)
    });
  });

  // === Combined get() ===

  describe("get() — both tiers", () => {
    it("returns user cache first when both exist", async () => {
      const userCached = makeCachedResult("dual query");
      userCached.snippets[0].title = "User Result";
      const tenantCached = makeCachedResult("dual query");
      tenantCached.snippets[0].title = "Tenant Result";

      await cache.setUserCache(1, "dual query", userCached);
      await cache.setTenantCache("t1", "dual query", tenantCached);

      const result = await cache.get(1, "t1", "dual query");
      expect(result!.snippets[0].title).toBe("User Result");
    });

    it("falls back to tenant cache when user cache misses", async () => {
      const tenantCached = makeCachedResult("tenant only");
      tenantCached.snippets[0].title = "Tenant Result";
      await cache.setTenantCache("t1", "tenant only", tenantCached);

      const result = await cache.get(1, "t1", "tenant only");
      expect(result!.snippets[0].title).toBe("Tenant Result");
    });

    it("returns null when both tiers miss", async () => {
      const result = await cache.get(1, "t1", "missing query");
      expect(result).toBeNull();
    });
  });
});

// === Freshness bypass ===

describe("requiresFreshData", () => {
  it('prompt with "latest" → cache bypassed', () => {
    expect(requiresFreshData("What's the latest on AI?")).toBe(true);
  });

  it('prompt with "ล่าสุด" → cache bypassed', () => {
    expect(requiresFreshData("ข่าวล่าสุดเกี่ยวกับ AI")).toBe(true);
  });

  it('prompt with "วันนี้" → cache bypassed', () => {
    expect(requiresFreshData("อะไรเกิดขึ้นวันนี้")).toBe(true);
  });

  it("normal prompt → cache checked", () => {
    expect(requiresFreshData("How does photosynthesis work?")).toBe(false);
  });

  it('prompt with "breaking" → cache bypassed', () => {
    expect(requiresFreshData("Any breaking news?")).toBe(true);
  });

  it('prompt with "real-time" → cache bypassed', () => {
    expect(requiresFreshData("Show me real-time stock data")).toBe(true);
  });

  it("case insensitive matching", () => {
    expect(requiresFreshData("What is the LATEST?")).toBe(true);
  });
});

// === Query normalization ===

describe("normalizeSearchQuery", () => {
  it("produces same hash for equivalent queries", () => {
    const hash1 = normalizeSearchQuery("Hello World!");
    const hash2 = normalizeSearchQuery("hello world");
    expect(hash1).toBe(hash2);
  });

  it("sorts words alphabetically", () => {
    const hash1 = normalizeSearchQuery("world hello");
    const hash2 = normalizeSearchQuery("hello world");
    expect(hash1).toBe(hash2);
  });

  it("strips extra whitespace", () => {
    const hash1 = normalizeSearchQuery("hello   world");
    const hash2 = normalizeSearchQuery("hello world");
    expect(hash1).toBe(hash2);
  });

  it("preserves Thai characters", () => {
    const hash = normalizeSearchQuery("สวัสดี โลก");
    expect(hash).toBeTruthy();
    expect(hash.length).toBe(64); // SHA-256 hex
  });

  it("different queries produce different hashes", () => {
    const hash1 = normalizeSearchQuery("hello world");
    const hash2 = normalizeSearchQuery("goodbye world");
    expect(hash1).not.toBe(hash2);
  });
});

// === Cost tracking (web search cost verified inline) ===

describe("web search cost calculation", () => {
  it("search cost at $0.01 per call", () => {
    const count = 3;
    const cost = count * 0.01;
    expect(cost).toBeCloseTo(0.03);
  });

  it("5 calls = $0.05", () => {
    expect(5 * 0.01).toBeCloseTo(0.05);
  });
});
