import { createHash } from "node:crypto";
import type { JobExecutor } from "../jobExecutor";
import type { createControlPlaneJob } from "../jobControlPlaneGateway";
import { settleDurableInferenceCreditReservation } from "./durableCreditReservation";
import { reconcileInferenceAttemptSettlement } from "./executionCoordinator";
import { listPendingInferenceSettlementAttempts } from "./persistence";

const JOB_TYPE = "llm.inference_settlement_reconcile";
const CONTRACT_VERSION = "feature-186-v1";
const SWEEP_JOB_TYPE = "llm.inference_settlement_sweep";

function settlementJobKey(attemptId: string): string {
  const digest = createHash("sha256").update(attemptId).digest("hex");
  return `spec231:settlement:${digest}`;
}

export async function enqueueInferenceSettlementRecovery(input: {
  tenantId: string;
  attemptId: string;
}, dependencies: {
  create?: typeof createControlPlaneJob;
} = {}): Promise<{ jobId: string; created: boolean }> {
  const tenantId = input.tenantId.trim();
  const attemptId = input.attemptId.trim();
  if (!tenantId || tenantId.length > 36 || !attemptId || attemptId.length > 256) {
    throw new Error("INFERENCE_SETTLEMENT_RECOVERY_INPUT_INVALID");
  }
  const idempotencyKey = settlementJobKey(attemptId);
  const create = dependencies.create ??
    (await import("../jobControlPlaneGateway")).createControlPlaneJob;
  const job = await create({
    context: {
      tenantId,
      actorType: "system",
      authorizationScope: "system:spec231-inference-settlement",
      correlationId: idempotencyKey,
      idempotencyKey,
    },
    definition: {
      contractVersion: CONTRACT_VERSION,
      jobType: JOB_TYPE,
      executionClass: "short",
      input: { attemptId },
      retryPolicy: {
        maxAttempts: 8,
        baseDelayMs: 5_000,
        maxDelayMs: 300_000,
        jitter: "bounded",
        deadlineMs: 24 * 60 * 60_000,
        allowedErrorClasses: ["retryable"],
      },
      timeoutPolicy: { softTimeoutMs: 15_000, hardTimeoutMs: 60_000 },
    },
  });
  return job;
}

class SettlementRetryError extends Error {
  readonly class = "retryable" as const;
  readonly code = "INFERENCE_SETTLEMENT_PENDING";

  constructor() {
    super("Inference settlement remains pending");
  }
}

class SettlementEvidenceError extends Error {
  readonly class = "unknown" as const;
  readonly code = "INFERENCE_SETTLEMENT_EVIDENCE_INVALID";
  readonly operatorReviewRequired = true;

  constructor() {
    super("Inference settlement receipt is unavailable or invalid");
  }
}

export const executeInferenceSettlementRecoveryJob: JobExecutor = async ({
  context,
  lease,
  reporter,
}) => {
  const input = context.input as { attemptId?: unknown };
  if (typeof input?.attemptId !== "string" || !input.attemptId.trim()) {
    throw new SettlementEvidenceError();
  }
  await reporter.assertActive(lease);
  const result = await reconcileInferenceAttemptSettlement({
    attemptId: input.attemptId,
    tenantId: context.tenantId,
    settleCompletedAttempt: settleDurableInferenceCreditReservation,
  });
  await reporter.assertActive(lease);
  if (result.status === "settled") {
    return { output: { attemptId: result.attemptId, settlement: "settled" } };
  }
  if (result.status === "pending") throw new SettlementRetryError();
  throw new SettlementEvidenceError();
};

/** Crash-gap recovery: the scheduled canonical job scans durable receipts and never replays providers. */
export const executeInferenceSettlementSweepJob: JobExecutor = async ({
  lease,
  reporter,
}) => {
  await reporter.assertActive(lease);
  const pending = await listPendingInferenceSettlementAttempts(50);
  let settled = 0;
  let stillPending = 0;
  let invalidEvidence = 0;
  for (const target of pending) {
    await reporter.assertActive(lease);
    const result = await reconcileInferenceAttemptSettlement({
      attemptId: target.attemptId,
      tenantId: target.tenantId,
      settleCompletedAttempt: settleDurableInferenceCreditReservation,
    });
    if (result.status === "settled") settled += 1;
    else if (result.status === "pending") stillPending += 1;
    else invalidEvidence += 1;
  }
  const { deliverPendingInferenceChatResponses } = await import("../chatService");
  const responseDeliveries = await deliverPendingInferenceChatResponses(50);
  await reporter.assertActive(lease);
  return {
    output: {
      scanned: pending.length,
      settled,
      stillPending,
      invalidEvidence,
      responseDeliveries: responseDeliveries.delivered,
      responseDeliveriesPending: responseDeliveries.pending,
    },
  };
};

export const INFERENCE_SETTLEMENT_RECOVERY_JOB = {
  jobType: JOB_TYPE,
  contractVersion: CONTRACT_VERSION,
} as const;

export const INFERENCE_SETTLEMENT_SWEEP_JOB = {
  jobType: SWEEP_JOB_TYPE,
  contractVersion: CONTRACT_VERSION,
} as const;
