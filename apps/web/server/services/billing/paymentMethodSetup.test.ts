import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateSavedPaymentMethod } = vi.hoisted(() => ({
  mockCreateSavedPaymentMethod: vi.fn(),
}));

const { mockGetDb } = vi.hoisted(() => ({
  mockGetDb: vi.fn(() => ({
    insert: vi.fn(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: 1, status: "confirmed" }]),
        })),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([{ id: 1, userId: 42, status: "pending" }]),
        })),
      })),
    })),
  })),
}));

vi.mock("./paymentMethods", () => ({
  createSavedPaymentMethod: mockCreateSavedPaymentMethod,
}));

vi.mock("./providerConfig", () => ({
  getBeamProviderRuntimeConfig: vi.fn(async () => ({
    apiBaseUrl: "https://beam.test",
    apiKey: "beam-key",
    paymentMethodSetupPath: "/v1/setup",
    paymentMethodSetupHostedUrlTemplate: "https://beam.example/setup?user={userId}&tenant={tenantId}&session={sessionId}&return={returnUrl}",
    paymentMethodSetupReturnUrl: "https://app.example/billing",
    paymentMethodSetupCallbackSecretCurrent: "setup-secret",
    paymentMethodSetupCallbackSecretPrevious: null,
  })),
}));

vi.mock("./runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn(async () => ({
    BILLING_PHASE2_SAVED_CARDS_ENABLED: true,
    BILLING_PHASE2_CARD_SETUP_ENABLED: true,
    BILLING_PHASE2_AUTO_RENEW_ENABLED: true,
    BILLING_PHASE2_SETUP_CALLBACK_TOLERANCE_SECONDS: "300",
    BILLING_PUBLIC_URL: "https://app.example",
  })),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

describe("paymentMethodSetup", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("creates a hosted setup intent when Beam hosted template is configured", async () => {
    const { createPaymentMethodSetupIntent } = await import("./paymentMethodSetup");
    const result = await createPaymentMethodSetupIntent({
      userId: 42,
      tenantId: "tenant-a",
      returnUrl: "https://app.example/billing",
    });

    expect(result.mode).toBe("hosted_url");
    expect(result.hostedUrl).toContain("https://beam.example/setup");
    expect(result.hostedUrl).toContain("user=42");
    expect(result.hostedUrl).toContain("tenant=tenant-a");
    expect(result.hostedUrl).toContain(encodeURIComponent("https://app.example/billing"));
  });

  it("confirms payment method setup via createSavedPaymentMethod", async () => {
    mockCreateSavedPaymentMethod.mockResolvedValue({ id: 7, userId: 42, providerPaymentMethodId: "pm_123" });

    const { confirmPaymentMethodSetup } = await import("./paymentMethodSetup");
    const result = await confirmPaymentMethodSetup({
      userId: 42,
      actorUserId: 42,
      tenantId: "tenant-a",
      providerCustomerId: "cus_1",
      providerPaymentMethodId: "pm_123",
      brand: "Visa",
      last4: "4242",
      expMonth: 12,
      expYear: 2030,
      consentVersion: "phase2-v1",
      consentSnapshotJson: { consentText: "ok" },
    });

    expect(result).toEqual({ id: 7, userId: 42, providerPaymentMethodId: "pm_123" });
    expect(mockCreateSavedPaymentMethod).toHaveBeenCalledWith(expect.objectContaining({
      userId: 42,
      actorUserId: 42,
      input: expect.objectContaining({
        providerCustomerId: "cus_1",
        providerPaymentMethodId: "pm_123",
        autoRenewEligible: true,
        consentVersion: "phase2-v1",
      }),
    }));
  });

  it("verifies signed setup callback queries", async () => {
    vi.spyOn(Date, "now").mockReturnValue(new Date("2026-04-01T10:00:00.000Z").getTime());
    const { verifyPaymentMethodSetupCallbackSignature } = await import("./paymentMethodSetup");
    const rawQuery = "setupSessionId=session-1&status=confirmed";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = (await import("crypto")).createHmac("sha256", "setup-secret").update(`${timestamp}.${rawQuery}`).digest("hex");

    await expect(verifyPaymentMethodSetupCallbackSignature({
      rawQuery,
      headers: {
        "x-beam-setup-signature": signature,
        "x-beam-setup-timestamp": timestamp,
      },
    })).resolves.toEqual(expect.objectContaining({ valid: true }));
  });
});
