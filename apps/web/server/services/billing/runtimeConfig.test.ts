import { describe, expect, it, vi } from "vitest";

const { mockGetDb } = vi.hoisted(() => {
  const rows = [
    { key: "BILLING_ACTIVE_PROVIDER", value: "beam", isSensitive: false },
    { key: "BILLING_STRIPE_ENABLED", value: "false", isSensitive: false },
    { key: "BILLING_BEAM_ENABLED", value: "true", isSensitive: false },
    { key: "BEAM_PAYMENT_LINK_FALLBACK", value: "false", isSensitive: false },
  ];

  return {
    mockGetDb: vi.fn(() => ({
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn().mockResolvedValue(rows),
        })),
      })),
    })),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../crypto", () => ({
  decrypt: vi.fn((value: string) => value),
  encrypt: vi.fn((value: string) => value),
}));

describe("billing runtime admin settings", () => {
  it("returns stored boolean settings as booleans", async () => {
    const { getBillingRuntimeSettingsAdmin } = await import("./runtimeConfig");
    const settings = await getBillingRuntimeSettingsAdmin();

    expect(settings.BILLING_STRIPE_ENABLED).toBe(false);
    expect(settings.BILLING_BEAM_ENABLED).toBe(true);
    expect(settings.BEAM_PAYMENT_LINK_FALLBACK).toBe(false);
    expect(typeof settings.BILLING_STRIPE_ENABLED).toBe("boolean");
    expect(settings.BILLING_ACTIVE_PROVIDER).toBe("beam");
    expect(settings.PROMPTPAY_DIRECT_ACCOUNT_DISPLAY_NAME).toBe("SmartAIHub");
  });
});
