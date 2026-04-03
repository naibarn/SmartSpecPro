import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  mockReconcilePaymentWithProvider,
  mockMarkSubscriptionDowngraded,
  mockApplyPaidBusinessEffects,
  mockSendInvoiceNotification,
  mockCreateOrGetInvoiceForBillingCycle,
  mockCreateAutoRenewalAttempt,
  mockRunRenewalRetryScheduler,
  mockMarkExpiredPaymentMethodSetupSessionsAbandoned,
  mockRenderInvoiceDocument,
  mockStorageDelete,
  resetHarness,
} = vi.hoisted(() => {
  const selectRowsQueue: any[][] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockReturnValue(query);
        query.limit = vi.fn().mockResolvedValue(selectRowsQueue.shift() ?? []);
        return query;
      }),
    })),
    transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => cb({
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockResolvedValue(undefined),
        })),
      })),
    })),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    mockReconcilePaymentWithProvider: vi.fn(),
    mockMarkSubscriptionDowngraded: vi.fn().mockResolvedValue({ applied: true }),
    mockApplyPaidBusinessEffects: vi.fn().mockResolvedValue({ applied: true }),
    mockSendInvoiceNotification: vi.fn().mockResolvedValue({ sent: true }),
    mockCreateOrGetInvoiceForBillingCycle: vi.fn().mockResolvedValue({ invoice: { id: 1 }, reused: false }),
    mockCreateAutoRenewalAttempt: vi.fn().mockResolvedValue({ invoice: { id: 2 }, renewalAttempt: { id: 22 }, reused: false }),
    mockRunRenewalRetryScheduler: vi.fn().mockResolvedValue([]),
    mockMarkExpiredPaymentMethodSetupSessionsAbandoned: vi.fn().mockResolvedValue(0),
    mockRenderInvoiceDocument: vi.fn().mockResolvedValue({ documentVersion: 1 }),
    mockStorageDelete: vi.fn().mockResolvedValue(true),
    resetHarness: () => {
      selectRowsQueue.length = 0;
      db.select.mockClear();
      db.transaction.mockClear();
    },
  };
});

vi.mock("../db", () => ({
  getDb: mockGetDb,
}));

vi.mock("../services/billing/reconciliation", () => ({
  reconcilePendingPayments: vi.fn().mockResolvedValue([]),
  reconcilePaymentWithProvider: mockReconcilePaymentWithProvider,
}));

vi.mock("../services/billing/featureFlags", () => ({
  isBillingFeatureEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("../services/billing/runtimeConfig", () => ({
  getBillingRuntimeConfig: vi.fn().mockResolvedValue({
    BILLING_OVERDUE_DAYS: "7",
    BILLING_NOTIFICATION_REMINDER_FIRST_THRESHOLD_DAYS: "4",
    BILLING_NOTIFICATION_REMINDER_FINAL_THRESHOLD_DAYS: "1",
  }),
}));

vi.mock("../services/billing/businessEffects", () => ({
  markSubscriptionDowngraded: mockMarkSubscriptionDowngraded,
  applyPaidBusinessEffects: mockApplyPaidBusinessEffects,
}));

vi.mock("../services/billing/notifications", () => ({
  sendInvoiceNotification: mockSendInvoiceNotification,
}));

vi.mock("../services/billing/beamProvider", () => ({
  createBeamProviderFromEnv: vi.fn(() => ({})),
  createBeamProvider: vi.fn().mockResolvedValue({}),
}));

vi.mock("../services/billing/documentRendering", () => ({
  renderInvoiceDocument: mockRenderInvoiceDocument,
}));

vi.mock("../services/billing/renewalService", () => ({
  createOrGetInvoiceForBillingCycle: mockCreateOrGetInvoiceForBillingCycle,
}));

vi.mock("../services/billing/autoRenew", () => ({
  createAutoRenewalAttempt: mockCreateAutoRenewalAttempt,
  runRenewalRetryScheduler: mockRunRenewalRetryScheduler,
}));

vi.mock("../services/billing/paymentMethodSetup", () => ({
  markExpiredPaymentMethodSetupSessionsAbandoned: mockMarkExpiredPaymentMethodSetupSessionsAbandoned,
}));

vi.mock("../storage", () => ({
  storageDelete: mockStorageDelete,
}));

describe("billingJobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("downgrades overdue renewal invoices after final reconciliation stays unpaid", async () => {
    mockGetDb().select
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockResolvedValue([
            { invoiceId: 10, userId: 2, subscriptionId: 7, status: "payment_pending" },
          ]);
          return query;
        }),
      }))
      .mockImplementationOnce(() => ({
        from: vi.fn().mockImplementation(() => {
          const query: any = {};
          query.where = vi.fn().mockReturnValue(query);
          query.limit = vi.fn().mockResolvedValue([{ id: 88, invoiceId: 10, status: "payment_pending" }]);
          return query;
        }),
      }));

    mockReconcilePaymentWithProvider.mockResolvedValue({ reconciled: false, reason: "reconciliation_required" });

    const { runInvoiceOverdueDowngradeJob } = await import("./billingJobs");
    const result = await runInvoiceOverdueDowngradeJob();

    expect(result).toEqual([{ invoiceId: 10, downgraded: true }]);
    expect(mockMarkSubscriptionDowngraded).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: 10,
        subscriptionId: 7,
      }),
    );
    expect(mockSendInvoiceNotification).toHaveBeenCalled();
  });

  it("creates auto-renew attempts for subscriptions in auto_charge mode", async () => {
    mockGetDb().select.mockImplementationOnce(() => ({
      from: vi.fn().mockImplementation(() => {
        const query: any = {};
        query.where = vi.fn().mockResolvedValue([
          { subscriptionId: 10, tenantId: "tenant-a", autoRenewEnabled: true, renewalMode: "auto_charge" },
        ]);
        return query;
      }),
    }));

    const { runSubscriptionRenewalJob } = await import("./billingJobs");
    const result = await runSubscriptionRenewalJob();

    expect(mockCreateAutoRenewalAttempt).toHaveBeenCalledWith(expect.objectContaining({
      subscriptionId: 10,
    }));
    expect(result).toEqual([
      { subscriptionId: 10, invoiceId: 2, renewalAttemptId: 22, reused: false },
    ]);
  });
});
