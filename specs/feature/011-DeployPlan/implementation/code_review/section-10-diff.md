diff --git a/apps/web/server/middleware/distributedRateLimit.ts b/apps/web/server/middleware/distributedRateLimit.ts
new file mode 100644
index 0000000..e0a4f23
--- /dev/null
+++ b/apps/web/server/middleware/distributedRateLimit.ts
@@ -0,0 +1,135 @@
+/**
+ * Redis-backed distributed rate limiter using sorted set sliding window.
+ *
+ * Uses the cache Redis client (Upstash in production) for distributed state.
+ * Falls open on Redis errors (allows the request) to avoid blocking users.
+ */
+
+import type { Request, Response, NextFunction } from "express";
+
+// ─── Types ──────────────────────────────────────────────────────────────────
+
+export interface RateLimitConfig {
+  limit: number;
+  windowSeconds: number;
+  identifierType: "ip" | "userId";
+}
+
+export interface RateLimitResult {
+  allowed: boolean;
+  remaining: number;
+  retryAfter: number | null;
+}
+
+// ─── Endpoint-specific rate limits ──────────────────────────────────────────
+
+export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
+  "POST /api/auth/login": { limit: 5, windowSeconds: 60, identifierType: "ip" },
+  "POST /api/auth/signup": { limit: 3, windowSeconds: 60, identifierType: "ip" },
+  "POST /api/jobs": { limit: 10, windowSeconds: 60, identifierType: "userId" },
+  "POST /api/generate": { limit: 5, windowSeconds: 60, identifierType: "userId" },
+};
+
+// ─── Sliding window check ───────────────────────────────────────────────────
+
+/**
+ * Check rate limit using Redis sorted set sliding window.
+ *
+ * Algorithm:
+ * 1. ZREMRANGEBYSCORE to prune expired entries
+ * 2. ZCARD to count current entries
+ * 3. If count >= limit: blocked, compute retryAfter from oldest entry
+ * 4. If count < limit: ZADD current timestamp, EXPIRE with window + buffer
+ *
+ * Fails open on Redis errors.
+ */
+export async function checkRateLimit(
+  key: string,
+  limit: number,
+  windowSeconds: number,
+): Promise<RateLimitResult> {
+  try {
+    // Lazy import to avoid circular dependencies during test mocking
+    const { getCacheClient } = await import("../services/redisClients");
+    const redis = getCacheClient();
+
+    const now = Date.now() / 1000; // Unix timestamp in seconds
+    const windowStart = now - windowSeconds;
+
+    // Remove expired entries
+    await redis.zremrangebyscore(key, 0, windowStart);
+
+    // Count current entries
+    const currentCount = await redis.zcard(key);
+
+    if (currentCount >= limit) {
+      // Over limit — compute retry-after from oldest entry
+      const oldest = await redis.zrange(key, 0, 0);
+      let retryAfter = windowSeconds;
+      if (oldest.length > 0) {
+        const oldestTime = parseFloat(oldest[0]);
+        retryAfter = Math.ceil(oldestTime + windowSeconds - now);
+        if (retryAfter < 1) retryAfter = 1;
+      }
+
+      return { allowed: false, remaining: 0, retryAfter };
+    }
+
+    // Under limit — add current request
+    await redis.zadd(key, now, String(now));
+    await redis.expire(key, windowSeconds + 60); // Buffer to handle clock skew
+
+    return {
+      allowed: true,
+      remaining: limit - currentCount - 1,
+      retryAfter: null,
+    };
+  } catch (error) {
+    // Fail open: allow the request when Redis is unavailable
+    console.warn("[RateLimit] Redis error, failing open:", (error as Error).message);
+    return { allowed: true, remaining: -1, retryAfter: null };
+  }
+}
+
+// ─── Express middleware factory ─────────────────────────────────────────────
+
+function extractIp(req: Request): string {
+  const forwarded = req.headers["x-forwarded-for"];
+  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
+  return req.ip || "unknown";
+}
+
+/**
+ * Create an Express middleware that applies distributed rate limiting.
+ *
+ * @param config - Rate limit configuration for the endpoint
+ * @param namespace - Namespace prefix for the Redis key (e.g., "login", "signup")
+ */
+export function distributedRateLimitMiddleware(
+  namespace: string,
+  config: RateLimitConfig,
+) {
+  return async (req: Request, res: Response, next: NextFunction) => {
+    const identifier =
+      config.identifierType === "ip"
+        ? extractIp(req)
+        : (req as any).userId || extractIp(req);
+
+    const key = `ratelimit:${namespace}:${identifier}`;
+    const result = await checkRateLimit(key, config.limit, config.windowSeconds);
+
+    if (!result.allowed) {
+      res.set("Retry-After", String(result.retryAfter));
+      return res.status(429).json({
+        error: "Too many requests",
+        retryAfter: result.retryAfter,
+      });
+    }
+
+    // Set rate limit headers
+    res.set("X-RateLimit-Limit", String(config.limit));
+    res.set("X-RateLimit-Remaining", String(Math.max(0, result.remaining)));
+
+    next();
+  };
+}
diff --git a/apps/web/server/services/__tests__/distributedRateLimit.test.ts b/apps/web/server/services/__tests__/distributedRateLimit.test.ts
new file mode 100644
index 0000000..7e191ec
--- /dev/null
+++ b/apps/web/server/services/__tests__/distributedRateLimit.test.ts
@@ -0,0 +1,108 @@
+/**
+ * Tests for the Redis-backed distributed rate limiter middleware.
+ */
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock Redis operations for sorted set sliding window
+const mockZremrangebyscore = vi.fn().mockResolvedValue(0);
+const mockZcard = vi.fn().mockResolvedValue(0);
+const mockZadd = vi.fn().mockResolvedValue(1);
+const mockExpire = vi.fn().mockResolvedValue(1);
+const mockZrange = vi.fn().mockResolvedValue([]);
+
+const mockCacheClient = {
+  zremrangebyscore: mockZremrangebyscore,
+  zcard: mockZcard,
+  zadd: mockZadd,
+  expire: mockExpire,
+  zrange: mockZrange,
+};
+
+vi.mock("../redisClients", () => ({
+  getCacheClient: () => mockCacheClient,
+  isCacheHealthy: vi.fn().mockResolvedValue(true),
+}));
+
+// Import after mocks
+import {
+  checkRateLimit,
+  RATE_LIMIT_CONFIGS,
+} from "../../middleware/distributedRateLimit";
+
+describe("Distributed Rate Limiter (Node.js)", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockZcard.mockResolvedValue(0);
+  });
+
+  describe("sliding window algorithm", () => {
+    it("allows requests within the configured limit", async () => {
+      mockZcard.mockResolvedValue(2); // 2 requests in window, limit is 5
+      const result = await checkRateLimit("ratelimit:login:1.2.3.4", 5, 60);
+
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBe(2); // 5 - 2 - 1 = 2
+      expect(mockZadd).toHaveBeenCalled();
+    });
+
+    it("returns blocked when limit is exceeded", async () => {
+      mockZcard.mockResolvedValue(5); // 5 requests already, limit is 5
+      mockZrange.mockResolvedValue(["1707900000"]);
+
+      const result = await checkRateLimit("ratelimit:login:1.2.3.4", 5, 60);
+
+      expect(result.allowed).toBe(false);
+      expect(result.retryAfter).toBeGreaterThan(0);
+      expect(mockZadd).not.toHaveBeenCalled();
+    });
+
+    it("uses per-IP key pattern for auth endpoints", () => {
+      const loginConfig = RATE_LIMIT_CONFIGS["POST /api/auth/login"];
+      expect(loginConfig).toBeDefined();
+      expect(loginConfig.identifierType).toBe("ip");
+    });
+
+    it("uses per-userId key pattern for job endpoints", () => {
+      const jobConfig = RATE_LIMIT_CONFIGS["POST /api/jobs"];
+      expect(jobConfig).toBeDefined();
+      expect(jobConfig.identifierType).toBe("userId");
+    });
+  });
+
+  describe("endpoint-specific limits", () => {
+    it("enforces 5 requests/minute for POST /api/auth/login", () => {
+      const config = RATE_LIMIT_CONFIGS["POST /api/auth/login"];
+      expect(config.limit).toBe(5);
+      expect(config.windowSeconds).toBe(60);
+    });
+
+    it("enforces 3 requests/minute for POST /api/auth/signup", () => {
+      const config = RATE_LIMIT_CONFIGS["POST /api/auth/signup"];
+      expect(config.limit).toBe(3);
+      expect(config.windowSeconds).toBe(60);
+    });
+
+    it("enforces 10 requests/minute for POST /api/jobs", () => {
+      const config = RATE_LIMIT_CONFIGS["POST /api/jobs"];
+      expect(config.limit).toBe(10);
+      expect(config.windowSeconds).toBe(60);
+    });
+
+    it("enforces 5 requests/minute for POST /api/generate", () => {
+      const config = RATE_LIMIT_CONFIGS["POST /api/generate"];
+      expect(config.limit).toBe(5);
+      expect(config.windowSeconds).toBe(60);
+    });
+  });
+
+  describe("Redis failure handling", () => {
+    it("fails open (allows request) when Redis throws", async () => {
+      mockZremrangebyscore.mockRejectedValueOnce(new Error("Connection refused"));
+
+      const result = await checkRateLimit("ratelimit:test:key", 5, 60);
+
+      expect(result.allowed).toBe(true);
+      expect(result.remaining).toBe(-1); // Unknown
+    });
+  });
+});
diff --git a/apps/web/server/services/__tests__/redisClients.test.ts b/apps/web/server/services/__tests__/redisClients.test.ts
new file mode 100644
index 0000000..4afdc26
--- /dev/null
+++ b/apps/web/server/services/__tests__/redisClients.test.ts
@@ -0,0 +1,134 @@
+/**
+ * Tests for the RedisClients module that manages split Redis connections.
+ */
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// Mock IORedis
+const mockQuit = vi.fn().mockResolvedValue("OK");
+const mockPing = vi.fn().mockResolvedValue("PONG");
+const mockGet = vi.fn();
+const mockSet = vi.fn();
+const mockDel = vi.fn();
+const mockDuplicate = vi.fn();
+
+const MockRedis = vi.fn().mockImplementation(() => ({
+  quit: mockQuit,
+  ping: mockPing,
+  get: mockGet,
+  set: mockSet,
+  del: mockDel,
+  duplicate: mockDuplicate,
+  status: "ready",
+  on: vi.fn(),
+}));
+
+vi.mock("ioredis", () => ({
+  default: MockRedis,
+}));
+
+describe("RedisClients", () => {
+  const originalEnv = { ...process.env };
+
+  beforeEach(() => {
+    vi.clearAllMocks();
+    vi.resetModules();
+  });
+
+  afterEach(() => {
+    process.env = { ...originalEnv };
+  });
+
+  describe("redis.cache (Upstash)", () => {
+    it("connects to the REDIS_UPSTASH_URL environment variable", async () => {
+      process.env.REDIS_UPSTASH_URL = "rediss://default:pass@upstash-host:6379";
+      process.env.REDIS_MEMORYSTORE_URL = "redis://memorystore:6379";
+
+      const { getCacheClient } = await import("../redisClients");
+      const client = getCacheClient();
+
+      expect(MockRedis).toHaveBeenCalledWith(
+        "rediss://default:pass@upstash-host:6379",
+        expect.objectContaining({ maxRetriesPerRequest: 3 }),
+      );
+      expect(client).toBeDefined();
+    });
+
+    it("falls back to REDIS_URL when REDIS_UPSTASH_URL is not set", async () => {
+      delete process.env.REDIS_UPSTASH_URL;
+      delete process.env.REDIS_MEMORYSTORE_URL;
+      process.env.REDIS_URL = "redis://localhost:6379";
+
+      const { getCacheClient } = await import("../redisClients");
+      const client = getCacheClient();
+
+      expect(MockRedis).toHaveBeenCalledWith(
+        "redis://localhost:6379",
+        expect.any(Object),
+      );
+      expect(client).toBeDefined();
+    });
+
+    it("throws a descriptive error when no Redis URL is configured", async () => {
+      delete process.env.REDIS_UPSTASH_URL;
+      delete process.env.REDIS_URL;
+      delete process.env.REDIS_MEMORYSTORE_URL;
+
+      const { getCacheClient } = await import("../redisClients");
+      expect(() => getCacheClient()).toThrow("REDIS_UPSTASH_URL");
+    });
+  });
+
+  describe("redis.realtime (Memorystore)", () => {
+    it("connects to the REDIS_MEMORYSTORE_URL environment variable", async () => {
+      process.env.REDIS_UPSTASH_URL = "rediss://upstash:6379";
+      process.env.REDIS_MEMORYSTORE_URL = "redis://10.0.0.5:6379";
+
+      const { getRealtimeClient } = await import("../redisClients");
+      const client = getRealtimeClient();
+
+      // Should have been called twice (cache + realtime)
+      expect(MockRedis).toHaveBeenCalledWith(
+        "redis://10.0.0.5:6379",
+        expect.objectContaining({ maxRetriesPerRequest: null }),
+      );
+      expect(client).toBeDefined();
+    });
+
+    it("falls back to REDIS_URL when REDIS_MEMORYSTORE_URL is not set", async () => {
+      delete process.env.REDIS_UPSTASH_URL;
+      delete process.env.REDIS_MEMORYSTORE_URL;
+      process.env.REDIS_URL = "redis://localhost:6379";
+
+      const { getRealtimeClient } = await import("../redisClients");
+      const client = getRealtimeClient();
+
+      expect(client).toBeDefined();
+    });
+  });
+
+  describe("graceful shutdown", () => {
+    it("disconnects both clients on closeAllRedis()", async () => {
+      process.env.REDIS_UPSTASH_URL = "rediss://upstash:6379";
+      process.env.REDIS_MEMORYSTORE_URL = "redis://memorystore:6379";
+
+      const { getCacheClient, getRealtimeClient, closeAllRedis } =
+        await import("../redisClients");
+
+      getCacheClient();
+      getRealtimeClient();
+      await closeAllRedis();
+
+      expect(mockQuit).toHaveBeenCalledTimes(2);
+    });
+
+    it("handles shutdown gracefully when clients are not initialized", async () => {
+      delete process.env.REDIS_UPSTASH_URL;
+      delete process.env.REDIS_MEMORYSTORE_URL;
+      delete process.env.REDIS_URL;
+
+      const { closeAllRedis } = await import("../redisClients");
+      // Should not throw
+      await expect(closeAllRedis()).resolves.toBeUndefined();
+    });
+  });
+});
diff --git a/apps/web/server/services/redisClients.ts b/apps/web/server/services/redisClients.ts
new file mode 100644
index 0000000..4a495ac
--- /dev/null
+++ b/apps/web/server/services/redisClients.ts
@@ -0,0 +1,142 @@
+/**
+ * Split Redis adapter for Cloud Run deployment.
+ *
+ * - Cache client (Upstash): stateless ops -- rate limiting, locks, dedup, flags.
+ *   Connected via REDIS_UPSTASH_URL. Uses IORedis with rediss:// protocol.
+ *
+ * - Realtime client (Memorystore): connection-oriented ops -- pub/sub, concurrency sets.
+ *   Connected via REDIS_MEMORYSTORE_URL. Uses IORedis with persistent TCP.
+ *
+ * For local development, both clients fall back to REDIS_URL (single Redis instance).
+ */
+
+import Redis from "ioredis";
+import type { RedisOptions } from "ioredis";
+
+// ─── Lazy singletons ────────────────────────────────────────────────────────
+
+let _cacheClient: Redis | null = null;
+let _realtimeClient: Redis | null = null;
+
+// ─── URL resolution ─────────────────────────────────────────────────────────
+
+function resolveCacheUrl(): string {
+  const url =
+    process.env.REDIS_UPSTASH_URL || process.env.REDIS_URL;
+  if (!url) {
+    throw new Error(
+      "Redis cache not configured. Set REDIS_UPSTASH_URL (production) or REDIS_URL (local dev).",
+    );
+  }
+  return url;
+}
+
+function resolveRealtimeUrl(): string {
+  const url =
+    process.env.REDIS_MEMORYSTORE_URL || process.env.REDIS_URL;
+  if (!url) {
+    throw new Error(
+      "Redis realtime not configured. Set REDIS_MEMORYSTORE_URL (production) or REDIS_URL (local dev).",
+    );
+  }
+  return url;
+}
+
+// ─── Cache client (Upstash or local Redis) ──────────────────────────────────
+
+const CACHE_OPTIONS: RedisOptions = {
+  maxRetriesPerRequest: 3,
+  enableReadyCheck: true,
+  retryStrategy: (times) => {
+    if (times > 5) return null;
+    return Math.min(times * 200, 2000);
+  },
+  lazyConnect: true,
+};
+
+/**
+ * Get the cache Redis client (Upstash in production, local Redis in dev).
+ * Used for: rate limiting, locks, dedup keys, feature flags.
+ */
+export function getCacheClient(): Redis {
+  if (!_cacheClient) {
+    const url = resolveCacheUrl();
+    _cacheClient = new Redis(url, CACHE_OPTIONS);
+  }
+  return _cacheClient;
+}
+
+// ─── Realtime client (Memorystore or local Redis) ───────────────────────────
+
+const REALTIME_OPTIONS: RedisOptions = {
+  maxRetriesPerRequest: null, // Required for Bottleneck/BullMQ compatibility
+  enableReadyCheck: true,
+  retryStrategy: (times) => {
+    if (times > 5) return null;
+    return Math.min(times * 200, 2000);
+  },
+  lazyConnect: true,
+};
+
+/**
+ * Get the realtime Redis client (Memorystore in production, local Redis in dev).
+ * Used for: pub/sub, concurrency sets, Bottleneck state.
+ */
+export function getRealtimeClient(): Redis {
+  if (!_realtimeClient) {
+    const url = resolveRealtimeUrl();
+    _realtimeClient = new Redis(url, REALTIME_OPTIONS);
+  }
+  return _realtimeClient;
+}
+
+/**
+ * Create a duplicate IORedis connection for subscriber use cases.
+ * Each subscriber needs its own connection since SUBSCRIBE blocks.
+ */
+export function createRealtimeSubscriber(): Redis {
+  const url = resolveRealtimeUrl();
+  return new Redis(url, {
+    ...REALTIME_OPTIONS,
+    maxRetriesPerRequest: 3,
+  });
+}
+
+// ─── Health checks ──────────────────────────────────────────────────────────
+
+export async function isCacheHealthy(): Promise<boolean> {
+  try {
+    if (!_cacheClient) return false;
+    const result = await _cacheClient.ping();
+    return result === "PONG";
+  } catch {
+    return false;
+  }
+}
+
+export async function isRealtimeHealthy(): Promise<boolean> {
+  try {
+    if (!_realtimeClient) return false;
+    const result = await _realtimeClient.ping();
+    return result === "PONG";
+  } catch {
+    return false;
+  }
+}
+
+// ─── Graceful shutdown ──────────────────────────────────────────────────────
+
+export async function closeAllRedis(): Promise<void> {
+  const promises: Promise<string>[] = [];
+  if (_cacheClient) {
+    promises.push(_cacheClient.quit());
+    _cacheClient = null;
+  }
+  if (_realtimeClient) {
+    promises.push(_realtimeClient.quit());
+    _realtimeClient = null;
+  }
+  if (promises.length > 0) {
+    await Promise.allSettled(promises);
+  }
+}
diff --git a/python-backend/app/core/distributed_rate_limiter.py b/python-backend/app/core/distributed_rate_limiter.py
index a207541..b40c589 100644
--- a/python-backend/app/core/distributed_rate_limiter.py
+++ b/python-backend/app/core/distributed_rate_limiter.py
@@ -205,9 +205,12 @@ def get_distributed_rate_limiter() -> DistributedRateLimiter:
         try:
             import redis.asyncio as redis
             from app.core.config import settings
+            from app.core.redis_client import _resolve_cache_url
 
+            # Prefer Upstash URL for distributed rate limiting
+            redis_url = _resolve_cache_url() or settings.REDIS_URL
             redis_client = redis.from_url(
-                settings.REDIS_URL,
+                redis_url,
                 encoding="utf-8",
                 decode_responses=True
             )
diff --git a/python-backend/app/core/redis_client.py b/python-backend/app/core/redis_client.py
index 820b3a6..ef706e8 100644
--- a/python-backend/app/core/redis_client.py
+++ b/python-backend/app/core/redis_client.py
@@ -1,33 +1,87 @@
 """
-Redis client stub - provides get_redis() function
+Split Redis client for Cloud Run deployment.
+
+- Cache client (Upstash): rate limiting, locks, dedup, flags.
+  Connected via REDIS_UPSTASH_URL. Falls back to REDIS_URL for local dev.
+
+- Realtime client (Memorystore): pub/sub, concurrency sets.
+  Connected via REDIS_MEMORYSTORE_URL. Falls back to REDIS_URL for local dev.
+
+- get_redis(): Compatibility shim that returns the cache client.
 """
+
+import os
 from typing import Optional
+
 from redis.asyncio import Redis
 
 _redis_client: Optional[Redis] = None
+_cache_client: Optional[Redis] = None
+_realtime_client: Optional[Redis] = None
+
+
+# ─── URL resolution (exported for testing) ────────────────────────────────────
+
+def _resolve_cache_url() -> Optional[str]:
+    """Resolve the Redis URL for stateless/cache operations."""
+    return os.getenv("REDIS_UPSTASH_URL") or os.getenv("REDIS_URL") or None
+
+
+def _resolve_realtime_url() -> Optional[str]:
+    """Resolve the Redis URL for connection-oriented operations."""
+    return os.getenv("REDIS_MEMORYSTORE_URL") or os.getenv("REDIS_URL") or None
 
 
+# ─── Cache client (Upstash or local Redis) ────────────────────────────────────
+
+async def get_cache_redis() -> Optional[Redis]:
+    """Get Upstash Redis client for stateless operations (rate limit, locks, dedup)."""
+    global _cache_client
+    if _cache_client is None:
+        url = _resolve_cache_url()
+        if url:
+            try:
+                _cache_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
+                await _cache_client.ping()
+            except Exception as e:
+                print(f"[Redis:Cache] Connection failed: {e}")
+                _cache_client = None
+    return _cache_client
+
+
+# ─── Realtime client (Memorystore or local Redis) ─────────────────────────────
+
+async def get_realtime_redis() -> Optional[Redis]:
+    """Get Memorystore Redis client for pub/sub and connection-oriented ops."""
+    global _realtime_client
+    if _realtime_client is None:
+        url = _resolve_realtime_url()
+        if url:
+            try:
+                _realtime_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
+                await _realtime_client.ping()
+            except Exception as e:
+                print(f"[Redis:Realtime] Connection failed: {e}")
+                _realtime_client = None
+    return _realtime_client
+
+
+# ─── Compatibility shim ───────────────────────────────────────────────────────
+
 async def get_redis() -> Optional[Redis]:
     """
-    Get Redis client instance.
-    Returns None if Redis is not configured or unavailable.
+    Get Redis client instance (compatibility shim).
+    Returns the cache client, or falls back to REDIS_URL.
     """
     global _redis_client
-
-    # Lazy initialization
     if _redis_client is None:
         try:
             from app.core.settings import settings
-            if settings.REDIS_URL:
-                _redis_client = Redis.from_url(
-                    settings.REDIS_URL,
-                    encoding="utf-8",
-                    decode_responses=True
-                )
-                # Test connection
+            url = _resolve_cache_url() or (settings.REDIS_URL if hasattr(settings, "REDIS_URL") else None)
+            if url:
+                _redis_client = Redis.from_url(url, encoding="utf-8", decode_responses=True)
                 await _redis_client.ping()
         except Exception as e:
             print(f"[Redis] Connection failed: {e}")
             _redis_client = None
-
     return _redis_client
diff --git a/python-backend/tests/unit/test_redis_rate_limit.py b/python-backend/tests/unit/test_redis_rate_limit.py
new file mode 100644
index 0000000..12fe420
--- /dev/null
+++ b/python-backend/tests/unit/test_redis_rate_limit.py
@@ -0,0 +1,125 @@
+"""
+Tests for the Python-side Redis rate limiting and split Redis client configuration.
+"""
+
+import os
+import time
+from unittest.mock import AsyncMock, MagicMock, patch
+
+import pytest
+
+
+class TestPythonRedisClients:
+    """Verify the Python Redis client adapter correctly routes operations."""
+
+    def test_cache_client_uses_upstash_url(self):
+        """Cache operations use REDIS_UPSTASH_URL."""
+        from app.core.redis_client import _resolve_cache_url
+
+        env = {"REDIS_UPSTASH_URL": "rediss://upstash:6379", "REDIS_URL": "redis://local:6379"}
+        with patch.dict(os.environ, env, clear=False):
+            url = _resolve_cache_url()
+            assert url == "rediss://upstash:6379"
+
+    def test_cache_client_falls_back_to_redis_url(self):
+        """Falls back to REDIS_URL when REDIS_UPSTASH_URL not set."""
+        from app.core.redis_client import _resolve_cache_url
+
+        cleared = {"REDIS_UPSTASH_URL": ""}
+        env = {"REDIS_URL": "redis://local:6379"}
+        with patch.dict(os.environ, {**env, **cleared}, clear=False):
+            url = _resolve_cache_url()
+            assert url == "redis://local:6379"
+
+    def test_realtime_client_uses_memorystore_url(self):
+        """Realtime operations use REDIS_MEMORYSTORE_URL."""
+        from app.core.redis_client import _resolve_realtime_url
+
+        env = {"REDIS_MEMORYSTORE_URL": "redis://10.0.0.5:6379", "REDIS_URL": "redis://local:6379"}
+        with patch.dict(os.environ, env, clear=False):
+            url = _resolve_realtime_url()
+            assert url == "redis://10.0.0.5:6379"
+
+    def test_realtime_client_falls_back_to_redis_url(self):
+        """Falls back to REDIS_URL when REDIS_MEMORYSTORE_URL not set."""
+        from app.core.redis_client import _resolve_realtime_url
+
+        cleared = {"REDIS_MEMORYSTORE_URL": ""}
+        env = {"REDIS_URL": "redis://local:6379"}
+        with patch.dict(os.environ, {**env, **cleared}, clear=False):
+            url = _resolve_realtime_url()
+            assert url == "redis://local:6379"
+
+
+class TestPythonRateLimiting:
+    """Rate limiting via distributed_rate_limiter.py."""
+
+    @pytest.mark.asyncio
+    async def test_request_within_limit_is_allowed(self):
+        """Requests under the threshold should return allowed=True."""
+        from app.core.distributed_rate_limiter import DistributedRateLimiter
+
+        mock_redis = AsyncMock()
+        mock_redis.zremrangebyscore = AsyncMock(return_value=0)
+        mock_redis.zcard = AsyncMock(return_value=2)
+        mock_redis.zadd = AsyncMock(return_value=1)
+        mock_redis.expire = AsyncMock(return_value=1)
+
+        limiter = DistributedRateLimiter(redis_client=mock_redis)
+        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)
+
+        assert result.allowed is True
+        assert result.remaining == 2  # 5 - 2 - 1
+
+    @pytest.mark.asyncio
+    async def test_request_over_limit_returns_blocked(self):
+        """Exceeding the limit should return allowed=False with retry_after."""
+        from app.core.distributed_rate_limiter import DistributedRateLimiter
+
+        now = time.time()
+        mock_redis = AsyncMock()
+        mock_redis.zremrangebyscore = AsyncMock(return_value=0)
+        mock_redis.zcard = AsyncMock(return_value=5)
+        mock_redis.zrange = AsyncMock(return_value=[(str(now - 30), now - 30)])
+
+        limiter = DistributedRateLimiter(redis_client=mock_redis)
+        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)
+
+        assert result.allowed is False
+        assert result.retry_after is not None
+        assert result.retry_after > 0
+
+    @pytest.mark.asyncio
+    async def test_fails_open_when_redis_unavailable(self):
+        """When Redis is unreachable, requests are allowed (fail-open)."""
+        from app.core.distributed_rate_limiter import DistributedRateLimiter
+
+        # No redis client (None)
+        limiter = DistributedRateLimiter(redis_client=None)
+        result = await limiter.check_rate_limit("test:key", max_requests=5, window_seconds=60)
+
+        # Should use memory fallback and allow
+        assert result.allowed is True
+
+    def test_uses_upstash_url_for_rate_limiting(self):
+        """get_distributed_rate_limiter uses REDIS_UPSTASH_URL when available."""
+        import importlib
+        import redis.asyncio as redis_mod
+
+        env = {"REDIS_UPSTASH_URL": "rediss://upstash:6379"}
+        with patch.dict(os.environ, env, clear=False):
+            with patch.object(redis_mod, "from_url") as mock_from_url:
+                mock_client = MagicMock()
+                mock_from_url.return_value = mock_client
+
+                # Reset the singleton
+                import app.core.distributed_rate_limiter as drl
+                drl._distributed_rate_limiter = None
+                limiter = drl.get_distributed_rate_limiter()
+                # Restore
+                drl._distributed_rate_limiter = None
+
+                # Should use the upstash URL
+                mock_from_url.assert_called_once()
+                call_url = mock_from_url.call_args[0][0]
+                assert "upstash" in call_url
