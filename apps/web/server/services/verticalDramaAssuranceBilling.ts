import { and, eq, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  createCreditReservation,
  drawFromReservation,
  refundReservation,
  type CreditReservation,
  type CreditSourceType,
} from "./creditService";
import {
  verticalDramaAssuranceCalls,
  verticalDramaStoryGenerationRuns,
} from "../../drizzle/schema";

export type AssuranceCallPayer = "user" | "platform";
export type AssuranceCallStatus =
  | "registered"
  | "in_flight"
  | "settling"
  | "completed"
  | "failed"
  | "usage_unknown"
  | "reconciliation_required";

export type RegisterAssuranceCallInput = {
  tenantId: string;
  executionId: string;
  attemptId: string;
  providerCallId: string;
  callKey: string;
  purpose: string;
  payer: AssuranceCallPayer;
  billingOwner: string;
  inputHash: string;
  estimatedCredits?: number;
  reservationId?: string | null;
  settlementKey?: string | null;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssuranceCallProjection = RegisterAssuranceCallInput & {
  status: AssuranceCallStatus;
  actualCredits: number | null;
  usageKnown: boolean;
  providerRequestId: string | null;
  providerTaskId: string | null;
};

export type VerticalDramaAssuranceBilling = {
  reserve(input: {
    userId: number;
    amount: number;
    sourceType?: CreditSourceType;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<CreditReservation>;
  register(input: RegisterAssuranceCallInput): Promise<AssuranceCallProjection>;
  markStarted(input: { tenantId: string; providerCallId: string; providerRequestId?: string | null }): Promise<void>;
  settleKnown(input: {
    tenantId: string;
    providerCallId: string;
    actualCredits: number;
    usageMetadata?: Record<string, unknown>;
  }): Promise<{ status: AssuranceCallStatus; drawn: number; duplicate: boolean }>;
  markUsageUnknown(input: { tenantId: string; providerCallId: string; reason: string }): Promise<void>;
  markProviderTask(input: { tenantId: string; providerCallId: string; providerTaskId: string }): Promise<void>;
  refund(input: { reservationId: string }): Promise<{ refundedAmount: number }>;
};

function projection(row: typeof verticalDramaAssuranceCalls.$inferSelect): AssuranceCallProjection {
  return {
    tenantId: row.tenantId,
    executionId: row.executionId,
    attemptId: row.attemptId,
    providerCallId: row.providerCallId,
    callKey: row.callKey,
    purpose: row.purpose,
    payer: row.payer as AssuranceCallPayer,
    billingOwner: row.billingOwner,
    inputHash: row.inputHash,
    estimatedCredits: row.estimatedCredits,
    reservationId: row.reservationId,
    settlementKey: row.settlementKey,
    provider: row.provider,
    model: row.model,
    metadata: row.metadataJson,
    status: row.status as AssuranceCallStatus,
    actualCredits: row.actualCredits,
    usageKnown: row.usageKnown,
    providerRequestId: row.providerRequestId,
    providerTaskId: row.providerTaskId,
  };
}

/**
 * Single billing owner for physical Vertical Drama calls. The call row is
 * written before dispatch; `settling` is intentionally a durable crash marker.
 * A worker that finds `settling` must reconcile rather than draw again.
 */
export function createVerticalDramaAssuranceBilling(): VerticalDramaAssuranceBilling {
  const db = getDb();
  const getCall = async (tenantId: string, providerCallId: string, forUpdate = false) => {
    const query = db.select().from(verticalDramaAssuranceCalls).where(and(
      eq(verticalDramaAssuranceCalls.tenantId, tenantId),
      eq(verticalDramaAssuranceCalls.providerCallId, providerCallId),
    )).limit(1);
    const [row] = forUpdate ? await query.for("update") : await query;
    return row ?? null;
  };

  return {
    reserve: input => createCreditReservation(
      input.userId,
      input.amount,
      input.sourceType ?? "skill",
      input.metadata,
      input.idempotencyKey,
    ),
    async register(input) {
      const [execution] = await db.select({ id: verticalDramaStoryGenerationRuns.id }).from(verticalDramaStoryGenerationRuns).where(and(
        eq(verticalDramaStoryGenerationRuns.tenantId, input.tenantId),
        eq(verticalDramaStoryGenerationRuns.runId, input.executionId),
      )).limit(1);
      if (!execution) throw new Error("VD_ASSURANCE_EXECUTION_NOT_FOUND");
      const [existing] = await db.select().from(verticalDramaAssuranceCalls).where(and(
        eq(verticalDramaAssuranceCalls.tenantId, input.tenantId),
        eq(verticalDramaAssuranceCalls.callKey, input.callKey),
      )).limit(1);
      if (existing) return projection(existing);
      try {
        const [{ ordinal }] = await db.select({ ordinal: sql<number>`coalesce(max(${verticalDramaAssuranceCalls.ordinal}), 0) + 1` }).from(verticalDramaAssuranceCalls).where(eq(verticalDramaAssuranceCalls.executionRowId, execution.id));
        const [row] = await db.insert(verticalDramaAssuranceCalls).values({
          tenantId: input.tenantId,
          executionRowId: execution.id,
          executionId: input.executionId,
          attemptId: input.attemptId,
          providerCallId: input.providerCallId,
          callKey: input.callKey,
          ordinal: Number(ordinal),
          purpose: input.purpose,
          payer: input.payer,
          billingOwner: input.billingOwner,
          provider: input.provider ?? null,
          model: input.model ?? null,
          inputHash: input.inputHash,
          reservationId: input.reservationId ?? null,
          settlementKey: input.settlementKey ?? null,
          estimatedCredits: input.estimatedCredits ?? 0,
          metadataJson: input.metadata ?? {},
        }).returning();
        if (!row) throw new Error("VD_ASSURANCE_CALL_INSERT_FAILED");
        return projection(row);
      } catch (error) {
        const duplicate = await getCall(input.tenantId, input.providerCallId);
        if (duplicate) return projection(duplicate);
        throw error;
      }
    },
    async markStarted(input) {
      await db.update(verticalDramaAssuranceCalls).set({
        status: "in_flight",
        providerRequestId: input.providerRequestId ?? null,
        startedAt: sql`coalesce(${verticalDramaAssuranceCalls.startedAt}, now())`,
      }).where(and(eq(verticalDramaAssuranceCalls.tenantId, input.tenantId), eq(verticalDramaAssuranceCalls.providerCallId, input.providerCallId), eq(verticalDramaAssuranceCalls.status, "registered")));
    },
    async settleKnown(input) {
      if (!Number.isFinite(input.actualCredits) || input.actualCredits < 0) throw new Error("VD_ASSURANCE_USAGE_INVALID");
      const call = await getCall(input.tenantId, input.providerCallId, true);
      if (!call) throw new Error("VD_ASSURANCE_CALL_NOT_FOUND");
      if (call.status === "completed") return { status: "completed" as const, drawn: 0, duplicate: true };
      if (call.status === "settling" || call.status === "reconciliation_required") return { status: call.status as AssuranceCallStatus, drawn: 0, duplicate: false };
      await db.update(verticalDramaAssuranceCalls).set({ status: "settling", usageKnown: true, actualCredits: input.actualCredits, metadataJson: { ...call.metadataJson, ...(input.usageMetadata ?? {}) } }).where(eq(verticalDramaAssuranceCalls.id, call.id));
      try {
        const drawn = call.payer === "user" && call.reservationId
          ? await drawFromReservation(call.reservationId, input.actualCredits, call.purpose, call.settlementKey ?? call.providerCallId)
          : { drawn: 0, remaining: 0 };
        await db.update(verticalDramaAssuranceCalls).set({ status: "completed", finishedAt: new Date() }).where(eq(verticalDramaAssuranceCalls.id, call.id));
        return { status: "completed" as const, drawn: drawn.drawn, duplicate: drawn.duplicate === true };
      } catch (error) {
        await db.update(verticalDramaAssuranceCalls).set({ status: "reconciliation_required", metadataJson: { ...call.metadataJson, settlementError: error instanceof Error ? error.message : String(error) } }).where(eq(verticalDramaAssuranceCalls.id, call.id));
        throw error;
      }
    },
    async markUsageUnknown(input) {
      await db.update(verticalDramaAssuranceCalls).set({ status: "reconciliation_required", usageKnown: false, metadataJson: sql`jsonb_set(${verticalDramaAssuranceCalls.metadataJson}, '{unknownUsageReason}', ${JSON.stringify(input.reason)}::jsonb)` }).where(and(eq(verticalDramaAssuranceCalls.tenantId, input.tenantId), eq(verticalDramaAssuranceCalls.providerCallId, input.providerCallId), sql`${verticalDramaAssuranceCalls.status} NOT IN ('completed')`));
    },
    async markProviderTask(input) {
      await db.update(verticalDramaAssuranceCalls).set({ providerTaskId: input.providerTaskId, status: "in_flight" }).where(and(eq(verticalDramaAssuranceCalls.tenantId, input.tenantId), eq(verticalDramaAssuranceCalls.providerCallId, input.providerCallId)));
    },
    refund: input => refundReservation(input.reservationId),
  };
}
