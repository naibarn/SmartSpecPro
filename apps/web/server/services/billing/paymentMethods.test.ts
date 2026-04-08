import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDb,
  resetHarness,
  queueSelect,
  txUpdateCalls,
  txInsertCalls,
} = vi.hoisted(() => {
  const selectQueue: any[][] = [];
  const txUpdateCalls: any[] = [];
  const txInsertCalls: any[] = [];

  function makeQuery() {
    const rows = selectQueue.shift() ?? [];
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    query.then = (resolve: (value: any[]) => void, reject?: (reason: unknown) => void) =>
      Promise.resolve(rows).then(resolve, reject);
    return query;
  }

  const tx = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => makeQuery()),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((payload: any) => {
        txUpdateCalls.push(payload);
        return {
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockResolvedValue([{
              id: 41,
              userId: 7,
              tenantId: "tenant-a",
              provider: "beam",
              providerPaymentMethodId: "pm_41",
              brand: "Visa",
              last4: "4242",
              status: "active",
              isDefault: true,
              autoRenewEligible: true,
              updatedAt: new Date(),
            }]),
          })),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((payload: any) => {
        txInsertCalls.push(payload);
        return {
          returning: vi.fn().mockResolvedValue([{
            id: 41,
            userId: 7,
            tenantId: "tenant-a",
            provider: "beam",
            providerPaymentMethodId: "pm_41",
            brand: "Visa",
            last4: "4242",
            status: "active",
            isDefault: true,
            autoRenewEligible: true,
            updatedAt: new Date(),
          }]),
        };
      }),
    })),
  } as any;

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockImplementation(() => makeQuery()),
    })),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation((payload: any) => {
        txUpdateCalls.push(payload);
        return {
          where: vi.fn().mockImplementation(() => ({
            returning: vi.fn().mockResolvedValue([{
              id: 41,
              userId: 7,
              tenantId: "tenant-a",
              provider: "beam",
              providerPaymentMethodId: "pm_41",
              brand: "Visa",
              last4: "4242",
              status: "revoked",
              isDefault: false,
              revokedAt: new Date(),
              updatedAt: new Date(),
            }]),
          })),
        };
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockResolvedValue(undefined),
    })),
    transaction: vi.fn().mockImplementation(async (cb: (trx: any) => Promise<any>) => cb(tx)),
  } as any;

  return {
    mockGetDb: vi.fn(() => db),
    resetHarness: () => {
      selectQueue.length = 0;
      txUpdateCalls.length = 0;
      txInsertCalls.length = 0;
      db.select.mockClear();
      db.update.mockClear();
      db.insert.mockClear();
      db.transaction.mockClear();
      tx.select.mockClear();
      tx.update.mockClear();
      tx.insert.mockClear();
    },
    queueSelect: (rows: any[]) => {
      selectQueue.push(rows);
    },
    txUpdateCalls,
    txInsertCalls,
  };
});

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

describe("paymentMethods", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetHarness();
  });

  it("creates the first saved method as default and records consent metadata", async () => {
    queueSelect([]);

    const { createSavedPaymentMethod } = await import("./paymentMethods");
    const result = await createSavedPaymentMethod({
      userId: 7,
      actorUserId: 7,
      actorType: "user",
      input: {
        tenantId: "tenant-a",
        providerPaymentMethodId: "pm_41",
        brand: "Visa",
        last4: "4242",
        expMonth: 4,
        expYear: 2030,
        autoRenewEligible: true,
        consentVersion: "v2026-04",
        consentSnapshotJson: {
          consentText: "I agree to auto-renew.",
          locale: "en",
        },
      },
    });

    expect(result.isDefault).toBe(true);
    expect(txInsertCalls[0]).toEqual(expect.objectContaining({
      providerPaymentMethodId: "pm_41",
      consentVersion: "v2026-04",
      consentSnapshotJson: expect.objectContaining({
        consentText: "I agree to auto-renew.",
      }),
    }));
  });

  it("rejects removing a payment method that is still active for auto-renew", async () => {
    queueSelect([{
      id: 41,
      userId: 7,
      tenantId: "tenant-a",
      providerPaymentMethodId: "pm_41",
      status: "active",
      isDefault: true,
    }]);
    queueSelect([{
      id: 80,
      subscriptionId: 9,
      defaultPaymentMethodId: 41,
      autoRenewEnabled: true,
      consentWithdrawnAt: null,
    }]);
    queueSelect([]);

    const { removePaymentMethodForUser } = await import("./paymentMethods");
    await expect(removePaymentMethodForUser({
      userId: 7,
      paymentMethodId: 41,
      actorUserId: 7,
    })).rejects.toThrow("Cannot remove a payment method that is active for auto-renew");
  });

  it("requires eligible default payment method and consent to enable auto-renew", async () => {
    queueSelect([{
      id: 9,
      userId: 7,
      tenantId: "tenant-a",
      status: "active",
      defaultPaymentMethodId: null,
      autoRenewEnabled: false,
    }]);
    queueSelect([{
      id: 41,
      userId: 7,
      tenantId: "tenant-a",
      status: "active",
      isDefault: false,
      autoRenewEligible: true,
    }]);
    queueSelect([]);

    const { enableAutoRenewForUser } = await import("./paymentMethods");
    const result = await enableAutoRenewForUser({
      userId: 7,
      actorUserId: 7,
      defaultPaymentMethodId: 41,
      consentVersion: "v2026-04",
      consentSnapshotJson: {
        consentText: "I agree to off-session renewals.",
        locale: "en",
        enrollmentSource: "billing_center",
      },
    });

    expect(result).toEqual({
      subscriptionId: 9,
      paymentMethodId: 41,
      renewalMode: "auto_charge",
      autoRenewEnabled: true,
    });
    expect(txUpdateCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        renewalMode: "auto_charge",
        autoRenewEnabled: true,
      }),
    ]));
  });
});
