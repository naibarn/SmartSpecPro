import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  expireat: vi.fn(),
  get: vi.fn(),
  incrby: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
};

vi.mock("./redis", () => ({
  getRedisClient: () => mockRedis,
}));

import {
  checkRateLimit,
  checkDailyCreditLimit,
  incrementDailyCredits,
} from "./apiKeyRateLimiter";

describe("apiKeyRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.expireat.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incrby.mockResolvedValue(1);
  });

  describe("checkRateLimit", () => {
    it("allows requests under per-key limit", async () => {
      mockRedis.incr.mockResolvedValue(5);
      const result = await checkRateLimit("key1", "tenant1", 60);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBeLessThanOrEqual(55);
    });

    it("returns 429 info when per-key limit exceeded", async () => {
      mockRedis.incr.mockResolvedValueOnce(61).mockResolvedValueOnce(61);
      const result = await checkRateLimit("key1", "tenant1", 60);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("returns 429 info when per-tenant limit exceeded", async () => {
      mockRedis.incr.mockResolvedValueOnce(5).mockResolvedValueOnce(601);
      const result = await checkRateLimit("key1", "tenant1", 60);
      expect(result.allowed).toBe(false);
    });

    it("sets correct X-RateLimit-* header values", async () => {
      mockRedis.incr.mockResolvedValue(10);
      const result = await checkRateLimit("key1", "tenant1", 60);
      expect(result.headers["X-RateLimit-Limit"]).toBe("60");
      expect(result.headers["X-RateLimit-Remaining"]).toBeDefined();
      expect(result.headers["X-RateLimit-Reset"]).toBeDefined();
      expect(Number(result.headers["X-RateLimit-Reset"])).toBeGreaterThan(
        Math.floor(Date.now() / 1000),
      );
    });

    it("calls EXPIRE with 120s TTL on first request", async () => {
      mockRedis.incr.mockResolvedValue(1);
      await checkRateLimit("key1", "tenant1", 60);
      expect(mockRedis.expire).toHaveBeenCalledWith(
        expect.stringContaining("ratelimit:apikey:key1:"),
        120,
      );
    });
  });

  describe("checkDailyCreditLimit", () => {
    it("returns allowed=false when exceeded", async () => {
      mockRedis.get.mockResolvedValue("1000");
      const result = await checkDailyCreditLimit("key1", 500);
      expect(result.allowed).toBe(false);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("null creditLimit means unlimited", async () => {
      const result = await checkDailyCreditLimit("key1", null);
      expect(result.allowed).toBe(true);
    });

    it("returns remaining credits when under limit", async () => {
      mockRedis.get.mockResolvedValue("200");
      const result = await checkDailyCreditLimit("key1", 500);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(300);
    });

    it("incrementDailyCredits adds to the daily counter", async () => {
      await incrementDailyCredits("key1", 50);
      expect(mockRedis.incrby).toHaveBeenCalledWith(
        expect.stringContaining("creditlimit:apikey:key1:"),
        50,
      );
      expect(mockRedis.expireat).toHaveBeenCalled();
    });
  });
});
