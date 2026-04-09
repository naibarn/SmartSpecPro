import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAssertBrowserPolicyFeaturePromotionReady = vi.fn();
const mockSetTenantFeatureFlag = vi.fn().mockResolvedValue(undefined);
const mockWhere = vi.fn();
const mockSelectLimit = vi.fn();
const mockSelectFrom = vi.fn();
const mockSelect = vi.fn();
const mockUpdateWhere = vi.fn().mockResolvedValue(undefined);
const mockUpdateSet = vi.fn();
const mockUpdate = vi.fn();
const mockTransaction = vi.fn();
const mockGetDb = vi.fn();

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../featureFlags", () => ({
  setTenantFeatureFlag: mockSetTenantFeatureFlag,
}));

vi.mock("../browserPolicyReleaseControl", () => ({
  assertBrowserPolicyFeaturePromotionReady: mockAssertBrowserPolicyFeaturePromotionReady,
}));

describe("desktop host rollout flags Redis sync", () => {
  beforeEach(() => {
    vi.resetModules();
    mockAssertBrowserPolicyFeaturePromotionReady.mockReset();
    mockSetTenantFeatureFlag.mockClear();
    mockWhere.mockReset();
    mockSelectLimit.mockReset();
    mockSelectFrom.mockReset();
    mockSelect.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateSet.mockReset();
    mockUpdate.mockReset();
    mockTransaction.mockReset();
    mockGetDb.mockReset();

    mockSelectLimit.mockResolvedValue([{ featureFlags: { desktopHostEnabled: false } }]);
    mockWhere.mockReturnValue({ limit: mockSelectLimit });
    mockSelectFrom.mockReturnValue({ where: mockWhere });
    mockSelect.mockReturnValue({ from: mockSelectFrom });
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere });
    mockUpdate.mockReturnValue({ set: mockUpdateSet });
    mockTransaction.mockImplementation(async (fn: any) =>
      fn({
        select: mockSelect,
        update: mockUpdate,
      }),
    );
    mockGetDb.mockResolvedValue({
      transaction: mockTransaction,
    });
  });

  it("syncs desktopHostEnabled to Redis-backed route guards", async () => {
    const { updateTenantFeatureFlags } = await import("../tenantFeatureFlagService");

    await updateTenantFeatureFlags("tenant-desktop", {
      desktopHostEnabled: true,
    } as any);

    expect(mockSetTenantFeatureFlag).toHaveBeenCalledWith(
      "desktopHostEnabled",
      "tenant-desktop",
      true,
    );
  });
});
