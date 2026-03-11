import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./redis", () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from "./redis";
import {
  checkHourlyRate,
  acquireConcurrentSlot,
  releaseConcurrentSlot,
  checkDailyBatchLimit,
} from "./contentAutomationRateLimit";

const mockGetRedisClient = vi.mocked(getRedisClient);

function makeMockRedis(overrides: Record<string, unknown> = {}) {
  return {
    incr: vi.fn(),
    expire: vi.fn(),
    expireat: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    setnx: vi.fn(),
    decr: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
    ...overrides,
  };
}

describe("contentAutomationRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("checkHourlyRate", () => {
    it("allows first request within interactive limit", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(1),
        expire: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkHourlyRate(1, "interactive");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it("blocks request exceeding 10/hour for interactive", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(11),
        expire: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkHourlyRate(1, "interactive");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("blocks request exceeding 50/hour for batch", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(51),
        expire: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkHourlyRate(1, "batch");

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("allows requests within batch limit (50/hour)", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(25),
        expire: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkHourlyRate(1, "batch");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(25);
    });
  });

  describe("acquireConcurrentSlot", () => {
    it("allows up to 3 simultaneous drafts (Lua returns 1)", async () => {
      const redis = makeMockRedis({
        eval: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await acquireConcurrentSlot(1);

      expect(result.allowed).toBe(true);
      expect(redis.eval).toHaveBeenCalled();
    });

    it("blocks 4th concurrent draft (Lua returns 0)", async () => {
      const redis = makeMockRedis({
        eval: vi.fn().mockResolvedValue(0),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await acquireConcurrentSlot(1);

      expect(result.allowed).toBe(false);
    });
  });

  describe("releaseConcurrentSlot", () => {
    it("decrements the semaphore correctly", async () => {
      const redis = makeMockRedis({
        get: vi.fn().mockResolvedValue("2"),
        decr: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      await releaseConcurrentSlot(1);

      expect(redis.decr).toHaveBeenCalledWith("rate:concurrent_draft:1");
    });

    it("does not decrement when value is already 0 (floor at zero)", async () => {
      const redis = makeMockRedis({
        get: vi.fn().mockResolvedValue("0"),
        decr: vi.fn().mockResolvedValue(-1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      await releaseConcurrentSlot(1);

      // Should NOT call decr when value is already 0
      expect(redis.decr).not.toHaveBeenCalled();
    });
  });

  describe("checkDailyBatchLimit", () => {
    it("allows requests within daily limit", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(50),
        expireat: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkDailyBatchLimit(1);

      expect(result.allowed).toBe(true);
      expect(result.used).toBe(50);
      expect(result.limit).toBe(100);
    });

    it("blocks after 100 items per day", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(101),
        expireat: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      const result = await checkDailyBatchLimit(1);

      expect(result.allowed).toBe(false);
      expect(result.used).toBe(101);
    });

    it("sets EXPIREAT to next midnight UTC only on first increment", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(1),
        expireat: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      await checkDailyBatchLimit(1);

      expect(redis.expireat).toHaveBeenCalled();
      // Verify the expireat timestamp is in the future (next midnight UTC)
      const call = redis.expireat.mock.calls[0];
      const expireTs = call[1] as number;
      const now = Math.floor(Date.now() / 1000);
      expect(expireTs).toBeGreaterThan(now);
    });

    it("does not reset expireat on subsequent increments", async () => {
      const redis = makeMockRedis({
        incr: vi.fn().mockResolvedValue(50), // not first increment
        expireat: vi.fn().mockResolvedValue(1),
      });
      mockGetRedisClient.mockReturnValue(redis as any);

      await checkDailyBatchLimit(1);

      // expireat should NOT be called when count > 1
      expect(redis.expireat).not.toHaveBeenCalled();
    });
  });
});
