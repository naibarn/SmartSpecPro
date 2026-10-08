import { and, eq, sql } from "drizzle-orm";
import {
  economicBudgets,
  economicHolds,
  economicIntents,
  economicEvents,
  economicReconciliations,
  type EconomicHoldRow,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import type { EconomicIntent } from "./economicControlPlaneTypes";
import type { EconomicHoldStatus } from "./economicControlPlane";
import {
  recordJournalEntry,
  assertBalancedJournalLines,
  type EconomicJournalLineInput,
} from "./economicLedgerService";
import { settleEconomicReceipt } from "./economicSettlementService";

export class EconomicDurableError extends Error {
  readonly code:
    | "HOLD_IDEMPOTENCY_CONFLICT"
    | "BUDGET_NOT_FOUND"
    | "BUDGET_EXCEEDED"
    | "BUDGET_CURRENCY_MISMATCH"
    | "BUDGET_NOT_ACTIVE"
    | "INTENT_CORRELATION_INVALID"
    | "HOLD_NOT_FOUND"
    | "HOLD_RELEASE_NOT_ALLOWED"
    | "RELEASE_AMOUNT_INVALID"
    | "CAPTURE_NOT_ALLOWED"
    | "CAPTURE_IDEMPOTENCY_CONFLICT"
    | "CAPTURE_RECEIPT_REQUIRED"
    | "CAPTURE_AMOUNT_INVALID"
    | "RELEASE_IDEMPOTENCY_CONFLICT";

  constructor(code: EconomicDurableError["code"], message = code) {
    super(message);
    this.name = "EconomicDurableError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type DurableReserveInput = {
  intent: EconomicIntent;
  budgetId: string;
  idempotencyKey: string;
  journalLines: EconomicJournalLineInput[];
  journalDescription: string;
};

export type DurableReleaseInput = {
  tenantId: string;
  holdId: string;
  idempotencyKey: string;
  actorId: string;
  policyVersion: string;
  journalLines: EconomicJournalLineInput[];
  journalDescription: string;
};

export type DurableCaptureInput = {
  tenantId: string;
  holdId: string;
  amountMinorUnits: number;
  idempotencyKey: string;
  receiptVerified: boolean;
  externalStatus: "succeeded" | "unknown" | "failed";
  actorId: string;
  policyVersion: string;
  journalLines?: EconomicJournalLineInput[];
  journalDescription?: string;
};

export function releaseEconomicHoldState(row: {
  id: string;
  tenantId: string;
  intentId: string;
  budgetId: string;
  workerJobId: string;
  attemptId: string;
  currency: string;
  amountMinorUnits: number;
  capturedMinorUnits: number;
  releasedMinorUnits: number;
  status: EconomicHoldStatus;
}) {
  if (row.status === "released") return { ...row, replayed: true };
  if (row.status !== "held" && row.status !== "partially_captured") {
    throw new EconomicDurableError("HOLD_RELEASE_NOT_ALLOWED");
  }
  const remaining =
    row.amountMinorUnits - row.capturedMinorUnits - row.releasedMinorUnits;
  if (remaining < 0) throw new EconomicDurableError("HOLD_RELEASE_NOT_ALLOWED");
  return {
    ...row,
    releasedMinorUnits: row.releasedMinorUnits + remaining,
    status: "released" as const,
    replayed: false,
  };
}

function toHoldState(row: EconomicHoldRow, replayed: boolean) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    intentId: row.intentId,
    currency: row.currency,
    amountMinorUnits: row.amountMinorUnits,
    capturedMinorUnits: row.capturedMinorUnits,
    releasedMinorUnits: row.releasedMinorUnits,
    status: row.status as EconomicHoldStatus,
    replayed,
  };
}

function assertExistingHoldMatches(
  row: EconomicHoldRow,
  input: DurableReserveInput,
): void {
  if (
    row.intentId !== input.intent.intentId ||
    row.budgetId !== input.budgetId ||
    row.amountMinorUnits !== input.intent.amount.minorUnits ||
    row.currency !== input.intent.amount.currency.trim().toUpperCase()
  ) {
    throw new EconomicDurableError("HOLD_IDEMPOTENCY_CONFLICT");
  }
}

/**
 * Durable reserve port. The caller must provide an existing Drizzle
 * transaction; the intent, hold, budget movement, and journal are therefore
 * committed or rolled back together. This is deliberately separate from the
 * in-memory transition helpers used by compatibility tests.
 */
export async function reserveEconomicHoldInTransaction(
  query: any,
  input: DurableReserveInput,
) {
  const { intent } = input;
  const currency = intent.amount.currency.trim().toUpperCase();
  if (
    !intent.tenantId ||
    !intent.intentId ||
    !intent.jobId ||
    !intent.attemptId ||
    !input.budgetId ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128 ||
    !Number.isSafeInteger(intent.amount.minorUnits) ||
    intent.amount.minorUnits < 0 ||
    !/^[A-Z]{3}$/.test(currency)
  ) {
    throw new EconomicDurableError("INTENT_CORRELATION_INVALID");
  }

  const [existing] = await query
    .select()
    .from(economicHolds)
    .where(
      and(
        eq(economicHolds.tenantId, intent.tenantId),
        eq(economicHolds.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) {
    assertExistingHoldMatches(existing, input);
    return toHoldState(existing, true);
  }

  const [budget] = await query
    .select()
    .from(economicBudgets)
    .where(
      and(
        eq(economicBudgets.id, input.budgetId),
        eq(economicBudgets.tenantId, intent.tenantId),
      ),
    )
    .for("update")
    .limit(1);
  if (!budget) throw new EconomicDurableError("BUDGET_NOT_FOUND");
  if (budget.status !== "active")
    throw new EconomicDurableError("BUDGET_NOT_ACTIVE");
  if (budget.currency !== currency)
    throw new EconomicDurableError("BUDGET_CURRENCY_MISMATCH");
  const available =
    budget.limitMinorUnits - budget.heldMinorUnits - budget.capturedMinorUnits;
  if (intent.amount.minorUnits > available)
    throw new EconomicDurableError("BUDGET_EXCEEDED");

  const intentValues: typeof economicIntents.$inferInsert = {
    id: intent.intentId,
    tenantId: intent.tenantId,
    actorId: intent.actorId,
    actorType: intent.actorType,
    workerJobId: intent.jobId,
    attemptId: intent.attemptId,
    idempotencyKey: intent.idempotencyKey,
    effectType: intent.effectType,
    resourceRef: intent.resourceRef,
    amountMinorUnits: intent.amount.minorUnits,
    currency,
    policyVersion: intent.policyVersion,
    status: "admitted",
  };
  await query.insert(economicIntents).values(intentValues);

  const [hold] = await query
    .insert(economicHolds)
    .values({
      tenantId: intent.tenantId,
      intentId: intent.intentId,
      budgetId: input.budgetId,
      workerJobId: intent.jobId,
      attemptId: intent.attemptId,
      currency,
      amountMinorUnits: intent.amount.minorUnits,
      capturedMinorUnits: 0,
      releasedMinorUnits: 0,
      status: "held",
      idempotencyKey: input.idempotencyKey,
    })
    .returning();
  if (!hold) throw new EconomicDurableError("HOLD_IDEMPOTENCY_CONFLICT");

  await query
    .update(economicBudgets)
    .set({
      heldMinorUnits: sql`${economicBudgets.heldMinorUnits} + ${intent.amount.minorUnits}`,
      version: sql`${economicBudgets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(economicBudgets.id, input.budgetId),
        eq(economicBudgets.tenantId, intent.tenantId),
      ),
    );

  await recordJournalEntry(query, {
    tenantId: intent.tenantId,
    idempotencyKey: `reserve:${input.idempotencyKey}`,
    correlation: { jobId: intent.jobId, attemptId: intent.attemptId },
    description: input.journalDescription,
    lines: input.journalLines,
  });
  await query.insert(economicEvents).values({
    tenantId: intent.tenantId,
    eventType: "hold_reserved",
    idempotencyKey: `reserve:${input.idempotencyKey}`,
    workerJobId: intent.jobId,
    attemptId: intent.attemptId,
    actorId: String(intent.actorId),
    policyVersion: intent.policyVersion,
    payloadJson: { holdId: hold.id, budgetId: input.budgetId, amountMinorUnits: intent.amount.minorUnits, currency },
  });
  return toHoldState(hold, false);
}

export async function reserveEconomicHold(
  database: DrizzleDB,
  input: DurableReserveInput,
) {
  return database.transaction(tx =>
    reserveEconomicHoldInTransaction(tx, input),
  );
}

export async function releaseEconomicHoldInTransaction(
  query: any,
  input: DurableReleaseInput
) {
  if (!input.tenantId || !input.holdId || !input.actorId || !input.policyVersion || input.idempotencyKey.length < 8) {
    throw new EconomicDurableError("INTENT_CORRELATION_INVALID");
  }
  const [hold] = await query
    .select()
    .from(economicHolds)
    .where(
      and(eq(economicHolds.id, input.holdId), eq(economicHolds.tenantId, input.tenantId))
    )
    .for("update")
    .limit(1);
  if (!hold) throw new EconomicDurableError("HOLD_NOT_FOUND");
  const eventKey = `release:${input.idempotencyKey}`;
  const [priorEvent] = await query.select().from(economicEvents)
    .where(and(eq(economicEvents.tenantId, input.tenantId), eq(economicEvents.idempotencyKey, eventKey)))
    .limit(1);
  if (priorEvent) {
    const payload = priorEvent.payloadJson as Record<string, unknown>;
    if (payload.holdId !== hold.id) throw new EconomicDurableError("RELEASE_IDEMPOTENCY_CONFLICT");
    return toHoldState(hold, true);
  }
  if (hold.status === "released") throw new EconomicDurableError("RELEASE_IDEMPOTENCY_CONFLICT");
  const released = releaseEconomicHoldState(hold);
  if (released.replayed) return toHoldState(hold, true);

  const [budget] = await query
    .select()
    .from(economicBudgets)
    .where(
      and(
        eq(economicBudgets.id, hold.budgetId),
        eq(economicBudgets.tenantId, input.tenantId)
      )
    )
    .for("update")
    .limit(1);
  if (!budget) throw new EconomicDurableError("BUDGET_NOT_FOUND");
  const remaining = hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
  const releaseJournal = assertBalancedJournalLines(input.journalLines);
  if (
    releaseJournal.currency !== hold.currency ||
    releaseJournal.totalMinorUnits !== remaining ||
    input.journalLines.some(line => line.tenantId !== input.tenantId)
  ) throw new EconomicDurableError("RELEASE_AMOUNT_INVALID");
  await query
    .update(economicHolds)
    .set({
      releasedMinorUnits: released.releasedMinorUnits,
      status: "released",
      updatedAt: new Date(),
    })
    .where(and(eq(economicHolds.id, hold.id), eq(economicHolds.tenantId, input.tenantId)));
  await query
    .update(economicBudgets)
    .set({
      heldMinorUnits: sql`${economicBudgets.heldMinorUnits} - ${remaining}`,
      version: sql`${economicBudgets.version} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(economicBudgets.id, budget.id), eq(economicBudgets.tenantId, input.tenantId)));
  await recordJournalEntry(query, {
    tenantId: input.tenantId,
    idempotencyKey: eventKey,
    correlation: { jobId: hold.workerJobId, attemptId: hold.attemptId },
    description: input.journalDescription,
    lines: input.journalLines,
  });
  await query.insert(economicEvents).values({
    tenantId: input.tenantId,
    eventType: "hold_released",
    idempotencyKey: eventKey,
    workerJobId: hold.workerJobId,
    attemptId: hold.attemptId,
    actorId: input.actorId,
    policyVersion: input.policyVersion,
    payloadJson: { holdId: hold.id, releasedMinorUnits: remaining, budgetId: hold.budgetId, currency: hold.currency },
  });
  return toHoldState(released, false);
}

export async function releaseEconomicHold(
  database: DrizzleDB,
  input: DurableReleaseInput
) {
  return database.transaction(tx => releaseEconomicHoldInTransaction(tx, input));
}

/**
 * Atomically applies a verified receipt to a durable hold. Unknown or failed
 * external outcomes are persisted for operator reconciliation and retain the
 * held amount; they are never blindly retried as a new charge.
 */
export async function captureEconomicHoldInTransaction(
  query: any,
  input: DurableCaptureInput,
) {
  if (
    !input.tenantId || !input.holdId || !input.actorId ||
    !input.policyVersion || input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 128 ||
    !Number.isSafeInteger(input.amountMinorUnits) || input.amountMinorUnits <= 0
  ) {
    throw new EconomicDurableError("CAPTURE_AMOUNT_INVALID");
  }

  const eventKey = `settle:${input.idempotencyKey}`;
  const [hold] = await query
    .select()
    .from(economicHolds)
    .where(and(eq(economicHolds.id, input.holdId), eq(economicHolds.tenantId, input.tenantId)))
    .for("update")
    .limit(1);
  if (!hold) throw new EconomicDurableError("HOLD_NOT_FOUND");

  const [prior] = await query
    .select()
    .from(economicEvents)
    .where(and(eq(economicEvents.tenantId, input.tenantId), eq(economicEvents.idempotencyKey, eventKey)))
    .limit(1);
  if (prior) {
    const payload = prior.payloadJson as Record<string, unknown>;
    if (
      payload.holdId !== input.holdId ||
      payload.amountMinorUnits !== input.amountMinorUnits ||
      payload.externalStatus !== input.externalStatus ||
      payload.receiptVerified !== input.receiptVerified
    ) throw new EconomicDurableError("CAPTURE_IDEMPOTENCY_CONFLICT");
    return { hold: toHoldState(hold, true), replayed: true, reconciliationRequired: hold.status === "reconciliation_required" };
  }

  if (hold.status === "captured" || hold.status === "released" || hold.status === "reconciliation_required") {
    throw new EconomicDurableError("CAPTURE_NOT_ALLOWED");
  }
  const remaining = hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
  if (input.amountMinorUnits > remaining) throw new EconomicDurableError("CAPTURE_AMOUNT_INVALID");
  if (input.externalStatus === "succeeded" && !input.receiptVerified) {
    throw new EconomicDurableError("CAPTURE_RECEIPT_REQUIRED");
  }

  const settlement = settleEconomicReceipt({
    id: hold.id,
    tenantId: hold.tenantId,
    holdId: hold.id,
    idempotencyKey: input.idempotencyKey,
    status: "pending",
    capturedMinorUnits: input.amountMinorUnits,
    currency: hold.currency,
  }, { receiptVerified: input.receiptVerified, externalStatus: input.externalStatus });

  if (settlement.status !== "settled") {
    await query.update(economicHolds).set({ status: "reconciliation_required", updatedAt: new Date() })
      .where(and(eq(economicHolds.id, hold.id), eq(economicHolds.tenantId, input.tenantId)));
    await query.insert(economicEvents).values({
      tenantId: input.tenantId,
      eventType: "receipt_outcome_unknown",
      idempotencyKey: eventKey,
      workerJobId: hold.workerJobId,
      attemptId: hold.attemptId,
      actorId: input.actorId,
      policyVersion: input.policyVersion,
      payloadJson: { holdId: hold.id, amountMinorUnits: input.amountMinorUnits, externalStatus: input.externalStatus, receiptVerified: input.receiptVerified, reasonCode: settlement.reasonCode },
    });
    await query.insert(economicReconciliations).values({
      tenantId: input.tenantId,
      workerJobId: hold.workerJobId,
      attemptId: hold.attemptId,
      holdId: hold.id,
      status: "pending",
      reasonCode: settlement.reasonCode ?? "EXTERNAL_OUTCOME_UNRESOLVED",
      detailsJson: { eventIdempotencyKey: eventKey, amountMinorUnits: input.amountMinorUnits },
    });
    const [updated] = await query.select().from(economicHolds)
      .where(and(eq(economicHolds.id, hold.id), eq(economicHolds.tenantId, input.tenantId))).limit(1);
    return { hold: toHoldState(updated, false), replayed: false, reconciliationRequired: true };
  }

  const summary = assertBalancedJournalLines(input.journalLines ?? []);
  if (summary.currency !== hold.currency || summary.totalMinorUnits !== input.amountMinorUnits) {
    throw new EconomicDurableError("CAPTURE_AMOUNT_INVALID");
  }
  const [budget] = await query.select().from(economicBudgets)
    .where(and(eq(economicBudgets.id, hold.budgetId), eq(economicBudgets.tenantId, input.tenantId)))
    .for("update").limit(1);
  if (!budget) throw new EconomicDurableError("BUDGET_NOT_FOUND");
  if (budget.heldMinorUnits < input.amountMinorUnits) throw new EconomicDurableError("CAPTURE_NOT_ALLOWED");

  const captured = hold.capturedMinorUnits + input.amountMinorUnits;
  const status = captured + hold.releasedMinorUnits === hold.amountMinorUnits ? "captured" : "partially_captured";
  await recordJournalEntry(query, {
    tenantId: input.tenantId,
    idempotencyKey: eventKey,
    correlation: { jobId: hold.workerJobId, attemptId: hold.attemptId },
    description: input.journalDescription ?? "Verified economic receipt settlement",
    lines: input.journalLines ?? [],
  });
  await query.update(economicHolds).set({ capturedMinorUnits: captured, status, updatedAt: new Date() })
    .where(and(eq(economicHolds.id, hold.id), eq(economicHolds.tenantId, input.tenantId)));
  await query.update(economicBudgets).set({
    heldMinorUnits: sql`${economicBudgets.heldMinorUnits} - ${input.amountMinorUnits}`,
    capturedMinorUnits: sql`${economicBudgets.capturedMinorUnits} + ${input.amountMinorUnits}`,
    version: sql`${economicBudgets.version} + 1`,
    updatedAt: new Date(),
  }).where(and(eq(economicBudgets.id, budget.id), eq(economicBudgets.tenantId, input.tenantId)));
  await query.insert(economicEvents).values({
    tenantId: input.tenantId,
    eventType: "receipt_settled",
    idempotencyKey: eventKey,
    workerJobId: hold.workerJobId,
    attemptId: hold.attemptId,
    actorId: input.actorId,
    policyVersion: input.policyVersion,
    payloadJson: { holdId: hold.id, amountMinorUnits: input.amountMinorUnits, externalStatus: input.externalStatus, receiptVerified: true },
  });
  const [updated] = await query.select().from(economicHolds)
    .where(and(eq(economicHolds.id, hold.id), eq(economicHolds.tenantId, input.tenantId))).limit(1);
  return { hold: toHoldState(updated, false), replayed: false, reconciliationRequired: false };
}

export async function captureEconomicHold(database: DrizzleDB, input: DurableCaptureInput) {
  return database.transaction(tx => captureEconomicHoldInTransaction(tx, input));
}
