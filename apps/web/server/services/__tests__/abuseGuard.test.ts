/**
 * Tests for Redis-backed abuse detection guard.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis operations
const mockIncr = vi.fn().mockResolvedValue(1);
const mockExpire = vi.fn().mockResolvedValue(1);
const mockTtl = vi.fn().mockResolvedValue(30);
const mockLpush = vi.fn().mockResolvedValue(1);
const mockLtrim = vi.fn().mockResolvedValue("OK");
const mockLrange = vi.fn().mockResolvedValue([]);

const mockCacheClient = {
  incr: mockIncr,
  expire: mockExpire,
  ttl: mockTtl,
  lpush: mockLpush,
  ltrim: mockLtrim,
  lrange: mockLrange,
};

vi.mock("../redisClients", () => ({
  getCacheClient: () => mockCacheClient,
}));

// Mock checkRateLimit (used by burst detection)
const mockCheckRateLimit = vi.fn().mockResolvedValue({ allowed: true, remaining: 10 });
vi.mock("../../middleware/distributedRateLimit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

// Mock audit logger
vi.mock("../auditLogger", () => ({
  auditLogger: { log: vi.fn() },
}));

// Import after mocks
import { checkAbuseGuard, hashPrompt } from "../abuseGuard";

describe("Abuse Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults: allow everything
    mockIncr.mockResolvedValue(1);
    mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 10 });
    mockLrange.mockResolvedValue([]);
  });

  describe("hashPrompt", () => {
    it("returns a 16-char hex string", () => {
      const hash = hashPrompt("hello world");
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("returns different hashes for different inputs", () => {
      const h1 = hashPrompt("hello");
      const h2 = hashPrompt("world");
      expect(h1).not.toBe(h2);
    });

    it("appends extra string when provided", () => {
      const h1 = hashPrompt("hello");
      const h2 = hashPrompt("hello", "extra");
      expect(h1).not.toBe(h2);
    });

    it("returns same hash for same input", () => {
      const h1 = hashPrompt("test prompt");
      const h2 = hashPrompt("test prompt");
      expect(h1).toBe(h2);
    });
  });

  describe("Layer 1: Duplicate Request Detection", () => {
    it("allows first request (count=1)", async () => {
      mockIncr.mockResolvedValue(1);

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
      expect(mockIncr).toHaveBeenCalledWith("abuse:dup:chat:1:abc123");
      expect(mockExpire).toHaveBeenCalled(); // Sets TTL on first increment
    });

    it("allows requests within threshold (count <= 3)", async () => {
      mockIncr.mockResolvedValue(3);

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });

    it("blocks duplicate loop (count > 3)", async () => {
      mockIncr.mockResolvedValue(4);
      mockTtl.mockResolvedValue(25);

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("duplicate_loop");
      expect(result.retryAfter).toBe(25);
    });

    it("only sets expire on first increment", async () => {
      mockIncr.mockResolvedValue(2);

      await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      // expire should NOT be called when count > 1
      expect(mockExpire).not.toHaveBeenCalledWith("abuse:dup:chat:1:abc123", expect.any(Number));
    });
  });

  describe("Layer 2: Burst Anomaly Detection", () => {
    it("allows normal request rate", async () => {
      mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 20 });

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "media",
        promptHash: "xyz789",
      });

      expect(result.allowed).toBe(true);
      // Should call checkRateLimit for both short and long windows
      expect(mockCheckRateLimit).toHaveBeenCalledTimes(2);
    });

    it("blocks short burst (too many requests per minute)", async () => {
      // Pass duplicate check first
      mockIncr.mockResolvedValue(1);
      // Short window blocked
      mockCheckRateLimit.mockResolvedValueOnce({ allowed: false, retryAfter: 45 });

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "media",
        promptHash: "xyz789",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("burst_anomaly");
      expect(result.retryAfter).toBe(45);
    });

    it("blocks sustained burst (too many requests per hour)", async () => {
      mockIncr.mockResolvedValue(1);
      // Short window OK, long window blocked
      mockCheckRateLimit
        .mockResolvedValueOnce({ allowed: true, remaining: 5 })
        .mockResolvedValueOnce({ allowed: false, retryAfter: 600 });

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "skill",
        promptHash: "xyz789",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("burst_anomaly");
      expect(result.retryAfter).toBe(600);
    });
  });

  describe("Layer 3: Sequential Repetition Detection", () => {
    it("allows varied actions", async () => {
      mockIncr.mockResolvedValue(1);
      mockLrange.mockResolvedValue(["aaa", "bbb", "ccc", "ddd", "eee"]);

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });

    it("blocks 5+ identical sequential actions", async () => {
      mockIncr.mockResolvedValue(1);
      mockLrange.mockResolvedValue(["same", "same", "same", "same", "same"]);

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "same",
      });

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe("sequential_repetition");
      expect(result.retryAfter).toBe(120);
    });

    it("allows fewer than SEQ_MAX entries", async () => {
      mockIncr.mockResolvedValue(1);
      mockLrange.mockResolvedValue(["same", "same", "same"]); // Only 3, need 5

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "same",
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe("Fail-open on Redis errors", () => {
    it("allows request when Redis incr fails", async () => {
      mockIncr.mockRejectedValue(new Error("Redis connection lost"));

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });

    it("allows request when checkRateLimit fails", async () => {
      mockIncr.mockResolvedValue(1);
      mockCheckRateLimit.mockRejectedValue(new Error("Redis timeout"));

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "media",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });

    it("allows request when burst limiter reports redis_unavailable", async () => {
      mockIncr.mockResolvedValue(1);
      mockCheckRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 30,
        error: "redis_unavailable",
      });

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "media:image",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });

    it("allows request when lrange fails", async () => {
      mockIncr.mockResolvedValue(1);
      mockLpush.mockRejectedValue(new Error("Redis OOM"));

      const result = await checkAbuseGuard({
        userId: 1,
        namespace: "chat",
        promptHash: "abc123",
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe("Normal usage passes all layers", () => {
    it("allows a normal single request through all 3 layers", async () => {
      mockIncr.mockResolvedValue(1); // First request
      mockCheckRateLimit.mockResolvedValue({ allowed: true, remaining: 25 }); // Normal rate
      mockLrange.mockResolvedValue(["abc", "def", "ghi"]); // Varied history

      const result = await checkAbuseGuard({
        userId: 42,
        namespace: "skill",
        promptHash: "unique_hash_123",
      });

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(result.retryAfter).toBeUndefined();
    });
  });
});
