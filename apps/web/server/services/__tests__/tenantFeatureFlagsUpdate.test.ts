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

describe("updateTenantFeatureFlags", () => {
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

    mockSelectLimit.mockResolvedValue([{ featureFlags: { automationCopilot: false } }]);
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

  it("checks browser policy promotion gates before enabling automation copilot", async () => {
    const { updateTenantFeatureFlags } = await import("../tenantFeatureFlagService");

    await updateTenantFeatureFlags("tenant-1", { automationCopilot: true });

    expect(mockAssertBrowserPolicyFeaturePromotionReady).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      flagName: "automationCopilot",
      nextValue: true,
    });
  });

  it("checks browser policy promotion gates before enabling browser tool", async () => {
    const { updateTenantFeatureFlags } = await import("../tenantFeatureFlagService");

    await updateTenantFeatureFlags("tenant-1", { browserTool: true });

    expect(mockAssertBrowserPolicyFeaturePromotionReady).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      flagName: "browserTool",
      nextValue: true,
    });
  });

  it("checks browser policy promotion gates before enabling live browser", async () => {
    const { updateTenantFeatureFlags } = await import("../tenantFeatureFlagService");

    await updateTenantFeatureFlags("tenant-1", { liveBrowser: true });

    expect(mockAssertBrowserPolicyFeaturePromotionReady).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      flagName: "liveBrowser",
      nextValue: true,
    });
  });

  it("does not call browser policy promotion gates for unrelated flags", async () => {
    const { updateTenantFeatureFlags } = await import("../tenantFeatureFlagService");

    await updateTenantFeatureFlags("tenant-1", { canvas: true });

    expect(mockAssertBrowserPolicyFeaturePromotionReady).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      flagName: "canvas",
      nextValue: true,
    });
    expect(mockSetTenantFeatureFlag).not.toHaveBeenCalledWith(
      "automationCopilot",
      expect.anything(),
      expect.anything(),
    );
  });
});
