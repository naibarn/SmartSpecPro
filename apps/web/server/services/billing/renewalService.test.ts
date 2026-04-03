import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  queues,
  resetHarness,
  mockAssertCutoverReady,
  mockCreateInvoiceChargeFlow,
} = vi.hoisted(() => {
  const selectRowsQueue: any[][] = [];

  function buildSelectQuery(rows: any[]) {
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    return query;
  }

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => buildSelectQuery(selectRowsQueue.shift() ?? [])),
    })),
  };

  return {
    mockGetDb: vi.fn(() => db),
    queues: { selectRowsQueue },
    resetHarness: () => {
      selectRowsQueue.length = 0;
      db.select.mockClear();
    },
    mockAssertCutoverReady: vi.fn().mockResolvedValue(undefined),
    mockCreateInvoiceChargeFlow: vi.fn(),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./cutover", () => ({
  assertBillingSubscriptionCutoverReady: mockAssertCutoverReady,
}));

vi.mock("./orchestration", () => ({
  createInvoiceChargeFlow: mockCreateInvoiceChargeFlow,
}));

describe("renewalService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mockCreateInvoiceChargeFlow.mockResolvedValue({
      invoice: { id: 11, status: "payment_pending" },
      payment: { id: 21 },
    });
  });

  it("reuses an existing invoice for the same cycle", async () => {
    queues.selectRowsQueue.push(
      [{ id: 9, userId: 2, tenantId: "tenant-a", planCode: "pro", legacyPlanSnapshot: { basePrice: 499 } }],
      [{ id: 77, subscriptionId: 9, invoiceType: "subscription_renewal" }],
    );

    const { createOrGetInvoiceForBillingCycle } = await import("./renewalService");
    await expect(createOrGetInvoiceForBillingCycle({ subscriptionId: 9 })).resolves.toEqual({
      invoice: { id: 77, subscriptionId: 9, invoiceType: "subscription_renewal" },
      reused: true,
    });
    expect(mockCreateInvoiceChargeFlow).not.toHaveBeenCalled();
  });

  it("creates a new renewal invoice when the cycle has no existing invoice", async () => {
    queues.selectRowsQueue.push(
      [{
        id: 9,
        userId: 2,
        tenantId: "tenant-a",
        planCode: "pro",
        currentPeriodEnd: new Date("2026-04-01T00:00:00.000Z"),
        billingPeriod: "monthly",
        legacyPlanSnapshot: { basePrice: 499 },
      }],
      [],
    );

    const { createOrGetInvoiceForBillingCycle } = await import("./renewalService");
    const result = await createOrGetInvoiceForBillingCycle({ subscriptionId: 9 });
    expect(result.reused).toBe(false);
    expect(mockCreateInvoiceChargeFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceType: "subscription_renewal",
        subscriptionId: 9,
        lineItems: [
          expect.objectContaining({
            description: "Subscription renewal: pro",
            unitPrice: 499,
          }),
        ],
      }),
    );
  });
});
