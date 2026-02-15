/**
 * Tests for Cloud Tasks feature flag dispatch.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock Redis client
const mockRedisGet = vi.fn();
vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(() => ({
    get: mockRedisGet,
  })),
}));

describe("Cloud Tasks feature flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns true when Redis flag is 'true'", async () => {
    mockRedisGet.mockResolvedValue("true");

    const { getFeatureFlag } = await import("../featureFlags");
    const result = await getFeatureFlag("USE_CLOUD_TASKS");

    expect(result).toBe(true);
    expect(mockRedisGet).toHaveBeenCalledWith("feature-flag:USE_CLOUD_TASKS");
  });

  it("returns false when Redis flag is 'false'", async () => {
    mockRedisGet.mockResolvedValue("false");

    const { getFeatureFlag } = await import("../featureFlags");
    const result = await getFeatureFlag("USE_CLOUD_TASKS");

    expect(result).toBe(false);
  });

  it("falls back to env var when Redis is unavailable", async () => {
    mockRedisGet.mockRejectedValue(new Error("Redis unavailable"));
    process.env.USE_CLOUD_TASKS = "true";

    const { getFeatureFlag } = await import("../featureFlags");
    const result = await getFeatureFlag("USE_CLOUD_TASKS");

    expect(result).toBe(true);
  });

  it("returns false by default when flag is not set anywhere", async () => {
    mockRedisGet.mockResolvedValue(null);
    delete process.env.USE_CLOUD_TASKS;

    const { getFeatureFlag } = await import("../featureFlags");
    const result = await getFeatureFlag("USE_CLOUD_TASKS");

    expect(result).toBe(false);
  });
});
