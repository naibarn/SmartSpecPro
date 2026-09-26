import { and, eq, sql } from "drizzle-orm";
import {
  economicBudgets,
  economicHolds,
  economicIntents,
  type EconomicHoldRow,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import type { EconomicIntent } from "./economicControlPlaneTypes";
import type { EconomicHoldStatus } from "./economicControlPlane";
import {
  recordJournalEntry,
  type EconomicJournalLineInput,
} from "./economicLedgerService";

export class EconomicDurableError extends Error {
  readonly code:
    | "HOLD_IDEMPOTENCY_CONFLICT"
    | "BUDGET_NOT_FOUND"
    | "BUDGET_EXCEEDED"
    | "BUDGET_CURRENCY_MISMATCH"
    | "BUDGET_NOT_ACTIVE"
    | "INTENT_CORRELATION_INVALID"
    | "HOLD_NOT_FOUND"
    | "HOLD_RELEASE_NOT_ALLOWED";

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
  journalLines: EconomicJournalLineInput[];
  journalDescription: string;
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
  if (!input.tenantId || !input.holdId || input.idempotencyKey.length < 8) {
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
    idempotencyKey: `release:${input.idempotencyKey}`,
    correlation: { jobId: hold.workerJobId, attemptId: hold.attemptId },
    description: input.journalDescription,
    lines: input.journalLines,
  });
  return toHoldState(released, false);
}

export async function releaseEconomicHold(
  database: DrizzleDB,
  input: DurableReleaseInput
) {
  return database.transaction(tx => releaseEconomicHoldInTransaction(tx, input));
}
