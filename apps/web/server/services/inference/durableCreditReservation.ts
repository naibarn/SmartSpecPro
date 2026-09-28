import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  creditTransactions,
  llmInferenceAttempts,
  llmInferenceCreditReservations,
  llmInferenceCreditSettlements,
  llmInferencePlans,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import {
  createCreditReservation,
  refundCredits,
  refundReservation,
  type CreditReservation,
} from "../creditService";
import {
  inferenceCostMicrosToCreditUnits,
  type InferenceReservationAuthority,
} from "./creditReservationAuthority";

const RESERVATION_TTL_MS = 10 * 60 * 1000;

export type DurableInferenceReservationResult =
  | { ok: true; reservationId: string; authority: InferenceReservationAuthority }
  | {
      ok: false;
      reason:
        | "INVALID_RESERVATION_INPUT"
        | "RESERVATION_CONFLICT"
        | "RESERVATION_EXPIRED"
        | "RESERVATION_OWNER_UNAVAILABLE";
    };

function validReservationSnapshot(input: {
  reservation: CreditReservation;
  userId: number;
  tenantId: string;
  principalRef: string;
  amount: number;
  idempotencyKey: string;
}): boolean {
  const { reservation } = input;
  return (
    reservation.userId === input.userId &&
    reservation.tenantId === input.tenantId &&
    reservation.sourceType === "chat" &&
    reservation.reservedAmount === input.amount &&
    reservation.drawnAmount === 0 &&
    reservation.idempotencyKey === input.idempotencyKey &&
    Boolean(reservation.reservationId.trim()) &&
    Number.isSafeInteger(reservation.transactionId) &&
    reservation.transactionId > 0 &&
    reservation.expiresAt.trim().length > 0 &&
    input.principalRef.trim().length > 0
  );
}

function reservationIdFor(idempotencyKey: string): string {
  return `reservation-${createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

async function recoverUndurableReservation(input: {
  userId: number;
  tenantId: string;
  principalRef: string;
  amount: number;
  idempotencyKey: string;
}): Promise<CreditReservation | null> {
  const [transaction] = await getDb()
    .select({
      id: creditTransactions.id,
      userId: creditTransactions.userId,
      amount: creditTransactions.amount,
      type: creditTransactions.type,
      sourceType: creditTransactions.sourceType,
      tenantId: creditTransactions.tenantId,
      idempotencyKey: creditTransactions.idempotencyKey,
      metadata: creditTransactions.metadata,
      createdAt: creditTransactions.createdAt,
    })
    .from(creditTransactions)
    .where(eq(creditTransactions.idempotencyKey, input.idempotencyKey))
    .limit(1);
  const expectedReservationId = reservationIdFor(input.idempotencyKey);
  if (
    !transaction ||
    transaction.userId !== input.userId ||
    transaction.amount !== -input.amount ||
    transaction.type !== "usage" ||
    transaction.sourceType !== "chat" ||
    transaction.tenantId !== input.tenantId ||
    transaction.metadata?.reservationId !== expectedReservationId ||
    transaction.metadata?.spec231InferenceReservation !== true
  ) return null;
  const createdAt = transaction.createdAt;
  return {
    reservationId: expectedReservationId,
    userId: input.userId,
    reservedAmount: input.amount,
    drawnAmount: 0,
    transactionId: transaction.id,
    sourceType: "chat",
    idempotencyKey: input.idempotencyKey,
    tenantId: input.tenantId,
    createdAt: createdAt.toISOString(),
    // Conservative relative to the legacy service's post-debit expiry time.
    expiresAt: new Date(createdAt.getTime() + RESERVATION_TTL_MS).toISOString(),
  };
}

function asAuthority(input: {
  reservationId: string;
  tenantId: string;
  principalRef: string;
  reservedCredits: number;
  settledCredits: number;
  expiresAt: Date;
}, now: Date): InferenceReservationAuthority | null {
  const availableCredits = input.reservedCredits - input.settledCredits;
  const nowMs = now.getTime();
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isSafeInteger(availableCredits) ||
    availableCredits < 0 ||
    input.expiresAt.getTime() <= nowMs
  ) {
    return null;
  }
  const availableBudgetMicros = BigInt(availableCredits) * 1_000n;
  if (availableBudgetMicros > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return {
    reservationId: input.reservationId,
    tenantId: input.tenantId,
    principalRef: input.principalRef,
    availableBudgetMicros: Number(availableBudgetMicros),
    expiresAt: input.expiresAt.toISOString(),
    status: "reserved",
  };
}

async function persistReservation(input: {
  reservation: CreditReservation;
  userId: number;
  tenantId: string;
  principalRef: string;
  amount: number;
  idempotencyKey: string;
}): Promise<"created" | "existing" | "conflict"> {
  if (!validReservationSnapshot(input)) return "conflict";
  const db = getDb();
  const [transaction] = await db
    .select({
      id: creditTransactions.id,
      userId: creditTransactions.userId,
      amount: creditTransactions.amount,
      type: creditTransactions.type,
      sourceType: creditTransactions.sourceType,
      tenantId: creditTransactions.tenantId,
      idempotencyKey: creditTransactions.idempotencyKey,
      metadata: creditTransactions.metadata,
    })
    .from(creditTransactions)
    .where(eq(creditTransactions.id, input.reservation.transactionId))
    .limit(1);
  if (
    !transaction ||
    transaction.userId !== input.userId ||
    transaction.amount !== -input.amount ||
    transaction.type !== "usage" ||
    transaction.sourceType !== "chat" ||
    transaction.tenantId !== input.tenantId ||
    transaction.idempotencyKey !== input.idempotencyKey ||
    transaction.metadata?.reservationId !== input.reservation.reservationId
  ) {
    return "conflict";
  }

  return db.transaction(async tx => {
    const [inserted] = await tx
      .insert(llmInferenceCreditReservations)
      .values({
        reservationId: input.reservation.reservationId,
        sourceTransactionId: input.reservation.transactionId,
        idempotencyKey: input.idempotencyKey,
        userId: input.userId,
        tenantId: input.tenantId,
        principalRef: input.principalRef,
        reservedCredits: input.amount,
        settledCredits: 0,
        status: "reserved",
        expiresAt: new Date(input.reservation.expiresAt),
      })
      .onConflictDoNothing()
      .returning({ reservationId: llmInferenceCreditReservations.reservationId });
    const [stored] = await tx
      .select({
        reservationId: llmInferenceCreditReservations.reservationId,
        sourceTransactionId: llmInferenceCreditReservations.sourceTransactionId,
        idempotencyKey: llmInferenceCreditReservations.idempotencyKey,
        userId: llmInferenceCreditReservations.userId,
        tenantId: llmInferenceCreditReservations.tenantId,
        principalRef: llmInferenceCreditReservations.principalRef,
        reservedCredits: llmInferenceCreditReservations.reservedCredits,
      })
      .from(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (
      !stored ||
      stored.reservationId !== input.reservation.reservationId ||
      stored.sourceTransactionId !== input.reservation.transactionId ||
      stored.userId !== input.userId ||
      stored.tenantId !== input.tenantId ||
      stored.principalRef !== input.principalRef ||
      stored.reservedCredits !== input.amount
    ) {
      return "conflict";
    }
    return inserted ? "created" : "existing";
  });
}

/**
 * Creates the financial debit through creditService, then durably mirrors its
 * immutable owner identity before any Spec 231 plan/provider dispatch may use it.
 */
export async function createDurableInferenceCreditReservation(input: {
  userId: number;
  tenantId: string;
  principalRef: string;
  amount: number;
  idempotencyKey: string;
  now?: Date;
}, dependencies: {
  create?: typeof createCreditReservation;
  refundUnpersisted?: typeof refundReservation;
} = {}): Promise<DurableInferenceReservationResult> {
  const now = input.now ?? new Date();
  if (
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0 ||
    !input.tenantId.trim() ||
    input.tenantId.length > 36 ||
    !input.principalRef.trim() ||
    input.principalRef.length > 256 ||
    !Number.isSafeInteger(input.amount) ||
    input.amount <= 0 ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.length > 256
  ) {
    return { ok: false, reason: "INVALID_RESERVATION_INPUT" };
  }

  const [existing] = await getDb()
    .select({
      reservationId: llmInferenceCreditReservations.reservationId,
      tenantId: llmInferenceCreditReservations.tenantId,
      principalRef: llmInferenceCreditReservations.principalRef,
      userId: llmInferenceCreditReservations.userId,
      reservedCredits: llmInferenceCreditReservations.reservedCredits,
      settledCredits: llmInferenceCreditReservations.settledCredits,
      status: llmInferenceCreditReservations.status,
      expiresAt: llmInferenceCreditReservations.expiresAt,
    })
    .from(llmInferenceCreditReservations)
    .where(eq(llmInferenceCreditReservations.idempotencyKey, input.idempotencyKey))
    .limit(1);
  if (existing) {
    if (
      existing.userId !== input.userId ||
      existing.tenantId !== input.tenantId ||
      existing.principalRef !== input.principalRef ||
      existing.reservedCredits !== input.amount ||
      existing.status !== "reserved"
    ) {
      return { ok: false, reason: "RESERVATION_CONFLICT" };
    }
    const authority = asAuthority(existing, now);
    return authority
      ? { ok: true, reservationId: existing.reservationId, authority }
      : { ok: false, reason: "RESERVATION_EXPIRED" };
  }

  let reservation: CreditReservation;
  try {
    reservation = await (dependencies.create ?? createCreditReservation)(
      input.userId,
      input.amount,
      "chat",
      { spec231InferenceReservation: true },
      input.idempotencyKey,
      { tenantId: input.tenantId, description: "Spec 231 inference budget reservation" },
      { allowWithoutRedis: true }
    );
  } catch {
    const recovered = await recoverUndurableReservation(input).catch(() => null);
    if (!recovered) {
      return { ok: false, reason: "RESERVATION_OWNER_UNAVAILABLE" };
    }
    reservation = recovered;
  }

  let persisted: "created" | "existing" | "conflict";
  try {
    persisted = await persistReservation({ ...input, reservation });
  } catch {
    const [durableRow] = await getDb()
      .select({ reservationId: llmInferenceCreditReservations.reservationId })
      .from(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.idempotencyKey, input.idempotencyKey))
      .limit(1);
    if (!durableRow) {
      await (dependencies.refundUnpersisted ?? refundReservation)(
        reservation.reservationId,
        false,
        reservation
      ).catch(() => undefined);
    }
    return { ok: false, reason: "RESERVATION_OWNER_UNAVAILABLE" };
  }
  if (persisted === "conflict") {
    // No provider dispatch occurs until the durable row exists. A failed mirror
    // can therefore refund the untouched legacy reservation snapshot safely.
    try {
      await (dependencies.refundUnpersisted ?? refundReservation)(
        reservation.reservationId,
        false,
        reservation
      );
    } catch {
      // Keep the debit discoverable by its idempotency transaction for repair.
    }
    return { ok: false, reason: "RESERVATION_OWNER_UNAVAILABLE" };
  }

  const authority = await loadDurableInferenceReservationAuthority({
    reservationId: reservation.reservationId,
    tenantId: input.tenantId,
    principalRef: input.principalRef,
    userId: input.userId,
    now,
  });
  if (authority) return { ok: true, reservationId: reservation.reservationId, authority };
  if (persisted === "created") {
    // Only this call created the expired row. No Spec 231 plan or provider call
    // can exist yet, so releasing the entire untouched debit is safe.
    await closeDurableInferenceCreditReservation({ reservationId: reservation.reservationId });
  }
  return { ok: false, reason: "RESERVATION_EXPIRED" };
}

/** Loader used on every pre-submit check; Redis availability is irrelevant. */
export async function loadDurableInferenceReservationAuthority(input: {
  reservationId: string;
  tenantId: string;
  principalRef: string;
  userId: number;
  now?: Date;
}): Promise<InferenceReservationAuthority | null> {
  if (
    !input.reservationId.trim() ||
    !input.tenantId.trim() ||
    !input.principalRef.trim() ||
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0
  ) return null;
  const [row] = await getDb()
    .select({
      reservationId: llmInferenceCreditReservations.reservationId,
      tenantId: llmInferenceCreditReservations.tenantId,
      principalRef: llmInferenceCreditReservations.principalRef,
      userId: llmInferenceCreditReservations.userId,
      reservedCredits: llmInferenceCreditReservations.reservedCredits,
      settledCredits: llmInferenceCreditReservations.settledCredits,
      status: llmInferenceCreditReservations.status,
      expiresAt: llmInferenceCreditReservations.expiresAt,
    })
    .from(llmInferenceCreditReservations)
    .where(and(
      eq(llmInferenceCreditReservations.reservationId, input.reservationId),
      eq(llmInferenceCreditReservations.tenantId, input.tenantId),
      eq(llmInferenceCreditReservations.principalRef, input.principalRef),
      eq(llmInferenceCreditReservations.userId, input.userId),
      eq(llmInferenceCreditReservations.status, "reserved")
    ))
    .limit(1);
  return row ? asAuthority(row, input.now ?? new Date()) : null;
}

/** Atomic, idempotent attempt settlement that remains available after Redis TTL expiry. */
export async function settleDurableInferenceCreditReservation(input: {
  reservationId: string;
  settlementKey: string;
  chargedCostMicros: number;
}): Promise<boolean> {
  const chargedCredits = inferenceCostMicrosToCreditUnits(input.chargedCostMicros);
  if (
    !input.reservationId.trim() ||
    !input.settlementKey.trim() ||
    input.settlementKey.length > 256 ||
    chargedCredits === null
  ) return false;
  try {
    return await getDb().transaction(async tx => {
      const [reservation] = await tx
        .select({
          reservedCredits: llmInferenceCreditReservations.reservedCredits,
          settledCredits: llmInferenceCreditReservations.settledCredits,
          status: llmInferenceCreditReservations.status,
        })
        .from(llmInferenceCreditReservations)
        .where(eq(llmInferenceCreditReservations.reservationId, input.reservationId))
        .for("update")
        .limit(1);
      if (!reservation) return false;
      const [prior] = await tx
        .select({
          chargedCostMicros: llmInferenceCreditSettlements.chargedCostMicros,
          chargedCredits: llmInferenceCreditSettlements.chargedCredits,
        })
        .from(llmInferenceCreditSettlements)
        .where(and(
          eq(llmInferenceCreditSettlements.reservationId, input.reservationId),
          eq(llmInferenceCreditSettlements.settlementKey, input.settlementKey)
        ))
        .limit(1);
      if (prior) {
        return prior.chargedCostMicros === input.chargedCostMicros &&
          prior.chargedCredits === chargedCredits;
      }
      if (
        reservation.status !== "reserved" ||
        reservation.settledCredits + chargedCredits > reservation.reservedCredits
      ) return false;
      await tx.insert(llmInferenceCreditSettlements).values({
        reservationId: input.reservationId,
        settlementKey: input.settlementKey,
        chargedCostMicros: input.chargedCostMicros,
        chargedCredits,
      });
      await tx
        .update(llmInferenceCreditReservations)
        .set({
          settledCredits: reservation.settledCredits + chargedCredits,
          updatedAt: new Date(),
        })
        .where(eq(llmInferenceCreditReservations.reservationId, input.reservationId));
      return true;
    });
  } catch {
    return false;
  }
}

/** Refunds only unused held credits; retries use the original ledger debit as idempotency owner. */
export async function closeDurableInferenceCreditReservation(input: {
  reservationId: string;
}, dependencies: { refund?: typeof refundCredits } = {}): Promise<boolean> {
  if (!input.reservationId.trim()) return false;
  const closing = await getDb().transaction(async tx => {
    const [row] = await tx
      .select({
        reservationId: llmInferenceCreditReservations.reservationId,
        sourceTransactionId: llmInferenceCreditReservations.sourceTransactionId,
        idempotencyKey: llmInferenceCreditReservations.idempotencyKey,
        userId: llmInferenceCreditReservations.userId,
        tenantId: llmInferenceCreditReservations.tenantId,
        reservedCredits: llmInferenceCreditReservations.reservedCredits,
        settledCredits: llmInferenceCreditReservations.settledCredits,
        status: llmInferenceCreditReservations.status,
      })
      .from(llmInferenceCreditReservations)
      .where(eq(llmInferenceCreditReservations.reservationId, input.reservationId))
      .for("update")
      .limit(1);
    if (!row) return null;
    if (row.status === "closed") return { row, closed: true };
    const attempts = await tx
      .select({
        attemptId: llmInferenceAttempts.attemptId,
        status: llmInferenceAttempts.status,
        outcome: llmInferenceAttempts.outcome,
        submissionState: llmInferenceAttempts.submissionState,
      })
      .from(llmInferenceAttempts)
      .innerJoin(
        llmInferencePlans,
        eq(llmInferenceAttempts.planId, llmInferencePlans.planId)
      )
      .where(eq(llmInferencePlans.creditReservationId, input.reservationId));
    for (const attempt of attempts) {
      if (attempt.status !== "terminal") return null;
      const needsSettlement =
        attempt.outcome === "completed" ||
        attempt.submissionState !== "not_submitted";
      if (!needsSettlement) continue;
      const [settled] = await tx
        .select({ settlementKey: llmInferenceCreditSettlements.settlementKey })
        .from(llmInferenceCreditSettlements)
        .where(and(
          eq(llmInferenceCreditSettlements.reservationId, input.reservationId),
          eq(llmInferenceCreditSettlements.settlementKey, attempt.attemptId)
        ))
        .limit(1);
      if (!settled) return null;
    }
    if (row.status === "reserved") {
      await tx
        .update(llmInferenceCreditReservations)
        .set({ status: "closing", updatedAt: new Date() })
        .where(eq(llmInferenceCreditReservations.reservationId, input.reservationId));
    }
    return { row, closed: false };
  });
  if (!closing) return false;
  if (closing.closed) return true;
  const refundAmount = closing.row.reservedCredits - closing.row.settledCredits;
  try {
    if (refundAmount > 0) {
      await (dependencies.refund ?? refundCredits)({
        userId: closing.row.userId,
        amount: refundAmount,
        description: "Spec 231 unused inference reservation refund",
        originalTransactionId: closing.row.sourceTransactionId,
        idempotencyKey: `reservation:${closing.row.reservationId}:refund`,
        tenantId: closing.row.tenantId,
        sourceType: "chat",
        metadata: {
          reservationId: closing.row.reservationId,
          reservationIdempotencyKey: closing.row.idempotencyKey,
        },
      });
    }
    await getDb()
      .update(llmInferenceCreditReservations)
      .set({ status: "closed", updatedAt: new Date() })
      .where(and(
        eq(llmInferenceCreditReservations.reservationId, input.reservationId),
        eq(llmInferenceCreditReservations.status, "closing")
      ));
    return true;
  } catch {
    return false;
  }
}
