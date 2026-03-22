import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the distributed rate limit module
vi.mock("../../middleware/distributedRateLimit", () => ({
  checkRateLimit: vi.fn(),
}));

import { isLuxTtsModel, checkLuxTtsRateLimit, LUX_TTS_MODEL_ID } from "../rateLimiter";
import { checkRateLimit } from "../../middleware/distributedRateLimit";

const mockCheckRateLimit = vi.mocked(checkRateLimit);

describe("isLuxTtsModel", () => {
  it("returns true for fal-ai/lux-tts", () => {
    expect(isLuxTtsModel("fal-ai/lux-tts")).toBe(true);
  });

  it("returns false for fal-ai/flux/schnell", () => {
    expect(isLuxTtsModel("fal-ai/flux/schnell")).toBe(false);
  });

  it("returns false for elevenlabs-tts", () => {
    expect(isLuxTtsModel("elevenlabs-tts")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isLuxTtsModel(undefined)).toBe(false);
  });
});

describe("checkLuxTtsRateLimit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns allowed: true when under limit", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 3,
      retryAfter: null,
    });

    const result = await checkLuxTtsRateLimit(42);
    expect(result).toEqual({ allowed: true, retryAfter: null });
  });

  it("returns allowed: false with retryAfter when over limit", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfter: 300,
    });

    const result = await checkLuxTtsRateLimit(42);
    expect(result).toEqual({ allowed: false, retryAfter: 300 });
  });

  it("uses correct Redis key pattern", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 4,
      retryAfter: null,
    });

    await checkLuxTtsRateLimit(123);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "ratelimit:lux-tts:123",
      5,
      600,
    );
  });

  it("passes limit=5 and windowSeconds=600", async () => {
    mockCheckRateLimit.mockResolvedValue({
      allowed: true,
      remaining: 5,
      retryAfter: null,
    });

    await checkLuxTtsRateLimit(1);
    const [, limit, windowSeconds] = mockCheckRateLimit.mock.calls[0];
    expect(limit).toBe(5);
    expect(windowSeconds).toBe(600);
  });

  it("user A at limit does not affect user B", async () => {
    // User A is rate limited
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfter: 200,
    });
    // User B is allowed
    mockCheckRateLimit.mockResolvedValueOnce({
      allowed: true,
      remaining: 4,
      retryAfter: null,
    });

    const resultA = await checkLuxTtsRateLimit(100);
    const resultB = await checkLuxTtsRateLimit(200);

    expect(resultA.allowed).toBe(false);
    expect(resultB.allowed).toBe(true);

    // Verify different keys
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      1,
      "ratelimit:lux-tts:100",
      5,
      600,
    );
    expect(mockCheckRateLimit).toHaveBeenNthCalledWith(
      2,
      "ratelimit:lux-tts:200",
      5,
      600,
    );
  });
});
