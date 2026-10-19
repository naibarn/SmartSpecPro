import { describe, expect, it } from "vitest";
import type {
  PaymentRequest,
  UsageReceipt,
} from "../../../shared/commercialPaymentContracts";
import {
  assertLedgerBalanced,
  CommercialPaymentCoordinator,
  DeterministicCommercialPaymentStore,
  DeterministicMockPaymentProvider,
} from "../commercialPayments";

function makeRequest(
  taskId: string,
  amount = 100,
  idempotencyKey = `idem:${taskId}`
): PaymentRequest {
  const now = new Date(0).toISOString();
  return {
    contractVersion: "commercial-payment/v1",
    requestId: `request:${taskId}`,
    idempotencyKey,
    taskId,
    invocationId: `invoke:${taskId}`,
    rail: "fiat_payg",
    maxAmountMinor: amount,
    allowOverdraft: false,
    overdraftLimitMinor: 0,
    snapshot: {
      version: 1,
      snapshotId: `snapshot:${taskId}`,
      taskId,
      tenantRef: "tenant-1",
      payerRef: "payer-1",
      serviceRef: "service-1",
      priceBookVersion: "prices-v1",
      currency: "USD",
      maxAmountMinor: amount,
      allocation: {
        policyVersion: "share-v1",
        allocations: [{ beneficiaryRef: "creator-1", amountMinor: amount }],
      },
      createdAt: now,
      expiresAt: "2099-01-01T00:00:00.000Z",
    },
  };
}
function receipt(
  taskId: string,
  amount: number,
  sequence = 1,
  idempotencyKey = `usage:${taskId}:${sequence}`
): UsageReceipt {
  return {
    version: 1,
    receiptId: `receipt:${taskId}:${sequence}`,
    taskId,
    invocationId: `invoke:${taskId}`,
    sequence,
    idempotencyKey,
    meter: "tokens",
    unit: "token",
    quantity: 12,
    amountMinor: amount,
    currency: "USD",
    sourceAttemptRef: `attempt:${taskId}`,
    evidenceRef: `usage-log:${taskId}:${sequence}`,
    occurredAt: new Date(0).toISOString(),
  };
}
function setup(cap = 100) {
  const store = new DeterministicCommercialPaymentStore();
  store.limits.set("tenant-1:payer-1:USD", {
    tenantRef: "tenant-1",
    payerRef: "payer-1",
    currency: "USD",
    globalCapMinor: cap,
    overdraftLimitMinor: 0,
    overdraftEnabled: false,
  });
  const provider = new DeterministicMockPaymentProvider();
  return {
    store,
    provider,
    coordinator: new CommercialPaymentCoordinator(store, [provider]),
  };
}

describe("SPEC-207/280 commercial payment bridge", () => {
  it("runs deterministic task-to-settlement-to-refund with balanced immutable ledger postings", async () => {
    const { store, coordinator } = setup(500);
    await coordinator.reserve(makeRequest("task-1", 100));
    const authorization = await coordinator.authorize("task-1");
    expect(authorization.outcome).toBe("authorized");
    await coordinator.recordUsage("task-1", receipt("task-1", 35));
    const settlement = await coordinator.settle("task-1");
    expect(settlement.capturedMinor).toBe(35);
    expect(settlement.releasedMinor).toBe(65);
    expect(settlement.allocation.allocations).toEqual([
      { beneficiaryRef: "creator-1", amountMinor: 35 },
    ]);
    expect(await coordinator.settle("task-1")).toEqual(settlement);
    expect(await coordinator.refund("task-1", 10, "refund:once")).toBe(10);
    expect(await coordinator.refund("task-1", 10, "refund:once")).toBe(0);
    assertLedgerBalanced(store.ledger);
    expect(
      store.ledger.reduce(
        (n, row) => n + (row.side === "debit" ? row.amountMinor : 0),
        0
      )
    ).toBe(45);
  });

  it("fences concurrent reservations at the global cap and makes request retries idempotent", async () => {
    const { store, coordinator } = setup(100);
    const settled = await Promise.allSettled([
      coordinator.reserve(makeRequest("a", 70)),
      coordinator.reserve(makeRequest("b", 70)),
    ]);
    expect(settled.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(settled.filter(r => r.status === "rejected")).toHaveLength(1);
    const replay = await coordinator.reserve(makeRequest("a", 70));
    expect(replay.request.taskId).toBe("a");
    expect(store.tasks.size).toBe(1);
    await expect(
      coordinator.reserve(makeRequest("different", 10, "idem:a"))
    ).rejects.toThrow("different immutable request");
  });

  it("deduplicates duplicate usage callbacks and refuses a conflicting replay", async () => {
    const { coordinator } = setup(100);
    await coordinator.reserve(makeRequest("callback"));
    await coordinator.authorize("callback");
    const item = receipt("callback", 20);
    expect(await coordinator.recordUsage("callback", item)).toMatchObject({
      duplicate: false,
    });
    expect(await coordinator.recordUsage("callback", item)).toMatchObject({
      duplicate: true,
    });
    await expect(
      coordinator.recordUsage("callback", { ...item, amountMinor: 21 })
    ).rejects.toThrow("different data");
  });

  it("blocks alternate routing while authorization outcome is unknown, then reconciles the original", async () => {
    const { coordinator, provider } = setup(100);
    await coordinator.reserve(makeRequest("unknown"));
    provider.authorizationOutcome = "unknown";
    await expect(coordinator.authorize("unknown")).resolves.toMatchObject({
      outcome: "unknown",
    });
    await expect(coordinator.authorize("unknown")).rejects.toThrow(
      "reconcile before retry or route failover"
    );
    provider.lookupOutcome = "authorized";
    await expect(
      coordinator.reconcileAuthorization("unknown")
    ).resolves.toMatchObject({ outcome: "authorized" });
  });

  it("routes to the next configured provider only after an explicit decline", async () => {
    const { store, coordinator, provider } = setup(100);
    const second = new DeterministicMockPaymentProvider();
    Object.defineProperty(second, "providerId", {
      value: "deterministic-backup",
    });
    provider.authorizationOutcome = "declined";
    const routed = new CommercialPaymentCoordinator(store, [provider, second]);
    await routed.reserve({
      ...makeRequest("failover"),
      providerRoute: [provider.providerId, second.providerId],
    });
    const authorization = await routed.authorize("failover");
    expect(authorization.outcome).toBe("authorized");
    expect(
      store.tasks
        .get("failover")
        ?.authorizationAttempts.map(item => item.outcome)
    ).toEqual(["declined", "authorized"]);
    expect(second.authorizeCalls).toBe(1);
  });

  it("denies overdraft and over-budget use; supports checkpoint/resume with a new fencing token", async () => {
    let { coordinator, store } = setup(100);
    const overdraft = {
      ...makeRequest("debt", 101),
      allowOverdraft: true,
      overdraftLimitMinor: 1,
    };
    await expect(coordinator.reserve(overdraft)).rejects.toThrow(
      "Overdraft is not authorized"
    );
    await coordinator.reserve(makeRequest("resume", 100));
    await coordinator.authorize("resume");
    await expect(
      coordinator.recordUsage("resume", receipt("resume", 101))
    ).rejects.toThrow("exceeds reserved task budget");
    const firstFence = await coordinator.pause("resume");
    store = DeterministicCommercialPaymentStore.restoreCrashTestSnapshot(
      store.snapshotForCrashTest()
    );
    const afterRestart = new CommercialPaymentCoordinator(store, [
      new DeterministicMockPaymentProvider(),
    ]);
    const resumedFence = await afterRestart.resume("resume");
    expect(resumedFence).toBe(firstFence + 1);
    await expect(
      afterRestart.recordUsage("resume", receipt("resume", 40))
    ).resolves.toMatchObject({ fencingToken: resumedFence });
  });

  it("admits only an explicitly enabled and bounded overdraft", async () => {
    const { store, coordinator } = setup(100);
    store.limits.set("tenant-1:payer-1:USD", {
      tenantRef: "tenant-1",
      payerRef: "payer-1",
      currency: "USD",
      globalCapMinor: 100,
      overdraftLimitMinor: 25,
      overdraftEnabled: true,
    });
    const allowed = {
      ...makeRequest("bounded-debt", 120),
      allowOverdraft: true,
      overdraftLimitMinor: 20,
    };
    await expect(coordinator.reserve(allowed)).resolves.toMatchObject({
      reservedMinor: 120,
    });
    const overLimit = {
      ...makeRequest("too-much-debt", 126),
      allowOverdraft: true,
      overdraftLimitMinor: 26,
    };
    await expect(coordinator.reserve(overLimit)).rejects.toThrow(
      "Global spending limit exceeded"
    );
  });

  it("reconciles an unknown capture on the original provider before posting the ledger", async () => {
    const { coordinator, provider, store } = setup(100);
    await coordinator.reserve(makeRequest("capture-unknown"));
    await coordinator.authorize("capture-unknown");
    await coordinator.recordUsage(
      "capture-unknown",
      receipt("capture-unknown", 20)
    );
    provider.captureOutcome = "unknown";
    await expect(coordinator.settle("capture-unknown")).rejects.toThrow(
      "reconcile original provider reference before failover"
    );
    expect(store.tasks.get("capture-unknown")?.state).toBe(
      "reconciliation_required"
    );
    expect(store.ledger).toHaveLength(0);
    await expect(coordinator.settle("capture-unknown")).rejects.toThrow(
      "reconcile the original provider operation"
    );
    provider.reconciledCaptureOutcome = "captured";
    const settlement = await coordinator.reconcileSettlement("capture-unknown");
    expect(settlement?.capturedMinor).toBe(20);
    expect(store.tasks.get("capture-unknown")?.state).toBe("settled");
    expect(provider.captureCalls).toBe(1);
    assertLedgerBalanced(store.ledger);
  });

  it("reconciles an unknown partial refund and reverses its exact allocation once", async () => {
    const { coordinator, provider, store } = setup(100);
    await coordinator.reserve(makeRequest("refund-unknown"));
    await coordinator.authorize("refund-unknown");
    await coordinator.recordUsage(
      "refund-unknown",
      receipt("refund-unknown", 40)
    );
    await coordinator.settle("refund-unknown");
    provider.refundOutcome = "unknown";
    await expect(
      coordinator.refund("refund-unknown", 10, "refund-a")
    ).rejects.toThrow("outcome unknown");
    await expect(
      coordinator.refund("refund-unknown", 10, "refund-a")
    ).rejects.toThrow("reconcile the original provider operation");
    provider.reconciledRefundOutcome = "refunded";
    await expect(
      coordinator.reconcileRefund("refund-unknown", "refund-a")
    ).resolves.toBe(10);
    expect(await coordinator.refund("refund-unknown", 10, "refund-a")).toBe(0);
    assertLedgerBalanced(store.ledger);
    expect(store.tasks.get("refund-unknown")?.pendingRefunds.size).toBe(0);
  });
});
