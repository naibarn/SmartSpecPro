import { describe, expect, it, vi, beforeEach } from "vitest";

const mockRedisGet = vi.fn();
vi.mock("../../services/redis", () => ({
  getRedisClient: vi.fn(() => ({ get: mockRedisGet })),
}));

describe("retired runtime feature flag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.USE_CLOUD_TASKS = "true";
  });

  it("cannot reactivate the removed Google runtime from Redis or env", async () => {
    mockRedisGet.mockResolvedValue("true");
    const { getFeatureFlag } = await import("../featureFlags");
    await expect(getFeatureFlag("USE_CLOUD_TASKS")).resolves.toBe(false);
    expect(mockRedisGet).not.toHaveBeenCalled();
  });
});
