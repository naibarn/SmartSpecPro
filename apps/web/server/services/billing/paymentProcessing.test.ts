import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockDb,
  resetHarness,
} = vi.hoisted(() => {
  const mockDb = {
    insert: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
  } as any;

  return {
    mockGetDb: vi.fn(() => mockDb),
    mockDb,
    resetHarness: () => {
      mockDb.insert.mockReset();
      mockDb.select.mockReset();
      mockDb.update.mockReset();
    },
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./businessEffects", () => ({
  applyPaidBusinessEffects: vi.fn().mockResolvedValue({ applied: true, reason: "credits_granted" }),
}));

vi.mock("./notifications", () => ({
  sendInvoiceNotification: vi.fn().mockResolvedValue({ sent: true, reason: "sent" }),
}));

describe("billing payment processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("rejects amount mismatches from auto-apply", async () => {
    const { validatePaymentSettlement } = await import("./paymentProcessing");

    expect(
      validatePaymentSettlement({
        invoice: {
          status: "payment_pending",
          totalAmount: "214.00",
          currency: "THB",
        },
        payment: {
          expectedAmount: "214.00",
          expectedCurrency: "THB",
        },
        providerState: {
          paymentStatus: "paid",
          amount: "215.00",
          currency: "THB",
        },
      }),
    ).toEqual({
      canAutoApply: false,
      reason: "amount_mismatch",
    });
  });

  it("rejects stale or non-payable invoice states", async () => {
    const { validatePaymentSettlement } = await import("./paymentProcessing");

    expect(
      validatePaymentSettlement({
        invoice: {
          status: "replaced",
          totalAmount: "214.00",
          currency: "THB",
        },
        payment: {
          expectedAmount: "214.00",
          expectedCurrency: "THB",
        },
        providerState: {
          paymentStatus: "paid",
          amount: "214.00",
          currency: "THB",
        },
      }),
    ).toEqual({
      canAutoApply: false,
      reason: "invoice_not_payable",
    });
  });

  it("returns duplicate_webhook when event id already exists", async () => {
    mockDb.select.mockImplementation(() => ({
      from: vi.fn(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue([]);
        return query;
      }),
    }));

    mockDb.insert.mockImplementation(() => ({
      values: vi.fn().mockImplementation(() => ({
        onConflictDoNothing: vi.fn().mockImplementation(() => ({
          returning: vi.fn().mockResolvedValue([]),
        })),
      })),
    }));

    const { processBeamWebhookEvent } = await import("./paymentProcessing");
    await expect(
      processBeamWebhookEvent({
        verification: { valid: true, matchedSecretVersion: "current" },
        normalizedEvent: {
          provider: "beam",
          eventId: "evt_duplicate",
          eventType: "charge.succeeded",
          providerObjectId: "charge_123",
          paymentStatus: "paid",
          amount: "214.00",
          currency: "THB",
          occurredAt: "2026-03-31T12:00:00.000Z",
          raw: {},
        },
        payload: {},
      }),
    ).resolves.toEqual({
      processed: false,
      reason: "duplicate_webhook",
    });
  });
});
