import { createHash } from "node:crypto";
import {
  assertCommercialSnapshot,
  type CommercialSnapshot,
  type PaymentAuthorization,
  type PaymentProviderAdapter,
  type PaymentRail,
  type PaymentRequest,
  type Settlement,
  type UsageReceipt,
} from "../../shared/commercialPaymentContracts";

export type CommercialTaskState =
  | "reserved"
  | "authorization_unknown"
  | "authorized"
  | "paused"
  | "settled"
  | "reconciliation_required";
export interface SpendingLimit {
  readonly tenantRef: string;
  readonly payerRef: string;
  readonly currency: string;
  readonly globalCapMinor: number;
  readonly overdraftLimitMinor: number;
  readonly overdraftEnabled: boolean;
}
export interface CommercialTask {
  readonly request: PaymentRequest;
  state: CommercialTaskState;
  reservedMinor: number;
  capturedMinor: number;
  fencingToken: number;
  authorization?: PaymentAuthorization;
  authorizationAttempts: PaymentAuthorization[];
  activeProviderId?: string;
  pendingSettlementStep?: "capture" | "release";
  pendingCapturedMinor?: number;
  pendingRefunds: Map<string, number>;
  receipts: Map<string, UsageReceipt>;
  settlement?: Settlement;
}
export interface LedgerPosting {
  readonly reference: string;
  readonly taskId: string;
  readonly account: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly side: "debit" | "credit";
  readonly idempotencyKey: string;
}

/** Storage boundary. Production persistence must provide equivalent SERIALIZABLE/row-lock semantics. */
export interface CommercialPaymentStore {
  readonly limits: Map<string, SpendingLimit>;
  readonly tasks: Map<string, CommercialTask>;
  readonly idempotency: Map<string, string>;
  readonly ledger: LedgerPosting[];
  readonly refunds: Map<string, number>;
  runExclusive<T>(key: string, work: () => Promise<T> | T): Promise<T>;
}

export class DeterministicCommercialPaymentStore implements CommercialPaymentStore {
  readonly limits = new Map<string, SpendingLimit>();
  readonly tasks = new Map<string, CommercialTask>();
  readonly idempotency = new Map<string, string>();
  readonly ledger: LedgerPosting[] = [];
  readonly refunds = new Map<string, number>();
  private readonly locks = new Map<string, Promise<void>>();
  snapshotForCrashTest() {
    return JSON.stringify({
      limits: [...this.limits.entries()],
      tasks: [...this.tasks.entries()].map(([key, task]) => [
        key,
        {
          ...task,
          receipts: [...task.receipts.entries()],
          pendingRefunds: [...task.pendingRefunds.entries()],
        },
      ]),
      idempotency: [...this.idempotency.entries()],
      ledger: this.ledger,
      refunds: [...this.refunds.entries()],
    });
  }
  static restoreCrashTestSnapshot(
    serialized: string
  ): DeterministicCommercialPaymentStore {
    const data = JSON.parse(serialized);
    const store = new DeterministicCommercialPaymentStore();
    for (const [key, value] of data.limits) store.limits.set(key, value);
    for (const [key, task] of data.tasks)
      store.tasks.set(key, {
        ...task,
        receipts: new Map(task.receipts),
        pendingRefunds: new Map(task.pendingRefunds ?? []),
      });
    for (const [key, value] of data.idempotency)
      store.idempotency.set(key, value);
    store.ledger.push(...data.ledger);
    for (const [key, value] of data.refunds) store.refunds.set(key, value);
    return store;
  }
  async runExclusive<T>(key: string, work: () => Promise<T> | T): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>(resolve => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await work();
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }
}

const accountKey = (tenant: string, payer: string, currency: string) =>
  `${tenant}:${payer}:${currency}`;
const stableHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const exposed = (tasks: Iterable<CommercialTask>, key: string) =>
  [...tasks]
    .filter(
      t =>
        accountKey(
          t.request.snapshot.tenantRef,
          t.request.snapshot.payerRef,
          t.request.snapshot.currency
        ) === key
    )
    .reduce((n, t) => n + t.reservedMinor + t.capturedMinor, 0);

export class CommercialPaymentCoordinator {
  constructor(
    private readonly store: CommercialPaymentStore,
    private readonly adapters: readonly PaymentProviderAdapter[]
  ) {}

  async reserve(request: PaymentRequest): Promise<CommercialTask> {
    assertCommercialSnapshot(request.snapshot);
    if (
      request.taskId !== request.snapshot.taskId ||
      request.maxAmountMinor !== request.snapshot.maxAmountMinor
    )
      throw new Error(
        "Payment request does not match the immutable commercial snapshot"
      );
    if (!request.idempotencyKey || !request.requestId || !request.invocationId)
      throw new Error("Missing payment request identity");
    if (
      !Number.isSafeInteger(request.maxAmountMinor) ||
      request.maxAmountMinor < 0 ||
      !Number.isSafeInteger(request.overdraftLimitMinor) ||
      request.overdraftLimitMinor < 0
    )
      throw new Error("Invalid task payment cap");
    const digest = stableHash(request);
    const key = accountKey(
      request.snapshot.tenantRef,
      request.snapshot.payerRef,
      request.snapshot.currency
    );
    return this.store.runExclusive(key, () => {
      const priorId = this.store.idempotency.get(request.idempotencyKey);
      if (priorId) {
        const prior = this.store.tasks.get(priorId)!;
        if (stableHash(prior.request) !== digest)
          throw new Error(
            "Idempotency key reused with a different immutable request"
          );
        return prior;
      }
      const limit = this.store.limits.get(key);
      if (!limit)
        throw new Error("No spending limit configured for payer and tenant");
      if (limit.currency !== request.snapshot.currency)
        throw new Error("Spending limit currency mismatch");
      const allowedOverdraft =
        request.allowOverdraft && limit.overdraftEnabled
          ? Math.min(request.overdraftLimitMinor, limit.overdraftLimitMinor)
          : 0;
      if (
        request.overdraftLimitMinor > 0 &&
        (!request.allowOverdraft || !limit.overdraftEnabled)
      )
        throw new Error("Overdraft is not authorized");
      if (
        exposed(this.store.tasks.values(), key) + request.maxAmountMinor >
        limit.globalCapMinor + allowedOverdraft
      )
        throw new Error("Global spending limit exceeded");
      const task: CommercialTask = {
        request,
        state: "reserved",
        reservedMinor: request.maxAmountMinor,
        capturedMinor: 0,
        fencingToken: 1,
        authorizationAttempts: [],
        pendingRefunds: new Map(),
        receipts: new Map(),
      };
      this.store.tasks.set(request.taskId, task);
      this.store.idempotency.set(request.idempotencyKey, request.taskId);
      return task;
    });
  }

  async authorize(taskId: string): Promise<PaymentAuthorization> {
    const task = this.requireTask(taskId);
    return this.store.runExclusive(
      accountKey(
        task.request.snapshot.tenantRef,
        task.request.snapshot.payerRef,
        task.request.snapshot.currency
      ),
      async () => {
        if (task.authorization) {
          if (task.state === "authorization_unknown")
            throw new Error(
              "Authorization outcome unknown; reconcile before retry or route failover"
            );
          return task.authorization;
        }
        const routes = task.request.providerRoute?.length
          ? task.request.providerRoute.map(providerId =>
              this.adapter(task.request.rail, providerId)
            )
          : this.adapters.filter(adapter =>
              adapter.supportedRails.includes(task.request.rail)
            );
        if (!routes.length)
          throw new Error(`No provider route for ${task.request.rail}`);
        for (const adapter of routes) {
          const auth = await adapter.authorize(task.request, task.fencingToken);
          if (
            auth.requestId !== task.request.requestId ||
            auth.fencingToken !== task.fencingToken ||
            auth.idempotencyKey !==
              `authorize:${task.request.idempotencyKey}` ||
            auth.rail !== task.request.rail ||
            auth.currency !== task.request.snapshot.currency ||
            !Number.isSafeInteger(auth.amountMinor) ||
            auth.amountMinor < 0 ||
            auth.amountMinor > task.request.maxAmountMinor ||
            !auth.providerRef
          )
            throw new Error(
              "Provider authorization does not match the fenced request"
            );
          task.authorizationAttempts.push(auth);
          task.authorization = auth;
          task.activeProviderId = adapter.providerId;
          if (auth.outcome === "authorized") {
            task.state = "authorized";
            return auth;
          }
          if (auth.outcome === "unknown") {
            task.state = "authorization_unknown";
            return auth;
          }
        }
        task.state = "reconciliation_required";
        task.reservedMinor = 0;
        return task.authorization!;
      }
    );
  }

  async reconcileAuthorization(taskId: string): Promise<PaymentAuthorization> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, async () => {
      if (!task.authorization || task.state !== "authorization_unknown")
        throw new Error("Task has no unknown authorization to reconcile");
      const result = await this.adapter(
        task.request.rail,
        task.activeProviderId
      ).lookup(task.authorization);
      if (
        result.authorizationId !== task.authorization.authorizationId ||
        result.providerRef !== task.authorization.providerRef ||
        result.fencingToken !== task.fencingToken
      )
        throw new Error("Authorization reconciliation observation mismatch");
      task.authorization = result;
      task.state =
        result.outcome === "authorized"
          ? "authorized"
          : result.outcome === "declined"
            ? "reconciliation_required"
            : "authorization_unknown";
      if (result.outcome === "declined") task.reservedMinor = 0;
      return result;
    });
  }

  async recordUsage(
    taskId: string,
    receipt: UsageReceipt
  ): Promise<{ duplicate: boolean; fencingToken: number }> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, () => {
      if (task.state !== "authorized" && task.state !== "paused")
        throw new Error("Usage requires an authorized, resumable task");
      if (
        receipt.taskId !== taskId ||
        receipt.invocationId !== task.request.invocationId ||
        receipt.currency !== task.request.snapshot.currency ||
        !Number.isSafeInteger(receipt.quantity) ||
        receipt.quantity < 0 ||
        !Number.isSafeInteger(receipt.amountMinor) ||
        !receipt.idempotencyKey ||
        receipt.amountMinor < 0
      )
        throw new Error(
          "Usage receipt does not match the authorized invocation"
        );
      const prior = task.receipts.get(receipt.idempotencyKey);
      if (prior) {
        if (stableHash(prior) !== stableHash(receipt))
          throw new Error(
            "Usage receipt idempotency key reused with different data"
          );
        return { duplicate: true, fencingToken: task.fencingToken };
      }
      if (
        [...task.receipts.values()].some(
          r => r.sequence === receipt.sequence && r.taskId === receipt.taskId
        )
      )
        throw new Error("Duplicate usage sequence");
      const total = [...task.receipts.values()].reduce(
        (sum, r) => sum + r.amountMinor,
        receipt.amountMinor
      );
      if (total > task.reservedMinor || total > task.request.maxAmountMinor)
        throw new Error("Usage exceeds reserved task budget");
      task.receipts.set(receipt.idempotencyKey, receipt);
      return { duplicate: false, fencingToken: task.fencingToken };
    });
  }

  async pause(taskId: string): Promise<number> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, () => {
      if (task.state !== "authorized")
        throw new Error("Only an authorized task can checkpoint");
      task.state = "paused";
      return task.fencingToken;
    });
  }

  async resume(taskId: string, additionalReserveMinor = 0): Promise<number> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, () => {
      if (task.state !== "paused") throw new Error("Task is not paused");
      if (
        !Number.isSafeInteger(additionalReserveMinor) ||
        additionalReserveMinor < 0 ||
        task.reservedMinor + additionalReserveMinor >
          task.request.maxAmountMinor
      )
        throw new Error("Incremental reserve exceeds the immutable task cap");
      const limit = this.store.limits.get(key)!;
      if (
        exposed(this.store.tasks.values(), key) + additionalReserveMinor >
        limit.globalCapMinor
      )
        throw new Error("Global spending limit exhausted while resuming");
      task.reservedMinor += additionalReserveMinor;
      task.fencingToken += 1;
      task.state = "authorized";
      return task.fencingToken;
    });
  }

  async settle(taskId: string): Promise<Settlement> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, async () => {
      if (task.settlement) return task.settlement;
      if (task.pendingSettlementStep)
        throw new Error(
          "Settlement outcome is unknown; reconcile the original provider operation before retry or failover"
        );
      if (task.state !== "authorized" && task.state !== "paused")
        throw new Error("Task cannot settle before authorization");
      if (!task.authorization) throw new Error("Missing authorization");
      const receipts = [...task.receipts.values()].sort(
        (a, b) => a.sequence - b.sequence
      );
      const amount = receipts.reduce((sum, r) => sum + r.amountMinor, 0);
      const capture = await this.adapter(
        task.request.rail,
        task.activeProviderId
      ).capture(
        task.authorization,
        receipts,
        `capture:${task.request.idempotencyKey}`
      );
      if (capture.outcome === "unknown") {
        task.pendingSettlementStep = "capture";
        task.state = "reconciliation_required";
        throw new Error(
          "Capture outcome unknown; reconcile original provider reference before failover"
        );
      }
      if (capture.capturedMinor !== amount || amount > task.reservedMinor)
        throw new Error(
          "Provider capture does not match metered usage or reservation"
        );
      task.pendingCapturedMinor = amount;
      const release = task.reservedMinor - amount;
      if (release > 0) {
        const released = await this.adapter(
          task.request.rail,
          task.activeProviderId
        ).release(task.authorization, `release:${task.request.idempotencyKey}`);
        if (released.outcome !== "released") {
          task.pendingSettlementStep = "release";
          task.state = "reconciliation_required";
          throw new Error(
            "Authorization release outcome unknown; reconciliation required"
          );
        }
      }
      return this.finalizeSettlement(task, receipts, amount, release);
    });
  }

  async reconcileSettlement(taskId: string): Promise<Settlement | null> {
    const task = this.requireTask(taskId);
    if (!task.authorization || !task.pendingSettlementStep)
      throw new Error("No pending provider settlement outcome to reconcile");
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, async () => {
      const adapter = this.adapter(task.request.rail, task.activeProviderId);
      const receipts = [...task.receipts.values()].sort(
        (a, b) => a.sequence - b.sequence
      );
      if (task.pendingSettlementStep === "capture") {
        const observed = await adapter.reconcileCapture(
          task.authorization!,
          receipts,
          `capture:${task.request.idempotencyKey}`
        );
        if (observed.outcome === "unknown") return null;
        if (observed.outcome === "declined") {
          task.pendingSettlementStep = undefined;
          task.state = "authorized";
          return null;
        }
        const expected = receipts.reduce(
          (sum, receipt) => sum + receipt.amountMinor,
          0
        );
        if (
          observed.capturedMinor !== expected ||
          observed.capturedMinor > task.reservedMinor
        ) {
          task.state = "reconciliation_required";
          throw new Error(
            "Reconciled provider capture violates the reserved usage amount"
          );
        }
        task.pendingCapturedMinor = observed.capturedMinor;
        task.pendingSettlementStep = undefined;
        const unused = task.reservedMinor - observed.capturedMinor;
        if (unused > 0) {
          const released = await adapter.release(
            task.authorization!,
            `release:${task.request.idempotencyKey}`
          );
          if (released.outcome !== "released") {
            task.pendingSettlementStep = "release";
            task.state = "reconciliation_required";
            return null;
          }
        }
        return this.finalizeSettlement(
          task,
          receipts,
          observed.capturedMinor,
          unused
        );
      }
      const released = await adapter.reconcileRelease(
        task.authorization!,
        `release:${task.request.idempotencyKey}`
      );
      if (released.outcome === "unknown") return null;
      if (released.outcome === "declined") {
        task.state = "reconciliation_required";
        throw new Error(
          "Provider confirmed unused authorization was not released"
        );
      }
      const amount = task.pendingCapturedMinor ?? 0;
      return this.finalizeSettlement(
        task,
        receipts,
        amount,
        task.reservedMinor - amount
      );
    });
  }

  private finalizeSettlement(
    task: CommercialTask,
    receipts: readonly UsageReceipt[],
    amount: number,
    release: number
  ): Settlement {
    const taskId = task.request.taskId;
    const settlementId = `settlement:${task.request.taskId}`;
    const allocationTotal = task.request.snapshot.allocation.allocations.reduce(
      (sum, item) => sum + item.amountMinor,
      0
    );
    let allocated = 0;
    const allocations = task.request.snapshot.allocation.allocations.map(
      (item, index, all) => {
        const share =
          index === all.length - 1
            ? Math.min(
                amount - allocated,
                Math.max(
                  0,
                  amount -
                    Math.floor(
                      (amount * (allocationTotal - item.amountMinor)) /
                        Math.max(1, task.request.snapshot.maxAmountMinor)
                    )
                )
              )
            : Math.min(
                amount - allocated,
                Math.floor(
                  (amount * item.amountMinor) /
                    Math.max(1, task.request.snapshot.maxAmountMinor)
                )
              );
        allocated += share;
        return { beneficiaryRef: item.beneficiaryRef, amountMinor: share };
      }
    );
    const platformAmount = amount - allocated;
    const postings: LedgerPosting[] = amount
      ? [
          {
            reference: `${settlementId}:payer`,
            taskId,
            account: `payer:${task.request.snapshot.payerRef}`,
            amountMinor: amount,
            currency: task.request.snapshot.currency,
            side: "debit",
            idempotencyKey: settlementId,
          },
          ...allocations
            .filter(item => item.amountMinor > 0)
            .map((item, index) => ({
              reference: `${settlementId}:beneficiary:${index}`,
              taskId,
              account: `beneficiary:${item.beneficiaryRef}`,
              amountMinor: item.amountMinor,
              currency: task.request.snapshot.currency,
              side: "credit" as const,
              idempotencyKey: settlementId,
            })),
          ...(platformAmount > 0
            ? [
                {
                  reference: `${settlementId}:platform`,
                  taskId,
                  account: "platform_revenue",
                  amountMinor: platformAmount,
                  currency: task.request.snapshot.currency,
                  side: "credit" as const,
                  idempotencyKey: settlementId,
                },
              ]
            : []),
        ]
      : [];
    const allocation = { ...task.request.snapshot.allocation, allocations };
    this.store.ledger.push(...postings);
    const settlement: Settlement = {
      settlementId,
      taskId,
      authorizationId: task.authorization.authorizationId,
      usageReceiptIds: receipts.map(r => r.receiptId),
      capturedMinor: amount,
      releasedMinor: release,
      currency: task.request.snapshot.currency,
      allocation,
      ledgerPostingRefs: postings.map(p => p.reference),
      idempotencyKey: settlementId,
      settledAt: new Date(0).toISOString(),
    };
    task.capturedMinor = amount;
    task.reservedMinor = 0;
    task.settlement = settlement;
    task.state = "settled";
    task.pendingSettlementStep = undefined;
    task.pendingCapturedMinor = undefined;
    return settlement;
  }

  async refund(
    taskId: string,
    amountMinor: number,
    idempotencyKey: string
  ): Promise<number> {
    const task = this.requireTask(taskId);
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, async () => {
      if (
        !task.settlement ||
        !Number.isSafeInteger(amountMinor) ||
        amountMinor <= 0 ||
        !idempotencyKey
      )
        throw new Error("Invalid refund request");
      const refundKey = `${taskId}:${idempotencyKey}`;
      const prior = this.store.refunds.get(refundKey);
      if (prior !== undefined) {
        if (prior !== amountMinor)
          throw new Error(
            "Refund idempotency key reused with a different amount"
          );
        return 0;
      }
      if (task.pendingRefunds.has(idempotencyKey))
        throw new Error(
          "Refund outcome unknown; reconcile the original provider operation before retry"
        );
      const refunded = [...this.store.refunds.entries()]
        .filter(([storedKey]) => storedKey.startsWith(`${taskId}:`))
        .reduce((sum, [, value]) => sum + value, 0);
      const pending = [...task.pendingRefunds.values()].reduce(
        (sum, value) => sum + value,
        0
      );
      if (refunded + pending + amountMinor > task.settlement.capturedMinor)
        throw new Error("Refund exceeds captured settlement");
      const result = await this.adapter(
        task.request.rail,
        task.activeProviderId
      ).refund(task.settlement, amountMinor, `${taskId}:${idempotencyKey}`);
      if (result.outcome === "unknown") {
        task.pendingRefunds.set(idempotencyKey, amountMinor);
        throw new Error("Refund outcome unknown; reconciliation required");
      }
      if (result.amountMinor !== amountMinor)
        throw new Error("Provider refund amount mismatch");
      this.commitRefund(task, amountMinor, idempotencyKey);
      return amountMinor;
    });
  }

  async reconcileRefund(
    taskId: string,
    idempotencyKey: string
  ): Promise<number> {
    const task = this.requireTask(taskId);
    const amountMinor = task.pendingRefunds.get(idempotencyKey);
    if (!task.settlement || amountMinor === undefined)
      throw new Error("No pending refund outcome to reconcile");
    const key = accountKey(
      task.request.snapshot.tenantRef,
      task.request.snapshot.payerRef,
      task.request.snapshot.currency
    );
    return this.store.runExclusive(key, async () => {
      const observation = await this.adapter(
        task.request.rail,
        task.activeProviderId
      ).reconcileRefund(
        task.settlement!,
        amountMinor,
        `${taskId}:${idempotencyKey}`
      );
      if (observation.outcome === "unknown") return 0;
      if (observation.outcome === "declined") {
        task.pendingRefunds.delete(idempotencyKey);
        return 0;
      }
      if (observation.amountMinor !== amountMinor)
        throw new Error("Reconciled refund amount mismatch");
      this.commitRefund(task, amountMinor, idempotencyKey);
      task.pendingRefunds.delete(idempotencyKey);
      return amountMinor;
    });
  }

  private commitRefund(
    task: CommercialTask,
    amountMinor: number,
    idempotencyKey: string
  ): void {
    if (!task.settlement)
      throw new Error("Missing settlement for refund posting");
    const taskId = task.request.taskId;
    const refundKey = `${taskId}:${idempotencyKey}`;
    const prior = this.store.refunds.get(refundKey);
    if (prior !== undefined) {
      if (prior !== amountMinor)
        throw new Error(
          "Refund idempotency key reused with a different amount"
        );
      return;
    }
    this.store.refunds.set(refundKey, amountMinor);
    const ref = `refund:${taskId}:${idempotencyKey}`;
    const allocated = task.settlement.allocation.allocations.reduce(
      (sum, item) => sum + item.amountMinor,
      0
    );
    let reversed = 0;
    const reversals = task.settlement.allocation.allocations.map(
      (item, index, all) => {
        const share =
          index === all.length - 1
            ? Math.min(
                amountMinor - reversed,
                Math.max(
                  0,
                  amountMinor -
                    Math.floor(
                      (amountMinor * (allocated - item.amountMinor)) /
                        Math.max(1, task.settlement!.capturedMinor)
                    )
                )
              )
            : Math.min(
                amountMinor - reversed,
                Math.floor(
                  (amountMinor * item.amountMinor) /
                    Math.max(1, task.settlement!.capturedMinor)
                )
              );
        reversed += share;
        return { beneficiaryRef: item.beneficiaryRef, amountMinor: share };
      }
    );
    const platformRefund = amountMinor - reversed;
    this.store.ledger.push(
      ...reversals
        .filter(item => item.amountMinor > 0)
        .map((item, index) => ({
          reference: `${ref}:beneficiary:${index}`,
          taskId,
          account: `beneficiary:${item.beneficiaryRef}`,
          amountMinor: item.amountMinor,
          currency: task.settlement!.currency,
          side: "debit" as const,
          idempotencyKey: ref,
        })),
      ...(platformRefund > 0
        ? [
            {
              reference: `${ref}:platform`,
              taskId,
              account: "platform_revenue",
              amountMinor: platformRefund,
              currency: task.settlement.currency,
              side: "debit" as const,
              idempotencyKey: ref,
            },
          ]
        : []),
      {
        reference: `${ref}:payer`,
        taskId,
        account: `payer:${task.request.snapshot.payerRef}`,
        amountMinor,
        currency: task.settlement.currency,
        side: "credit",
        idempotencyKey: ref,
      }
    );
    task.pendingRefunds.delete(idempotencyKey);
  }

  private requireTask(taskId: string) {
    const task = this.store.tasks.get(taskId);
    if (!task) throw new Error("Commercial payment task not found");
    return task;
  }
  private adapter(rail: PaymentRail, providerId?: string) {
    const adapter = this.adapters.find(
      a =>
        a.supportedRails.includes(rail) &&
        (!providerId || a.providerId === providerId)
    );
    if (!adapter)
      throw new Error(
        `No provider route for ${rail}${providerId ? ` via ${providerId}` : ""}`
      );
    return adapter;
  }
}

/** Test-only deterministic provider. It has no network, credentials, or live charging capability. */
export class DeterministicMockPaymentProvider implements PaymentProviderAdapter {
  readonly providerId = "deterministic-mock";
  readonly supportedRails: readonly PaymentRail[] = [
    "credits",
    "fiat_payg",
    "x402",
    "mpp",
  ];
  authorizationOutcome: PaymentAuthorization["outcome"] = "authorized";
  captureOutcome: "captured" | "unknown" = "captured";
  reconciledCaptureOutcome: "captured" | "declined" | "unknown" = "unknown";
  releaseOutcome: "released" | "unknown" = "released";
  reconciledReleaseOutcome: "released" | "declined" | "unknown" = "unknown";
  refundOutcome: "refunded" | "unknown" = "refunded";
  reconciledRefundOutcome: "refunded" | "declined" | "unknown" = "unknown";
  lookupOutcome: PaymentAuthorization["outcome"] = "authorized";
  captureCalls = 0;
  authorizeCalls = 0;
  async authorize(
    request: PaymentRequest,
    fencingToken: number
  ): Promise<PaymentAuthorization> {
    this.authorizeCalls++;
    return {
      authorizationId: `mock-auth:${request.taskId}`,
      requestId: request.requestId,
      providerRef: `mock:${request.taskId}`,
      rail: request.rail,
      amountMinor: request.maxAmountMinor,
      currency: request.snapshot.currency,
      outcome: this.authorizationOutcome,
      fencingToken,
      idempotencyKey: `authorize:${request.idempotencyKey}`,
      expiresAt: request.snapshot.expiresAt,
    };
  }
  async lookup(auth: PaymentAuthorization) {
    return { ...auth, outcome: this.lookupOutcome };
  }
  async capture(
    auth: PaymentAuthorization,
    receipts: readonly UsageReceipt[],
    _idempotencyKey: string
  ) {
    this.captureCalls++;
    return {
      outcome: this.captureOutcome,
      capturedMinor:
        this.captureOutcome === "captured"
          ? receipts.reduce((n, r) => n + r.amountMinor, 0)
          : 0,
      providerRef: auth.providerRef,
    };
  }
  async reconcileCapture(
    auth: PaymentAuthorization,
    receipts: readonly UsageReceipt[],
    _idempotencyKey: string
  ) {
    return {
      outcome: this.reconciledCaptureOutcome,
      capturedMinor:
        this.reconciledCaptureOutcome === "captured"
          ? receipts.reduce((n, r) => n + r.amountMinor, 0)
          : 0,
      providerRef: auth.providerRef,
    };
  }
  async release(_auth: PaymentAuthorization, _idempotencyKey: string) {
    return { outcome: this.releaseOutcome };
  }
  async reconcileRelease(_auth: PaymentAuthorization, _idempotencyKey: string) {
    return { outcome: this.reconciledReleaseOutcome };
  }
  async refund(
    _settlement: Settlement,
    amountMinor: number,
    _idempotencyKey: string
  ) {
    return { outcome: this.refundOutcome, amountMinor };
  }
  async reconcileRefund(
    _settlement: Settlement,
    amountMinor: number,
    _idempotencyKey: string
  ) {
    return { outcome: this.reconciledRefundOutcome, amountMinor };
  }
}

export function assertLedgerBalanced(postings: readonly LedgerPosting[]): void {
  const groups = new Map<string, { debit: number; credit: number }>();
  for (const posting of postings) {
    const group = groups.get(posting.idempotencyKey) ?? { debit: 0, credit: 0 };
    group[posting.side] += posting.amountMinor;
    groups.set(posting.idempotencyKey, group);
  }
  for (const [key, group] of groups)
    if (group.debit !== group.credit)
      throw new Error(`Unbalanced ledger posting ${key}`);
}
