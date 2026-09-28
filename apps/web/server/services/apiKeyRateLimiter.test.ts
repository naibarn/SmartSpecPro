import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  expireat: vi.fn(),
  get: vi.fn(),
  incrby: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  pipeline: vi.fn(),
};
const mockPipeline = {
  incrby: vi.fn(),
  expire: vi.fn(),
  exec: vi.fn(),
};

vi.mock("./redis", () => ({
  getRedisClient: () => mockRedis,
}));

import {
  checkRateLimit,
  checkDailyCreditLimit,
  incrementDailyCredits,
  checkCreditQuotas,
  incrementCreditQuotas,
  rateLimitMiddleware,
} from "./apiKeyRateLimiter";

describe("apiKeyRateLimiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.incr.mockResolvedValue(1);
    mockRedis.expire.mockResolvedValue(1);
    mockRedis.expireat.mockResolvedValue(1);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.incrby.mockResolvedValue(1);
    mockRedis.pipeline.mockReturnValue(mockPipeline);
    mockPipeline.incrby.mockReturnValue(mockPipeline);
    mockPipeline.expire.mockReturnValue(mockPipeline);
    mockPipeline.exec.mockResolvedValue([[null, 1], [null, 1], [null, 1]]);
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

  describe("MCP multi-window credit quotas", () => {
    it("reports remaining credits for 5h, daily, and weekly windows", async () => {
      mockRedis.get
        .mockResolvedValueOnce("100")
        .mockResolvedValueOnce("400")
        .mockResolvedValueOnce("900");
      const result = await checkCreditQuotas("key1", {
        creditQuota5h: 500,
        creditQuotaDaily: 1_500,
        creditQuotaWeekly: 5_000,
      });
      expect(result.allowed).toBe(true);
      expect(result.headers["X-Credit-Quota-5h-Remaining"]).toBe("400");
      expect(result.headers["X-Credit-Quota-1d-Remaining"]).toBe("1100");
      expect(result.headers["X-Credit-Quota-7d-Remaining"]).toBe("4100");
    });

    it("blocks when one configured window is exhausted", async () => {
      mockRedis.get
        .mockResolvedValueOnce("500")
        .mockResolvedValueOnce("0")
        .mockResolvedValueOnce("0");
      const result = await checkCreditQuotas("key1", {
        creditQuota5h: 500,
        creditQuotaDaily: 1_500,
        creditQuotaWeekly: 5_000,
      });
      expect(result.allowed).toBe(false);
      expect(result.blockedWindow).toBe("5h");
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    it("increments only the configured MCP credit counters", async () => {
      mockPipeline.exec.mockResolvedValue([[null, 25], [null, 25], [null, 25]]);
      await incrementCreditQuotas("key1", 25, {
        creditQuota5h: 500,
        creditQuotaDaily: 1_500,
        creditQuotaWeekly: 5_000,
      });
      expect(mockPipeline.incrby).toHaveBeenCalledTimes(3);
      expect(mockPipeline.incrby).toHaveBeenCalledWith(expect.stringContaining("creditquota:apikey:key1:5h:"), 25);
      expect(mockPipeline.expire).toHaveBeenCalled();
    });

    it("fails closed when MCP quota storage is unavailable", async () => {
      mockRedis.get.mockRejectedValue(new Error("redis unavailable"));
      const req = {
        auth: {
          mode: "api_key",
          apiKeyId: "key1",
          tenantId: "tenant1",
          keyPurpose: "mcp_cli",
          rateLimit: 60,
          creditQuota5h: 500,
          creditQuotaDaily: 1_500,
          creditQuotaWeekly: 5_000,
        },
      } as any;
      const res = {
        setHeader: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as any;
      const next = vi.fn();

      await rateLimitMiddleware()(req, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.setHeader).toHaveBeenCalledWith("X-Api-Error-Code", "credit_quota_unavailable");
      expect(next).not.toHaveBeenCalled();
    });
  });
});
