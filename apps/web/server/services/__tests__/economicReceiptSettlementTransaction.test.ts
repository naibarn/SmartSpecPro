import { beforeEach, describe, expect, it, vi } from "vitest";

const durableMocks = vi.hoisted(() => ({
  capture: vi.fn(),
  release: vi.fn(),
}));

vi.mock("../economicDurableService", () => ({
  captureEconomicHoldInTransaction: durableMocks.capture,
  releaseEconomicHoldInTransaction: durableMocks.release,
}));

import {
  EconomicReceiptSettlementError,
  settleRunnerEconomicReceipt,
  type PersistedRunnerReceipt,
  type VerifiedRunnerAccountingEvidence,
} from "../economicReceiptSettlement";

const scope = {
  tenantId: "tenant-a",
  jobId: "job-a",
  attemptId: "attempt-a",
  holdId: "hold-a",
  receiptEventId: "receipt-a",
};

const receiptRow: PersistedRunnerReceipt & {
  jobStatus: string;
  payload: Record<string, unknown>;
} = {
  tenantId: scope.tenantId,
  jobId: scope.jobId,
  attemptId: scope.attemptId,
  eventId: scope.receiptEventId,
  eventType: "RUNNER_EXECUTION_COMPLETED",
  eventIdempotencyKey: "runner-event:receipt-a",
  sequence: 4,
  workerJobAttempt: 1,
  leaseFencingVersion: 3,
  jobStatus: "succeeded",
  payload: {
    eventId: scope.receiptEventId,
    commandId: "command-a",
    runnerId: "runner-a",
    runnerSessionId: "session-a",
    sequence: 4,
    exitCode: 0,
  },
};

function makeDatabase() {
  const hold = {
    id: scope.holdId,
    tenantId: scope.tenantId,
    workerJobId: scope.jobId,
    attemptId: scope.attemptId,
    status: "held",
    currency: "USD",
    amountMinorUnits: 500,
    capturedMinorUnits: 0,
    releasedMinorUnits: 0,
  };
  const events: Array<Record<string, any>> = [];
  const reconciliations: Array<Record<string, any>> = [];
  let currentReceipt = { ...receiptRow, payload: { ...receiptRow.payload } };
  let inTransaction = false;
  let outsideSelectIndex = 0;

  const selectReceipt = () => {
    const selected = outsideSelectIndex++ % 2 === 0 ? hold : currentReceipt;
    const query: any = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      limit: async () => [selected],
    };
    return query;
  };

  const database = {
    select: selectReceipt,
    transaction: async (callback: (tx: any) => Promise<unknown>) => {
      let selectIndex = 0;
      inTransaction = true;
      const tx: any = {
        select: () => {
          const query: any = {
            from: () => query,
            innerJoin: () => query,
            where: () => query,
            for: () => query,
            limit: async () => {
              const index = selectIndex++;
              if (index === 0) return [hold];
              if (index === 1)
                return [
                  {
                    ...currentReceipt,
                    jobStatus: currentReceipt.jobStatus,
                    payload: currentReceipt.payload,
                  },
                ];
              if (index === 2) {
                return [
                  events.find(
                    event =>
                      event.eventType === "runner_receipt_economically_settled"
                  ),
                ].filter(Boolean);
              }
              if (index === 3) {
                return [
                  events.find(
                    event =>
                      event.eventType ===
                      "runner_receipt_reconciliation_required"
                  ),
                ].filter(Boolean);
              }
              if (index === 4) {
                return [
                  reconciliations.find(item => item.status === "pending"),
                ].filter(Boolean);
              }
              throw new Error(`unexpected select call ${index}`);
            },
          };
          return query;
        },
        insert: (table: unknown) => {
          const builder: any = {
            values: (values: Record<string, any>) => {
              builder.pending = {
                ...values,
                id: `row-${events.length + reconciliations.length + 1}`,
              };
              return builder;
            },
            onConflictDoNothing: () => builder,
            returning: async () => {
              const row = builder.pending;
              if (row.eventType?.startsWith("runner_receipt_")) {
                const existing = events.find(
                  item => item.idempotencyKey === row.idempotencyKey
                );
                if (!existing) events.push(row);
                return existing ? [] : [row];
              }
              reconciliations.push(row);
              return [row];
            },
            then: (resolve: (value: unknown) => unknown) => {
              const row = builder.pending;
              const existing = events.find(
                item => item.idempotencyKey === row.idempotencyKey
              );
              if (!existing) events.push(row);
              return Promise.resolve(resolve(undefined));
            },
          };
          void table;
          return builder;
        },
        update: () => {
          const builder: any = {
            set: (values: Record<string, unknown>) => {
              builder.valuesToSet = values;
              return builder;
            },
            where: () => builder,
            then: (resolve: (value: unknown) => unknown) =>
              Promise.resolve(resolve(undefined)),
          };
          return builder;
        },
      };
      try {
        return await callback(tx);
      } finally {
        inTransaction = false;
      }
    },
  };

  return {
    database,
    hold,
    events,
    reconciliations,
    isInTransaction: () => inTransaction,
    mutateReceipt: () => {
      currentReceipt = {
        ...currentReceipt,
        payload: { ...currentReceipt.payload, sourceDigest: "changed" },
      };
    },
    replaceReceipt: () => {
      currentReceipt = {
        ...currentReceipt,
        eventId: "receipt-distinct",
        payload: { ...currentReceipt.payload, eventId: "receipt-distinct" },
      };
    },
  };
}

function meteredEvidence(): VerifiedRunnerAccountingEvidence {
  return {
    kind: "provider_metered",
    policyVersion: "pricing-v1",
    providerUsageRef: "usage:codex:job-a",
    usageDigest: "a".repeat(64),
    pricingPolicyRef: "pricing:approved-v1",
    verificationRef: "verified-usage:job-a",
    amountMinorUnits: 120,
    currency: "USD",
    captureJournalLines: [
      {
        accountId: "expense",
        tenantId: scope.tenantId,
        currency: "USD",
        debitMinorUnits: 120,
        creditMinorUnits: 0,
      },
      {
        accountId: "reserve",
        tenantId: scope.tenantId,
        currency: "USD",
        debitMinorUnits: 0,
        creditMinorUnits: 120,
      },
    ],
    releaseJournalLines: [
      {
        accountId: "reserve",
        tenantId: scope.tenantId,
        currency: "USD",
        debitMinorUnits: 380,
        creditMinorUnits: 0,
      },
      {
        accountId: "available",
        tenantId: scope.tenantId,
        currency: "USD",
        debitMinorUnits: 0,
        creditMinorUnits: 380,
      },
    ],
  };
}

describe("receipt-backed economic settlement transaction orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    durableMocks.capture.mockResolvedValue(undefined);
    durableMocks.release.mockResolvedValue(undefined);
  });

  it("captures only verified actual provider use, releases the remainder, and replays idempotently", async () => {
    const state = makeDatabase();
    const verifier = {
      verify: vi.fn().mockImplementation(async () => {
        expect(state.isInTransaction()).toBe(false);
        return meteredEvidence();
      }),
    };

    const first = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );
    const replay = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );

    expect(first.status).toBe("settled");
    expect(first.capturedMinorUnits).toBe(120);
    expect(replay).toMatchObject({
      status: "settled",
      capturedMinorUnits: 120,
      receiptDigest: first.receiptDigest,
      eventId: first.eventId,
      replayed: true,
    });
    // The service verifies before both the first settlement and replay, with
    // neither external verification occurring under a hold row lock.
    expect(verifier.verify).toHaveBeenCalledTimes(2);
    expect(durableMocks.capture).toHaveBeenCalledTimes(1);
    expect(durableMocks.capture.mock.calls[0][1]).toMatchObject({
      amountMinorUnits: 120,
      idempotencyKey: `runner-capture:${first.receiptDigest}`,
    });
    expect(durableMocks.release).toHaveBeenCalledTimes(1);
    expect(durableMocks.release.mock.calls[0][1]).toMatchObject({
      idempotencyKey: `runner-release:${first.receiptDigest}`,
    });
  });

  it("creates one reconciliation and retries the same untrusted receipt without capture or release", async () => {
    const state = makeDatabase();
    const verifier = {
      verify: vi.fn().mockResolvedValue({
        kind: "unverified",
        reasonCode: "USAGE_EVIDENCE_MISSING",
      } satisfies VerifiedRunnerAccountingEvidence),
    };

    const first = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );
    const retry = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );

    expect(first.status).toBe("reconciliation_required");
    expect(retry).toMatchObject({
      status: "reconciliation_required",
      receiptDigest: first.receiptDigest,
      reconciliationId: first.reconciliationId,
      replayed: true,
    });
    expect(state.events).toHaveLength(1);
    expect(state.reconciliations).toHaveLength(1);
    expect(state.hold).toMatchObject({
      status: "held",
      capturedMinorUnits: 0,
      releasedMinorUnits: 0,
    });
    expect(durableMocks.capture).not.toHaveBeenCalled();
    expect(durableMocks.release).not.toHaveBeenCalled();
  });

  it("routes verifier exceptions to reconciliation without touching the hold", async () => {
    const state = makeDatabase();
    const verifier = {
      verify: vi
        .fn()
        .mockRejectedValue(new Error("usage authority unavailable")),
    };

    const result = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );

    expect(result.status).toBe("reconciliation_required");
    expect(state.events[0]).toMatchObject({
      eventType: "runner_receipt_reconciliation_required",
      payloadJson: { reasonCode: "ACCOUNTING_VERIFIER_UNAVAILABLE" },
    });
    expect(state.hold).toMatchObject({
      status: "held",
      capturedMinorUnits: 0,
      releasedMinorUnits: 0,
    });
    expect(durableMocks.capture).not.toHaveBeenCalled();
    expect(durableMocks.release).not.toHaveBeenCalled();
  });

  it("retries after transient ledger capture failure without recording settlement early", async () => {
    const state = makeDatabase();
    const verifier = { verify: vi.fn().mockResolvedValue(meteredEvidence()) };
    durableMocks.capture
      .mockRejectedValueOnce(new Error("ledger temporarily unavailable"))
      .mockResolvedValueOnce(undefined);

    await expect(
      settleRunnerEconomicReceipt(state.database as never, scope, verifier)
    ).rejects.toThrow("ledger temporarily unavailable");
    expect(state.events).toHaveLength(0);

    const recovered = await settleRunnerEconomicReceipt(
      state.database as never,
      scope,
      verifier
    );

    expect(recovered.status).toBe("settled");
    expect(state.events).toHaveLength(1);
    expect(durableMocks.capture).toHaveBeenCalledTimes(2);
    expect(durableMocks.release).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the durable receipt is bound to another attempt", async () => {
    const state = makeDatabase();
    const verifier = { verify: vi.fn().mockResolvedValue(meteredEvidence()) };
    const mismatchedScope = { ...scope, attemptId: "attempt-other" };

    await expect(
      settleRunnerEconomicReceipt(
        state.database as never,
        mismatchedScope,
        verifier
      )
    ).rejects.toMatchObject({
      code: "SETTLEMENT_HOLD_BINDING_MISMATCH",
    } satisfies Partial<EconomicReceiptSettlementError>);
    expect(verifier.verify).not.toHaveBeenCalled();
    expect(durableMocks.capture).not.toHaveBeenCalled();
  });

  it("rejects a receipt that changes while external verification is in flight", async () => {
    const state = makeDatabase();
    const verifier = {
      verify: vi.fn().mockImplementation(async () => {
        expect(state.isInTransaction()).toBe(false);
        state.mutateReceipt();
        return meteredEvidence();
      }),
    };

    await expect(
      settleRunnerEconomicReceipt(state.database as never, scope, verifier)
    ).rejects.toMatchObject({ code: "SETTLEMENT_RECEIPT_CONFLICT" });
    expect(durableMocks.capture).not.toHaveBeenCalled();
    expect(durableMocks.release).not.toHaveBeenCalled();
    expect(state.events).toHaveLength(0);
  });

  it("does not settle a distinct receipt against an already settled hold attempt", async () => {
    const state = makeDatabase();
    const verifier = { verify: vi.fn().mockResolvedValue(meteredEvidence()) };

    await settleRunnerEconomicReceipt(state.database as never, scope, verifier);
    state.replaceReceipt();
    await expect(
      settleRunnerEconomicReceipt(
        state.database as never,
        { ...scope, receiptEventId: "receipt-distinct" },
        verifier
      )
    ).rejects.toMatchObject({ code: "SETTLEMENT_DUPLICATE_RECEIPT" });
    expect(state.events).toHaveLength(1);
    expect(durableMocks.capture).toHaveBeenCalledTimes(1);
    expect(durableMocks.release).toHaveBeenCalledTimes(1);
  });

  it("times out a slow verifier into reconciliation without touching the hold", async () => {
    const state = makeDatabase();
    const verifier = { verify: vi.fn(() => new Promise<never>(() => {})) };

    const result = await settleRunnerEconomicReceipt(
      state.database as never,
      { ...scope, verifierTimeoutMs: 5 },
      verifier
    );

    expect(result.status).toBe("reconciliation_required");
    expect(state.events[0]).toMatchObject({
      eventType: "runner_receipt_reconciliation_required",
      payloadJson: { reasonCode: "ACCOUNTING_VERIFIER_TIMEOUT" },
    });
    expect(state.hold).toMatchObject({
      status: "held",
      capturedMinorUnits: 0,
      releasedMinorUnits: 0,
    });
    expect(durableMocks.capture).not.toHaveBeenCalled();
    expect(durableMocks.release).not.toHaveBeenCalled();
  });
});
