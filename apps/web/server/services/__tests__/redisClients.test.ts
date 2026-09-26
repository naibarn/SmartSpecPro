/**
 * Tests for the RedisClients module that manages split Redis connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock IORedis
const mockQuit = vi.fn().mockResolvedValue("OK");
const mockPing = vi.fn().mockResolvedValue("PONG");
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockDuplicate = vi.fn();

const MockRedis = vi.fn().mockImplementation(function MockRedisClient() {
  return {
  quit: mockQuit,
  ping: mockPing,
  get: mockGet,
  set: mockSet,
  del: mockDel,
  duplicate: mockDuplicate,
  status: "ready",
  on: vi.fn(),
  };
});

vi.mock("ioredis", () => ({
  default: MockRedis,
}));

describe("RedisClients", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("redis.cache (Upstash)", () => {
    it("connects to the REDIS_UPSTASH_URL environment variable", async () => {
      process.env.REDIS_UPSTASH_URL = "rediss://default:pass@upstash-host:6379";
      process.env.REDIS_MEMORYSTORE_URL = "redis://memorystore:6379";

      const { getCacheClient } = await import("../redisClients");
      const client = getCacheClient();

      expect(MockRedis).toHaveBeenCalledWith(
        "rediss://default:pass@upstash-host:6379",
        expect.objectContaining({ maxRetriesPerRequest: 3 }),
      );
      expect(client).toBeDefined();
    });

    it("falls back to REDIS_URL when REDIS_UPSTASH_URL is not set", async () => {
      delete process.env.REDIS_UPSTASH_URL;
      delete process.env.REDIS_MEMORYSTORE_URL;
      process.env.REDIS_URL = "redis://localhost:6379";

      const { getCacheClient } = await import("../redisClients");
      const client = getCacheClient();

      expect(MockRedis).toHaveBeenCalledWith(
        "redis://localhost:6379",
        expect.any(Object),
      );
      expect(client).toBeDefined();
    });

    it("uses the dedicated JTI Redis URL for the rollback bridge", async () => {
      process.env.TOKEN_REVOKE_REDIS_URL = "rediss://jti-redis:6379";
      process.env.REDIS_UPSTASH_URL = "rediss://cache-redis:6379";

      const { getTokenRevocationClient } = await import("../redisClients");
      getTokenRevocationClient();

      expect(MockRedis).toHaveBeenCalledWith(
        "rediss://jti-redis:6379",
        expect.objectContaining({ maxRetriesPerRequest: 3 }),
      );
    });

    it("throws a descriptive error when no Redis URL is configured", async () => {
      delete process.env.REDIS_UPSTASH_URL;
      delete process.env.REDIS_URL;
      delete process.env.REDIS_MEMORYSTORE_URL;

      const { getCacheClient } = await import("../redisClients");
      expect(() => getCacheClient()).toThrow("REDIS_UPSTASH_URL");
    });
  });

  describe("redis.realtime (Memorystore)", () => {
    it("connects to the REDIS_MEMORYSTORE_URL environment variable", async () => {
      process.env.REDIS_UPSTASH_URL = "rediss://upstash:6379";
      process.env.REDIS_MEMORYSTORE_URL = "redis://10.0.0.5:6379";

      const { getRealtimeClient } = await import("../redisClients");
      const client = getRealtimeClient();

      // Should have been called twice (cache + realtime)
      expect(MockRedis).toHaveBeenCalledWith(
        "redis://10.0.0.5:6379",
        expect.objectContaining({ maxRetriesPerRequest: null }),
      );
      expect(client).toBeDefined();
    });

    it("falls back to REDIS_URL when REDIS_MEMORYSTORE_URL is not set", async () => {
      delete process.env.REDIS_UPSTASH_URL;
      delete process.env.REDIS_MEMORYSTORE_URL;
      process.env.REDIS_URL = "redis://localhost:6379";

      const { getRealtimeClient } = await import("../redisClients");
      const client = getRealtimeClient();

      expect(client).toBeDefined();
    });
  });

  describe("graceful shutdown", () => {
    it("disconnects initialized Redis clients on closeAllRedis()", async () => {
      process.env.REDIS_UPSTASH_URL = "rediss://upstash:6379";
      process.env.REDIS_MEMORYSTORE_URL = "redis://memorystore:6379";
      process.env.TOKEN_REVOKE_REDIS_URL = "redis://jti:6379";

      const { getCacheClient, getRealtimeClient, getTokenRevocationClient, closeAllRedis } =
        await import("../redisClients");

      getCacheClient();
      getRealtimeClient();
      getTokenRevocationClient();
      await closeAllRedis();

      expect(mockQuit).toHaveBeenCalledTimes(3);
    });

    it("handles shutdown gracefully when clients are not initialized", async () => {
      delete process.env.REDIS_UPSTASH_URL;
      delete process.env.REDIS_MEMORYSTORE_URL;
      delete process.env.REDIS_URL;

      const { closeAllRedis } = await import("../redisClients");
      // Should not throw
      await expect(closeAllRedis()).resolves.toBeUndefined();
    });
  });
});
