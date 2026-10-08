import { createHash } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import {
  economicEvents,
  economicHolds,
  economicReconciliations,
  workerJobEvents,
  workerJobs,
} from "../../drizzle/schema";
import type { DrizzleDB } from "../db";
import type { EconomicJournalLineInput } from "./economicLedgerService";
import {
  captureEconomicHoldInTransaction,
  releaseEconomicHoldInTransaction,
} from "./economicDurableService";

const SETTLEMENT_ACTOR = "system:economic-receipt-settlement";
const COMPLETED_RECEIPT_EVENT = "RUNNER_EXECUTION_COMPLETED";
const DEFAULT_VERIFIER_TIMEOUT_MS = 15_000;
const MAX_VERIFIER_TIMEOUT_MS = 60_000;

export type VerifiedRunnerAccountingEvidence =
  | {
      kind: "provider_metered";
      policyVersion: string;
      providerUsageRef: string;
      usageDigest: string;
      pricingPolicyRef: string;
      verificationRef: string;
      amountMinorUnits: number;
      currency: string;
      captureJournalLines: EconomicJournalLineInput[];
      releaseJournalLines: EconomicJournalLineInput[];
    }
  | {
      kind: "approved_subscription";
      policyVersion: string;
      subscriptionRef: string;
      accountingPolicyRef: string;
      usageRef: string;
      verificationRef: string;
      releaseJournalLines: EconomicJournalLineInput[];
    }
  | {
      kind: "verified_zero_charge";
      policyVersion: string;
      zeroChargePolicyRef: string;
      verificationRef: string;
      releaseJournalLines: EconomicJournalLineInput[];
    }
  | {
      kind: "unverified" | "failed" | "unknown";
      reasonCode: string;
      evidenceRef?: string;
    };

export type PersistedRunnerReceipt = {
  tenantId: string;
  jobId: string;
  attemptId: string;
  eventId: string;
  eventType: string;
  eventIdempotencyKey: string | null;
  sequence: number | null;
  workerJobAttempt: number | null;
  leaseFencingVersion: number | null;
  payload: Record<string, unknown>;
};

export type RunnerEconomicReceiptVerifier = {
  /**
   * Implementations must verify usage provenance and the applicable accounting
   * policy. Runner output and token counts alone are not billing evidence.
   */
  verify(
    receipt: PersistedRunnerReceipt,
    options?: { signal: AbortSignal }
  ): Promise<VerifiedRunnerAccountingEvidence>;
};

export type SettleRunnerEconomicReceiptInput = {
  tenantId: string;
  jobId: string;
  attemptId: string;
  holdId: string;
  receiptEventId: string;
  verifierTimeoutMs?: number;
};

export type RunnerEconomicSettlementResult = {
  status: "settled" | "reconciliation_required";
  classification?: VerifiedRunnerAccountingEvidence["kind"];
  capturedMinorUnits: number;
  currency: string;
  receiptDigest: string;
  eventId?: string;
  reconciliationId?: string;
  replayed: boolean;
};

export class EconomicReceiptSettlementError extends Error {
  readonly code:
    | "SETTLEMENT_INPUT_INVALID"
    | "SETTLEMENT_HOLD_NOT_FOUND"
    | "SETTLEMENT_HOLD_BINDING_MISMATCH"
    | "SETTLEMENT_HOLD_STATE_INVALID"
    | "SETTLEMENT_RECEIPT_NOT_FOUND"
    | "SETTLEMENT_RECEIPT_BINDING_INVALID"
    | "SETTLEMENT_RECEIPT_CONFLICT"
    | "SETTLEMENT_EVIDENCE_INVALID"
    | "SETTLEMENT_DUPLICATE_RECEIPT";

  constructor(code: EconomicReceiptSettlementError["code"], message = code) {
    super(message);
    this.name = "EconomicReceiptSettlementError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function digestReceipt(receipt: PersistedRunnerReceipt): string {
  return createHash("sha256").update(stableJson(receipt), "utf8").digest("hex");
}

function isReference(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && value.length <= 255
  );
}

function validateJournalLines(
  lines: EconomicJournalLineInput[],
  input: { tenantId: string; currency: string; amountMinorUnits: number }
): void {
  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    if (
      line.tenantId !== input.tenantId ||
      line.currency.trim().toUpperCase() !==
        input.currency.trim().toUpperCase() ||
      !Number.isSafeInteger(line.debitMinorUnits) ||
      !Number.isSafeInteger(line.creditMinorUnits) ||
      line.debitMinorUnits < 0 ||
      line.creditMinorUnits < 0 ||
      line.debitMinorUnits > 0 === line.creditMinorUnits > 0
    )
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    debit += line.debitMinorUnits;
    credit += line.creditMinorUnits;
    if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) {
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    }
  }
  if (lines.length < 2 || debit !== credit || debit !== input.amountMinorUnits)
    throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
}

async function loadPersistedReceipt(
  query: any,
  input: SettleRunnerEconomicReceiptInput
): Promise<PersistedRunnerReceipt> {
  const [row] = await query
    .select({
      tenantId: workerJobs.tenantId,
      jobId: workerJobEvents.workerJobId,
      jobStatus: workerJobs.status,
      attemptId: workerJobEvents.attemptId,
      workerJobAttempt: workerJobEvents.workerJobAttempt,
      leaseFencingVersion: workerJobEvents.leaseFencingVersion,
      eventType: workerJobEvents.eventType,
      eventIdempotencyKey: workerJobEvents.eventIdempotencyKey,
      sequence: workerJobEvents.sequence,
      payload: workerJobEvents.payloadJson,
    })
    .from(workerJobEvents)
    .innerJoin(workerJobs, eq(workerJobs.id, workerJobEvents.workerJobId))
    .where(
      and(
        eq(workerJobs.tenantId, input.tenantId),
        eq(workerJobEvents.workerJobId, input.jobId),
        sql`${workerJobEvents.payloadJson}->>'eventId' = ${input.receiptEventId}`
      )
    )
    .limit(1);
  if (!row)
    throw new EconomicReceiptSettlementError("SETTLEMENT_RECEIPT_NOT_FOUND");
  const payload = row.payload as Record<string, unknown>;
  if (
    row.eventType !== COMPLETED_RECEIPT_EVENT ||
    !["succeeded", "completed"].includes(row.jobStatus) ||
    row.attemptId !== input.attemptId ||
    typeof payload.commandId !== "string" ||
    payload.eventId !== input.receiptEventId ||
    typeof payload.runnerId !== "string" ||
    typeof payload.runnerSessionId !== "string" ||
    !Number.isSafeInteger(payload.sequence)
  )
    throw new EconomicReceiptSettlementError(
      "SETTLEMENT_RECEIPT_BINDING_INVALID"
    );
  return {
    tenantId: row.tenantId,
    jobId: row.jobId,
    attemptId: row.attemptId,
    eventId: input.receiptEventId,
    eventType: row.eventType,
    eventIdempotencyKey: row.eventIdempotencyKey,
    sequence: row.sequence,
    workerJobAttempt: row.workerJobAttempt,
    leaseFencingVersion: row.leaseFencingVersion,
    payload,
  };
}

export function validateVerifiedEvidence(
  evidence: VerifiedRunnerAccountingEvidence,
  hold: {
    tenantId: string;
    currency: string;
    amountMinorUnits: number;
    capturedMinorUnits?: number;
    releasedMinorUnits?: number;
  }
): void {
  const remainingHoldAmount =
    hold.amountMinorUnits -
    (hold.capturedMinorUnits ?? 0) -
    (hold.releasedMinorUnits ?? 0);
  if (!Number.isSafeInteger(remainingHoldAmount) || remainingHoldAmount < 0) {
    throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
  }
  if (evidence.kind === "provider_metered") {
    if (
      !isReference(evidence.providerUsageRef) ||
      !/^[a-f0-9]{64}$/i.test(evidence.usageDigest) ||
      !isReference(evidence.pricingPolicyRef) ||
      !isReference(evidence.verificationRef) ||
      !isReference(evidence.policyVersion) ||
      !Number.isSafeInteger(evidence.amountMinorUnits) ||
      evidence.amountMinorUnits <= 0 ||
      evidence.amountMinorUnits > remainingHoldAmount ||
      evidence.currency.trim().toUpperCase() !== hold.currency.trim().toUpperCase()
    )
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    validateJournalLines(evidence.captureJournalLines, {
      tenantId: hold.tenantId,
      currency: hold.currency,
      amountMinorUnits: evidence.amountMinorUnits,
    });
    const unusedAmount = remainingHoldAmount - evidence.amountMinorUnits;
    if (unusedAmount > 0) {
      validateJournalLines(evidence.releaseJournalLines, {
        tenantId: hold.tenantId,
        currency: hold.currency,
        amountMinorUnits: unusedAmount,
      });
    } else if (evidence.releaseJournalLines.length > 0) {
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    }
  } else if (evidence.kind === "approved_subscription") {
    if (
      !isReference(evidence.subscriptionRef) ||
      !isReference(evidence.accountingPolicyRef) ||
      !isReference(evidence.usageRef) ||
      !isReference(evidence.verificationRef) ||
      !isReference(evidence.policyVersion)
    )
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    validateJournalLines(evidence.releaseJournalLines, {
      tenantId: hold.tenantId,
      currency: hold.currency,
      amountMinorUnits: remainingHoldAmount,
    });
  } else if (evidence.kind === "verified_zero_charge") {
    if (
      !isReference(evidence.zeroChargePolicyRef) ||
      !isReference(evidence.verificationRef) ||
      !isReference(evidence.policyVersion)
    )
      throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
    validateJournalLines(evidence.releaseJournalLines, {
      tenantId: hold.tenantId,
      currency: hold.currency,
      amountMinorUnits: remainingHoldAmount,
    });
  }
}

export function planRunnerEconomicSettlement(
  hold: {
    tenantId: string;
    currency: string;
    amountMinorUnits: number;
    capturedMinorUnits: number;
    releasedMinorUnits: number;
  },
  evidence: VerifiedRunnerAccountingEvidence
): { capturedMinorUnits: number; releasedMinorUnits: number } {
  validateVerifiedEvidence(evidence, hold);
  const remaining =
    hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
  if (evidence.kind === "provider_metered") {
    return {
      capturedMinorUnits: evidence.amountMinorUnits,
      releasedMinorUnits: remaining - evidence.amountMinorUnits,
    };
  }
  if (
    evidence.kind === "approved_subscription" ||
    evidence.kind === "verified_zero_charge"
  ) {
    return { capturedMinorUnits: 0, releasedMinorUnits: remaining };
  }
  throw new EconomicReceiptSettlementError("SETTLEMENT_EVIDENCE_INVALID");
}

/**
 * Settles a persisted, authenticated Runner completion receipt only after an
 * internal policy verifier proves its accounting classification. The verifier
 * and ledger accounts are injected by trusted server composition, never by a
 * Runner request or user-controlled payload.
 */
export async function settleRunnerEconomicReceipt(
  database: DrizzleDB,
  input: SettleRunnerEconomicReceiptInput,
  verifier: RunnerEconomicReceiptVerifier
): Promise<RunnerEconomicSettlementResult> {
  if (
    !input.tenantId ||
    !input.jobId ||
    !input.attemptId ||
    !input.holdId ||
    !input.receiptEventId ||
    (input.verifierTimeoutMs !== undefined &&
      (!Number.isSafeInteger(input.verifierTimeoutMs) ||
        input.verifierTimeoutMs < 1 ||
        input.verifierTimeoutMs > MAX_VERIFIER_TIMEOUT_MS)) ||
    !verifier ||
    typeof verifier.verify !== "function"
  )
    throw new EconomicReceiptSettlementError("SETTLEMENT_INPUT_INVALID");

  // Policy/usage verifiers may call an external accounting service. Read and
  // verify the append-only receipt before opening the settlement transaction
  // so a slow verifier never holds the economic hold row lock.
  const [preflightHold] = await database
    .select()
    .from(economicHolds)
    .where(
      and(
        eq(economicHolds.tenantId, input.tenantId),
        eq(economicHolds.id, input.holdId)
      )
    )
    .limit(1);
  if (!preflightHold)
    throw new EconomicReceiptSettlementError("SETTLEMENT_HOLD_NOT_FOUND");
  if (
    preflightHold.workerJobId !== input.jobId ||
    preflightHold.attemptId !== input.attemptId
  ) {
    throw new EconomicReceiptSettlementError(
      "SETTLEMENT_HOLD_BINDING_MISMATCH"
    );
  }
  const verifiedReceipt = await loadPersistedReceipt(database, input);
  const verifiedReceiptDigest = digestReceipt(verifiedReceipt);
  let evidence: VerifiedRunnerAccountingEvidence;
  const verificationAbort = new AbortController();
  let verifierTimeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeoutMs = input.verifierTimeoutMs ?? DEFAULT_VERIFIER_TIMEOUT_MS;
    evidence = await Promise.race([
      verifier.verify(verifiedReceipt, { signal: verificationAbort.signal }),
      new Promise<VerifiedRunnerAccountingEvidence>((_resolve, reject) => {
        verifierTimeout = setTimeout(() => {
          verificationAbort.abort();
          reject(new Error("ACCOUNTING_VERIFIER_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } catch {
    evidence = {
      kind: "unknown",
      reasonCode: verificationAbort.signal.aborted
        ? "ACCOUNTING_VERIFIER_TIMEOUT"
        : "ACCOUNTING_VERIFIER_UNAVAILABLE",
    };
  } finally {
    if (verifierTimeout) clearTimeout(verifierTimeout);
  }

  return database.transaction(async tx => {
    const [hold] = await tx
      .select()
      .from(economicHolds)
      .where(
        and(
          eq(economicHolds.tenantId, input.tenantId),
          eq(economicHolds.id, input.holdId)
        )
      )
      .for("update")
      .limit(1);
    if (!hold)
      throw new EconomicReceiptSettlementError("SETTLEMENT_HOLD_NOT_FOUND");
    if (
      hold.workerJobId !== input.jobId ||
      hold.attemptId !== input.attemptId
    ) {
      throw new EconomicReceiptSettlementError(
        "SETTLEMENT_HOLD_BINDING_MISMATCH"
      );
    }

    const receipt = await loadPersistedReceipt(tx, input);
    const receiptDigest = digestReceipt(receipt);
    if (receiptDigest !== verifiedReceiptDigest) {
      throw new EconomicReceiptSettlementError("SETTLEMENT_RECEIPT_CONFLICT");
    }
    const settlementKey = `runner-settlement:${receiptDigest}`;
    const [prior] = await tx
      .select()
      .from(economicEvents)
      .where(
        and(
          eq(economicEvents.tenantId, input.tenantId),
          eq(economicEvents.workerJobId, input.jobId),
          eq(economicEvents.attemptId, input.attemptId),
          eq(economicEvents.eventType, "runner_receipt_economically_settled"),
          sql`${economicEvents.payloadJson}->>'holdId' = ${input.holdId}`
        )
      )
      .limit(1);
    if (prior) {
      const payload = prior.payloadJson as Record<string, unknown>;
      if (
        payload.holdId !== input.holdId ||
        payload.workerJobId !== input.jobId ||
        payload.attemptId !== input.attemptId ||
        payload.receiptDigest !== receiptDigest
      )
        throw new EconomicReceiptSettlementError(
          "SETTLEMENT_DUPLICATE_RECEIPT"
        );
      return {
        status: "settled",
        classification:
          payload.classification as RunnerEconomicSettlementResult["classification"],
        capturedMinorUnits: Number(payload.capturedMinorUnits ?? 0),
        currency: String(payload.currency ?? hold.currency),
        receiptDigest,
        eventId: prior.id,
        replayed: true,
      };
    }

    const remainingHoldAmount =
      hold.amountMinorUnits - hold.capturedMinorUnits - hold.releasedMinorUnits;
    if (
      !["held", "partially_captured", "reconciliation_required"].includes(
        hold.status
      ) ||
      remainingHoldAmount <= 0
    ) {
      throw new EconomicReceiptSettlementError(
        "SETTLEMENT_HOLD_STATE_INVALID"
      );
    }

    if (
      evidence.kind === "unverified" ||
      evidence.kind === "failed" ||
      evidence.kind === "unknown"
    ) {
      const reasonCode = /^[A-Z0-9_]{1,100}$/.test(evidence.reasonCode)
        ? evidence.reasonCode
        : "ACCOUNTING_EVIDENCE_REJECTED";
      const reconciliationKey = `runner-reconciliation:${receiptDigest}`;
      await tx
        .insert(economicEvents)
        .values({
          tenantId: input.tenantId,
          eventType: "runner_receipt_reconciliation_required",
          idempotencyKey: reconciliationKey,
          workerJobId: input.jobId,
          attemptId: input.attemptId,
          actorId: SETTLEMENT_ACTOR,
          policyVersion: "economic-receipt-verification-v1",
          payloadJson: {
            holdId: input.holdId,
            workerJobId: input.jobId,
            attemptId: input.attemptId,
            receiptEventId: receipt.eventId,
            receiptDigest,
            reasonCode,
            evidenceRef: isReference(evidence.evidenceRef)
              ? evidence.evidenceRef
              : null,
          },
        })
        .onConflictDoNothing();
      const [reconciliationEvent] = await tx
        .select()
        .from(economicEvents)
        .where(
          and(
            eq(economicEvents.tenantId, input.tenantId),
            eq(economicEvents.idempotencyKey, reconciliationKey)
          )
        )
        .limit(1);
      const reconciliationPayload = reconciliationEvent?.payloadJson as
        Record<string, unknown> | undefined;
      if (
        !reconciliationEvent ||
        reconciliationPayload?.holdId !== input.holdId ||
        reconciliationPayload?.receiptDigest !== receiptDigest
      )
        throw new EconomicReceiptSettlementError(
          "SETTLEMENT_DUPLICATE_RECEIPT"
        );
      const [existingReconciliation] = await tx
        .select()
        .from(economicReconciliations)
        .where(
          and(
            eq(economicReconciliations.tenantId, input.tenantId),
            eq(economicReconciliations.holdId, hold.id),
            eq(economicReconciliations.status, "pending"),
            sql`${economicReconciliations.detailsJson}->>'settlementEventKey' = ${reconciliationKey}`
          )
        )
        .limit(1);
      const [reconciliation] = existingReconciliation
        ? [existingReconciliation]
        : await tx
            .insert(economicReconciliations)
            .values({
              tenantId: input.tenantId,
              workerJobId: input.jobId,
              attemptId: input.attemptId,
              holdId: hold.id,
              status: "pending",
              reasonCode,
              externalReference: isReference(evidence.evidenceRef)
                ? evidence.evidenceRef
                : receipt.eventId,
              detailsJson: {
                settlementEventKey: reconciliationKey,
                receiptDigest,
                reasonCode,
              },
            })
            .returning();
      return {
        status: "reconciliation_required",
        capturedMinorUnits: 0,
        currency: hold.currency,
        receiptDigest,
        eventId: reconciliationEvent.id,
        reconciliationId: reconciliation?.id,
        replayed: Boolean(existingReconciliation),
      };
    }

    const plan = planRunnerEconomicSettlement(hold, evidence);
    if (hold.status === "reconciliation_required") {
      await tx
        .update(economicHolds)
        .set({
          status: hold.capturedMinorUnits > 0 ? "partially_captured" : "held",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(economicHolds.tenantId, input.tenantId),
            eq(economicHolds.id, hold.id)
          )
        );
    }
    let capturedMinorUnits = 0;
    if (evidence.kind === "provider_metered") {
      await captureEconomicHoldInTransaction(tx, {
        tenantId: input.tenantId,
        holdId: hold.id,
        amountMinorUnits: evidence.amountMinorUnits,
        idempotencyKey: `runner-capture:${receiptDigest}`,
        receiptVerified: true,
        externalStatus: "succeeded",
        actorId: SETTLEMENT_ACTOR,
        policyVersion: evidence.policyVersion,
        journalLines: evidence.captureJournalLines,
        journalDescription: `Provider-metered Runner receipt ${receipt.eventId}`,
      });
      capturedMinorUnits = plan.capturedMinorUnits;
      const unused = plan.releasedMinorUnits;
      if (unused > 0) {
        await releaseEconomicHoldInTransaction(tx, {
          tenantId: input.tenantId,
          holdId: hold.id,
          idempotencyKey: `runner-release:${receiptDigest}`,
          actorId: SETTLEMENT_ACTOR,
          policyVersion: evidence.policyVersion,
          journalLines: evidence.releaseJournalLines,
          journalDescription: `Release unused Runner budget for receipt ${receipt.eventId}`,
        });
      }
    } else {
      await releaseEconomicHoldInTransaction(tx, {
        tenantId: input.tenantId,
        holdId: hold.id,
        idempotencyKey: `runner-release:${receiptDigest}`,
        actorId: SETTLEMENT_ACTOR,
        policyVersion: evidence.policyVersion,
        journalLines: evidence.releaseJournalLines,
        journalDescription: `Release non-chargeable Runner budget for receipt ${receipt.eventId}`,
      });
    }

    const payload = {
      holdId: hold.id,
      workerJobId: input.jobId,
      attemptId: input.attemptId,
      receiptEventId: receipt.eventId,
      receiptDigest,
      runnerId: receipt.payload.runnerId,
      runnerSessionId: receipt.payload.runnerSessionId,
      classification: evidence.kind,
      capturedMinorUnits,
      currency: hold.currency,
      verificationRef: evidence.verificationRef,
      ...(evidence.kind === "provider_metered"
        ? {
            providerUsageRef: evidence.providerUsageRef,
            usageDigest: evidence.usageDigest,
            pricingPolicyRef: evidence.pricingPolicyRef,
          }
        : evidence.kind === "approved_subscription"
          ? {
              subscriptionRef: evidence.subscriptionRef,
              accountingPolicyRef: evidence.accountingPolicyRef,
              usageRef: evidence.usageRef,
            }
          : { zeroChargePolicyRef: evidence.zeroChargePolicyRef }),
    };
    const [settlementEvent] = await tx
      .insert(economicEvents)
      .values({
        tenantId: input.tenantId,
        eventType: "runner_receipt_economically_settled",
        idempotencyKey: settlementKey,
        workerJobId: input.jobId,
        attemptId: input.attemptId,
        actorId: SETTLEMENT_ACTOR,
        policyVersion: evidence.policyVersion,
        payloadJson: payload,
      })
      .onConflictDoNothing()
      .returning();
    if (!settlementEvent)
      throw new EconomicReceiptSettlementError("SETTLEMENT_DUPLICATE_RECEIPT");

    await tx
      .update(economicReconciliations)
      .set({ status: "resolved", resolvedAt: new Date() })
      .where(
        and(
          eq(economicReconciliations.tenantId, input.tenantId),
          eq(economicReconciliations.holdId, hold.id),
          eq(economicReconciliations.status, "pending"),
          sql`${economicReconciliations.detailsJson}->>'receiptDigest' = ${receiptDigest}`
        )
      );
    return {
      status: "settled",
      classification: evidence.kind,
      capturedMinorUnits,
      currency: hold.currency,
      receiptDigest,
      eventId: settlementEvent.id,
      replayed: false,
    };
  });
}
