import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

describe("isTenantFeatureEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetDb.mockReset();
  });

  it("uses the shared default when the tenant flag field is missing", async () => {
    const limit = vi.fn().mockResolvedValue([{ featureFlags: {} }]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockGetDb.mockResolvedValue({ select: vi.fn().mockReturnValue({ from }) });

    const { isTenantFeatureEnabled } =
      await import("../tenantFeatureFlagService");

    await expect(
      isTenantFeatureEnabled("tenant-special", "verticalDramaSpecialEpisodes")
    ).resolves.toBe(true);
  });

  it("honors an explicit tenant disable", async () => {
    const limit = vi
      .fn()
      .mockResolvedValue([
        { featureFlags: { verticalDramaSpecialEpisodes: false } },
      ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mockGetDb.mockResolvedValue({ select: vi.fn().mockReturnValue({ from }) });

    const { isTenantFeatureEnabled } =
      await import("../tenantFeatureFlagService");

    await expect(
      isTenantFeatureEnabled("tenant-special", "verticalDramaSpecialEpisodes")
    ).resolves.toBe(false);
  });

  it("fails closed when the tenant database is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);

    const { isTenantFeatureEnabled } =
      await import("../tenantFeatureFlagService");

    await expect(
      isTenantFeatureEnabled("tenant-special", "verticalDramaSpecialEpisodes")
    ).resolves.toBe(false);
  });
});
