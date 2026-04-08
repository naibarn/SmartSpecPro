import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCreateInvoiceChargeFlow = vi.hoisted(() => vi.fn());

vi.mock("./orchestration", () => ({
  createInvoiceChargeFlow: mockCreateInvoiceChargeFlow,
}));

vi.mock("./providerConfig", () => ({
  testBeamProviderAdminSettings: vi.fn().mockResolvedValue({
    configured: true,
    setupHostedConfigured: false,
    setupApiConfigured: false,
    webhookConfigured: true,
    paymentLinkConfigured: true,
    missing: [],
  }),
  getBeamProviderRuntimeConfig: vi.fn().mockResolvedValue({
    apiBaseUrl: "https://beam.example",
    apiKey: "beam-key",
    chargesPath: "/v1/charges",
    paymentLinksPath: "/v1/payment_links",
    chargeStatusPathTemplate: "/v1/charges/{id}",
    paymentLinkStatusPathTemplate: "/v1/payment_links/{id}",
    cancelPathSuffix: "/cancel",
    webhookSecretCurrent: "secret",
    webhookSecretPrevious: null,
  }),
}));

describe("topupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateInvoiceChargeFlow.mockResolvedValue({
      invoice: { id: 10 },
      payment: { id: 20, status: "payment_pending" },
    });
  });

  it("passes credit package metadata into orchestration", async () => {
    const { createTopupCheckout } = await import("./topupService");

    await createTopupCheckout({
      tenantId: "tenant-a",
      userId: 1,
      actorUserId: 1,
      packageCode: "starter_100",
      credits: 100,
      basePrice: 199,
      description: "Starter top-up",
      provider: {} as any,
    });

    expect(mockCreateInvoiceChargeFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceType: "topup",
        lineItems: [
          expect.objectContaining({
            itemType: "credit_package",
            description: "Starter top-up",
            metadataJson: expect.objectContaining({
              credits: 100,
              packageCode: "starter_100",
            }),
          }),
        ],
      }),
    );
  });
});
