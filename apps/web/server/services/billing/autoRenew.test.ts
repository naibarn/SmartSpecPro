import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  selectQueue,
  insertQueue,
  updateQueue,
  resetHarness,
  mockCreateInvoiceChargeFlow,
  mockRegenerateInvoicePaymentAttempt,
} = vi.hoisted(() => {
  const queuedSelects: any[][] = [];
  const queuedInserts: any[][] = [];
  const queuedUpdates: any[][] = [];

  function buildSelectQuery(rows: any[]) {
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    return query;
  }

  function buildInsertQuery(rows: any[]) {
    return {
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    };
  }

  function buildUpdateQuery(rows: any[]) {
    const query: any = {};
    query.set = vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue(rows),
      }),
    });
    return query;
  }

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => buildSelectQuery(queuedSelects.shift() ?? [])),
    })),
    insert: vi.fn().mockImplementation(() => buildInsertQuery(queuedInserts.shift() ?? [])),
    update: vi.fn().mockImplementation(() => buildUpdateQuery(queuedUpdates.shift() ?? [])),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    selectQueue: queuedSelects,
    insertQueue: queuedInserts,
    updateQueue: queuedUpdates,
    resetHarness: () => {
      queuedSelects.length = 0;
      queuedInserts.length = 0;
      queuedUpdates.length = 0;
      db.select.mockClear();
      db.insert.mockClear();
      db.update.mockClear();
    },
    mockCreateInvoiceChargeFlow: vi.fn(),
    mockRegenerateInvoicePaymentAttempt: vi.fn(),
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("./orchestration", () => ({
  createInvoiceChargeFlow: mockCreateInvoiceChargeFlow,
}));

vi.mock("./recovery", () => ({
  regenerateInvoicePaymentAttempt: mockRegenerateInvoicePaymentAttempt,
}));

describe("autoRenew", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
    mockCreateInvoiceChargeFlow.mockResolvedValue({
      invoice: { id: 301, status: "payment_pending" },
    });
  });

  it("creates an off-session renewal attempt using the default payment method", async () => {
    selectQueue.push(
      [{
        id: 11,
        userId: 42,
        tenantId: "tenant-a",
        planCode: "pro",
        billingPeriod: "monthly",
        currentPeriodEnd: new Date("2026-05-01T00:00:00.000Z"),
        autoRenewEnabled: true,
        renewalMode: "auto_charge",
        legacyPlanSnapshot: { basePrice: 499 },
      }],
      [{
        id: 55,
        subscriptionId: 11,
        defaultPaymentMethodId: 77,
      }],
      [{
        id: 77,
        userId: 42,
        providerPaymentMethodId: "pm_123",
        providerCustomerId: "cus_123",
        status: "active",
        autoRenewEligible: true,
      }],
      [],
      [{
        id: 401,
        invoiceId: 301,
        status: "payment_pending",
      }],
    );
    insertQueue.push([{ id: 999, subscriptionId: 11, invoiceId: 301, attemptNo: 1, status: "charge_in_progress" }]);

    const { createAutoRenewalAttempt } = await import("./autoRenew");
    const result = await createAutoRenewalAttempt({ subscriptionId: 11 });

    expect(result.reused).toBe(false);
    expect(mockCreateInvoiceChargeFlow).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: 11,
      paymentMethodId: 77,
      offSession: true,
      suppressQrReadyNotification: true,
    }));
    expect(result.renewalAttempt).toEqual(expect.objectContaining({
      id: 999,
      invoiceId: 301,
    }));
  });

  it("schedules a retry when an auto-renew invoice expires", async () => {
    selectQueue.push(
      [{
        id: 21,
        subscriptionId: 11,
        invoiceId: 301,
        status: "charge_in_progress",
        metadataJson: {},
        nextRetryAt: null,
        finalOutcome: null,
      }],
      [{
        id: 1,
        subscriptionId: 11,
        retryPolicyJson: { retryDelayHours: 12 },
      }],
    );
    updateQueue.push(
      [{
        id: 21,
        subscriptionId: 11,
        status: "retry_scheduled",
      }],
      [],
    );

    const { syncRenewalAttemptForInvoice } = await import("./autoRenew");
    const updated = await syncRenewalAttemptForInvoice({
      invoiceId: 301,
      paymentStatus: "expired",
      amountMatchStatus: "matched",
      reason: "provider_expired",
    });

    expect(updated).toEqual(expect.objectContaining({
      id: 21,
      status: "retry_scheduled",
    }));
  });
});
