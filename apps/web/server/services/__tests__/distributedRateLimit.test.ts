/**
 * Tests for the Redis-backed distributed rate limiter middleware.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis operations for sorted set sliding window
const mockZremrangebyscore = vi.fn().mockResolvedValue(0);
const mockZcard = vi.fn().mockResolvedValue(0);
const mockZadd = vi.fn().mockResolvedValue(1);
const mockExpire = vi.fn().mockResolvedValue(1);
const mockZrange = vi.fn().mockResolvedValue([]);

const mockCacheClient = {
  zremrangebyscore: mockZremrangebyscore,
  zcard: mockZcard,
  zadd: mockZadd,
  expire: mockExpire,
  zrange: mockZrange,
};

vi.mock("../redisClients", () => ({
  getCacheClient: () => mockCacheClient,
  isCacheHealthy: vi.fn().mockResolvedValue(true),
}));

// Import after mocks
import {
  checkRateLimit,
  RATE_LIMIT_CONFIGS,
} from "../../middleware/distributedRateLimit";

describe("Distributed Rate Limiter (Node.js)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockZcard.mockResolvedValue(0);
  });

  describe("sliding window algorithm", () => {
    it("allows requests within the configured limit", async () => {
      mockZcard.mockResolvedValue(2); // 2 requests in window, limit is 5
      const result = await checkRateLimit("ratelimit:login:1.2.3.4", 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2); // 5 - 2 - 1 = 2
      expect(mockZadd).toHaveBeenCalled();
    });

    it("returns blocked when limit is exceeded", async () => {
      mockZcard.mockResolvedValue(5); // 5 requests already, limit is 5
      mockZrange.mockResolvedValue(["1707900000"]);

      const result = await checkRateLimit("ratelimit:login:1.2.3.4", 5, 60);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(mockZadd).not.toHaveBeenCalled();
    });

    it("uses per-IP key pattern for auth endpoints", () => {
      const loginConfig = RATE_LIMIT_CONFIGS["POST /api/auth/login"];
      expect(loginConfig).toBeDefined();
      expect(loginConfig.identifierType).toBe("ip");
    });

    it("uses per-userId key pattern for job endpoints", () => {
      const jobConfig = RATE_LIMIT_CONFIGS["POST /api/jobs"];
      expect(jobConfig).toBeDefined();
      expect(jobConfig.identifierType).toBe("userId");
    });
  });

  describe("endpoint-specific limits", () => {
    it("enforces 5 requests/minute for POST /api/auth/login", () => {
      const config = RATE_LIMIT_CONFIGS["POST /api/auth/login"];
      expect(config.limit).toBe(5);
      expect(config.windowSeconds).toBe(60);
    });

    it("enforces 3 requests/minute for POST /api/auth/signup", () => {
      const config = RATE_LIMIT_CONFIGS["POST /api/auth/signup"];
      expect(config.limit).toBe(3);
      expect(config.windowSeconds).toBe(60);
    });

    it("enforces 10 requests/minute for POST /api/jobs", () => {
      const config = RATE_LIMIT_CONFIGS["POST /api/jobs"];
      expect(config.limit).toBe(10);
      expect(config.windowSeconds).toBe(60);
    });

    it("enforces 5 requests/minute for POST /api/generate", () => {
      const config = RATE_LIMIT_CONFIGS["POST /api/generate"];
      expect(config.limit).toBe(5);
      expect(config.windowSeconds).toBe(60);
    });
  });

  describe("Redis failure handling", () => {
    it("fails open (allows request) when Redis throws", async () => {
      mockZremrangebyscore.mockRejectedValueOnce(new Error("Connection refused"));

      const result = await checkRateLimit("ratelimit:test:key", 5, 60);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(-1); // Unknown
    });
  });
});
