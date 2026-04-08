import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetBillingRuntimeConfig = vi.fn();

vi.mock("./runtimeConfig", () => ({
  getBillingRuntimeConfig: mockGetBillingRuntimeConfig,
}));

describe("billing cutover gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when subscription cutover flag is enabled", async () => {
    mockGetBillingRuntimeConfig.mockResolvedValue({
      BILLING_SUBSCRIPTION_CUTOVER_READY: true,
    });

    const { isBillingSubscriptionCutoverReady } = await import("./cutover");
    await expect(isBillingSubscriptionCutoverReady()).resolves.toBe(true);
    expect(mockGetBillingRuntimeConfig).toHaveBeenCalled();
  });

  it("throws when subscription cutover is not ready", async () => {
    mockGetBillingRuntimeConfig.mockResolvedValue({
      BILLING_SUBSCRIPTION_CUTOVER_READY: false,
    });

    const { assertBillingSubscriptionCutoverReady } = await import("./cutover");
    await expect(assertBillingSubscriptionCutoverReady()).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
  });
});
