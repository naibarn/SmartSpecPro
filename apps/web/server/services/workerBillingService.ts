import {
  createCreditReservation,
  drawFromReservation,
  refundReservation,
  deductCredits,
} from "./creditService";

export const WORKER_RUNTIME_CREDIT_SOURCE = "worker_runtime" as const;
export const DEFAULT_WORKER_JOB_RESERVATION_CREDITS = 25;

export interface WorkerJobBillingEnvelope {
  reservationId: string;
  reservedCredits: number;
  sourceType: typeof WORKER_RUNTIME_CREDIT_SOURCE;
}

export interface ReserveWorkerJobCreditsInput {
  userId: number;
  tenantId?: string;
  requestedCredits?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ReconcileWorkerJobCreditsInput {
  userId: number;
  tenantId?: string;
  jobId: string;
  billing: WorkerJobBillingEnvelope | null | undefined;
  finalStatus: "completed" | "failed" | "canceled" | "expired";
  actualCreditsUsed?: number | null;
  metadata?: Record<string, unknown>;
}

export interface WorkerBillingDependencies {
  createCreditReservation?: typeof createCreditReservation;
  deductCredits?: typeof deductCredits;
  drawFromReservation?: typeof drawFromReservation;
  refundReservation?: typeof refundReservation;
}

function normalizeRequestedCredits(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value == null) {
    return DEFAULT_WORKER_JOB_RESERVATION_CREDITS;
  }

  const normalized = Math.floor(value);
  if (normalized <= 0) {
    return DEFAULT_WORKER_JOB_RESERVATION_CREDITS;
  }

  return normalized;
}

function normalizeActualCredits(value: number | null | undefined): number {
  if (!Number.isFinite(value) || value == null) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export async function reserveWorkerJobCredits(
  input: ReserveWorkerJobCreditsInput,
  deps: WorkerBillingDependencies = {},
): Promise<WorkerJobBillingEnvelope> {
  const createReservation = deps.createCreditReservation ?? createCreditReservation;
  const reservedCredits = normalizeRequestedCredits(input.requestedCredits);
  const reservation = await createReservation(
    input.userId,
    reservedCredits,
    WORKER_RUNTIME_CREDIT_SOURCE,
    {
      ...(input.metadata ?? {}),
      tenantId: input.tenantId ?? null,
      reservedCredits,
      sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
    },
  );

  return {
    reservationId: reservation.reservationId,
    reservedCredits: reservation.reservedAmount,
    sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
  };
}

export async function reconcileWorkerJobCredits(
  input: ReconcileWorkerJobCreditsInput,
  deps: WorkerBillingDependencies = {},
): Promise<{
  status: "noop" | "refunded" | "reconciled";
  actualCreditsUsed: number;
  overflowCredits: number;
}> {
  if (!input.billing?.reservationId) {
    return {
      status: "noop",
      actualCreditsUsed: normalizeActualCredits(input.actualCreditsUsed),
      overflowCredits: 0,
    };
  }

  const drawReservation = deps.drawFromReservation ?? drawFromReservation;
  const refundReservedCredits = deps.refundReservation ?? refundReservation;
  const deductOverflowCredits = deps.deductCredits ?? deductCredits;

  if (input.finalStatus !== "completed") {
    await refundReservedCredits(input.billing.reservationId);
    return {
      status: "refunded",
      actualCreditsUsed: 0,
      overflowCredits: 0,
    };
  }

  const actualCreditsUsed = normalizeActualCredits(input.actualCreditsUsed);
  const reservedCredits = normalizeRequestedCredits(input.billing.reservedCredits);
  const creditsFromReservation = Math.min(actualCreditsUsed, reservedCredits);
  const overflowCredits = Math.max(0, actualCreditsUsed - reservedCredits);

  if (creditsFromReservation > 0) {
    await drawReservation(
      input.billing.reservationId,
      creditsFromReservation,
      `Worker job ${input.jobId} credit reconciliation`,
    );
  }

  await refundReservedCredits(input.billing.reservationId);

  if (overflowCredits > 0) {
    await deductOverflowCredits({
      userId: input.userId,
      amount: overflowCredits,
      tenantId: input.tenantId,
      sourceType: WORKER_RUNTIME_CREDIT_SOURCE,
      description: `Worker job ${input.jobId} overflow credit reconciliation`,
      idempotencyKey: `worker-job:${input.jobId}:overflow`,
      metadata: {
        ...(input.metadata ?? {}),
        jobId: input.jobId,
        reservationId: input.billing.reservationId,
        reservedCredits,
        actualCreditsUsed,
        overflowCredits,
      },
    });
  }

  return {
    status: "reconciled",
    actualCreditsUsed,
    overflowCredits,
  };
}

export function billingEnvelopeFromMetadata(
  value: unknown,
): WorkerJobBillingEnvelope | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const reservationId = typeof record.reservationId === "string"
    ? record.reservationId.trim()
    : "";
  const reservedCreditsRaw = typeof record.reservedCredits === "number"
    ? record.reservedCredits
    : Number(record.reservedCredits);
  const sourceType = record.sourceType === WORKER_RUNTIME_CREDIT_SOURCE
    ? WORKER_RUNTIME_CREDIT_SOURCE
    : null;

  if (!reservationId || !Number.isFinite(reservedCreditsRaw) || !sourceType) {
    return null;
  }

  return {
    reservationId,
    reservedCredits: normalizeRequestedCredits(reservedCreditsRaw),
    sourceType,
  };
}
