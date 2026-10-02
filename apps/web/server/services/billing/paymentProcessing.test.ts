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
    transaction: vi.fn(),
  } as any;

  return {
    mockGetDb: vi.fn(() => mockDb),
    mockDb,
    resetHarness: () => {
      mockDb.insert.mockReset();
      mockDb.select.mockReset();
      mockDb.update.mockReset();
      mockDb.transaction.mockReset();
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

  it("requires provider amount and currency before accepting a paid event", async () => {
    const { validatePaymentSettlement } = await import("./paymentProcessing");
    const invoice = { status: "payment_pending", totalAmount: "214.00", currency: "THB" } as const;
    const payment = { expectedAmount: "214.00", expectedCurrency: "THB" } as const;
    expect(validatePaymentSettlement({ invoice, payment, providerState: { paymentStatus: "paid", amount: null, currency: "THB" } }))
      .toEqual({ canAutoApply: false, reason: "amount_missing" });
    expect(validatePaymentSettlement({ invoice, payment, providerState: { paymentStatus: "paid", amount: "214.00", currency: null } }))
      .toEqual({ canAutoApply: false, reason: "currency_missing" });
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
    mockDb.transaction.mockImplementation(async (callback: (tx: any) => Promise<unknown>) => callback({
      insert: () => ({ values: () => ({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) }) }),
      select: () => ({ from: () => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.for = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue([{
          id: 19,
          provider: "beam",
          eventId: "evt_duplicate",
          processingStatus: "processed",
          errorMessage: null,
          processingStartedAt: null,
          processingAttempts: 1,
        }]);
        return query;
      } }),
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

  it("refuses normalized events without stable provider identifiers", async () => {
    const { processBeamWebhookEvent } = await import("./paymentProcessing");
    await expect(processBeamWebhookEvent({
      verification: { valid: true, matchedSecretVersion: "current" },
      normalizedEvent: {
        provider: "beam", eventId: null, eventType: "charge.succeeded", providerObjectId: null,
        paymentStatus: "paid", amount: "214.00", currency: "THB", occurredAt: null, raw: {},
      },
      payload: {},
    })).resolves.toEqual({ processed: false, reason: "schema_invalid" });
    expect(mockDb.select).not.toHaveBeenCalled();
  });
});
