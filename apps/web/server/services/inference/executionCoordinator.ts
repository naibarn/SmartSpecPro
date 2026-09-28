import { randomUUID } from "node:crypto";
import {
  inferenceAttemptReceiptSchema,
  inferenceIntentV2Schema,
  inferencePlanR4Schema,
  type InferenceAttemptReceipt,
  type InferenceIntentV2,
  type InferencePlanR4,
} from "./contracts";
import {
  decideInferenceAttemptRetry,
  type AttemptRetryDecision,
} from "./attemptPolicy";
import {
  evaluateInferenceEligibility,
  type InferenceAuthoritySnapshot,
  type RouteCandidate,
} from "./policyResolver";
import {
  completeInferenceAttempt,
  createInferenceAttempt,
  loadInferenceSettlementRecord,
  markInferenceAttemptSubmitting,
  recordInferenceSettlementOutcome,
} from "./persistence";
import { hashInferenceIntent } from "./planFactory";
import type { InferenceReservationAuthority } from "./creditReservationAuthority";

export type InferenceExecutionStore = {
  createAttempt(input: {
    planId: string;
    attemptId: string;
    attemptOrdinal: number;
    attemptOwnershipEpoch: number;
    ownerToken: string;
    candidate: RouteCandidate;
    workerJobAttemptId?: string;
  }): Promise<{ created: boolean; status: string; attemptId?: string }>;
  markSubmitting(input: {
    attemptId: string;
    attemptOwnershipEpoch: number;
    ownerToken: string;
  }): Promise<boolean>;
  complete(input: {
    receipt: InferenceAttemptReceipt;
    attemptOwnershipEpoch: number;
    ownerToken: string;
  }): Promise<boolean>;
  recordSettlement(input: {
    planId: string;
    attemptId: string;
    status: "pending" | "settled";
    reason?: "COST_UNAVAILABLE" | "OWNER_REJECTED" | "AUDIT_WRITE_FAILED";
    chargedCostMicros?: number;
  }): Promise<void>;
};

const databaseStore: InferenceExecutionStore = {
  createAttempt: createInferenceAttempt,
  markSubmitting: markInferenceAttemptSubmitting,
  complete: completeInferenceAttempt,
  recordSettlement: recordInferenceSettlementOutcome,
};

export type ProviderAttemptObservation = {
  outcome: InferenceAttemptReceipt["outcome"];
  submissionState: InferenceAttemptReceipt["submissionState"];
  streamCommitted: boolean;
  normalizedFailure?: InferenceAttemptReceipt["normalizedFailure"];
  observedExecution?: InferenceAttemptReceipt["observedExecution"];
  usage?: InferenceAttemptReceipt["usage"];
  chargedCostMicros?: number;
  gatewayRequestId?: string;
  providerRequestId?: string;
  effectReceiptRefs?: string[];
};

export type InferenceExecutionResult =
  | { status: "completed"; receipt: InferenceAttemptReceipt; response: unknown }
  | {
      status: "settlement_pending";
      receipt: InferenceAttemptReceipt;
      reason: "COST_UNAVAILABLE" | "OWNER_REJECTED" | "AUDIT_WRITE_FAILED";
    }
  | {
      status: "failed";
      receipt: InferenceAttemptReceipt;
      retryDecision: AttemptRetryDecision;
    }
  | { status: "route_identity_mismatch"; receipt: InferenceAttemptReceipt }
  | {
      status: "route_not_eligible";
      deploymentId: string;
      reasonCodes: string[];
    }
  | { status: "stale_owner"; attemptId?: string }
  | { status: "duplicate_attempt"; attemptId: string; existingStatus: string }
  | { status: "consent_required"; reasonCode: string }
  | { status: "deadline_exhausted" }
  | { status: "budget_exhausted" }
  | { status: "reservation_expired" }
  | { status: "reservation_unavailable" }
  | { status: "plan_invalid" };

export type ExecuteInferencePlanInput = {
  plan: InferencePlanR4;
  intent: InferenceIntentV2;
  attemptOwnershipEpoch: number;
  ownerToken: string;
  workerJobAttemptId?: string;
  store?: InferenceExecutionStore;
  resolveCandidate(deploymentId: string): Promise<{
    candidate: RouteCandidate;
    authority: InferenceAuthoritySnapshot;
  } | null>;
  /** Reads the current canonical credit-owner state; stale plan-time snapshots are insufficient. */
  loadReservationAuthority(input: {
    reservationId: string;
    tenantId: string;
    principalRef: string;
  }): Promise<InferenceReservationAuthority | null>;
  providerIdempotencyCertified(candidate: RouteCandidate): boolean;
  executeAttempt(input: {
    plan: InferencePlanR4;
    intent: InferenceIntentV2;
    candidate: RouteCandidate;
    attemptId: string;
    attemptOrdinal: number;
    deadlineAt: string;
    signal: AbortSignal;
  }): Promise<{ observation: ProviderAttemptObservation; response?: unknown }>;
  /** Persists user-visible Chat content privately before a completed attempt can be charged. */
  persistResponseDelivery?(input: {
    planId: string;
    attemptId: string;
    receipt: InferenceAttemptReceipt;
    response: unknown;
  }): Promise<void>;
  /** Settles against the existing credit owner using attemptId as the idempotency key. */
  settleCompletedAttempt(input: {
    reservationId: string;
    settlementKey: string;
    chargedCostMicros: number;
    receipt: InferenceAttemptReceipt;
  }): Promise<boolean>;
  now?: () => number;
  makeAttemptId?: () => string;
};

function observedIdentityMatches(
  receipt: InferenceAttemptReceipt,
  candidate: RouteCandidate
): boolean {
  const observed = receipt.observedExecution;
  return (
    !!observed &&
    (candidate.providerModelId === undefined ||
      observed.model === candidate.providerModelId) &&
    observed.model === receipt.actualModel &&
    observed.providerId === candidate.providerId &&
    observed.credentialOwnerRef === candidate.credentialOwnerRef &&
    observed.deploymentId === candidate.deploymentId &&
    observed.endpointSurface === candidate.endpointSurface
  );
}

function makeUnknownReceipt(input: {
  plan: InferencePlanR4;
  candidate: RouteCandidate;
  attemptId: string;
  attemptOrdinal: number;
}): InferenceAttemptReceipt {
  return inferenceAttemptReceiptSchema.parse({
    planId: input.plan.planId,
    attemptId: input.attemptId,
    attemptOrdinal: input.attemptOrdinal,
    actualModel: input.candidate.modelProfileId,
    providerId: input.candidate.providerId,
    credentialOwnerRef: input.candidate.credentialOwnerRef,
    deploymentId: input.candidate.deploymentId,
    outcome: "unknown",
    submissionState: "unknown",
    streamCommitted: false,
    normalizedFailure: "unknown_outcome",
  });
}

/** Executes only plan-pinned routes and never retries an ambiguous provider submission. */
export async function executeInferencePlan(
  input: ExecuteInferencePlanInput
): Promise<InferenceExecutionResult> {
  const planParse = inferencePlanR4Schema.safeParse(input.plan);
  const intentParse = inferenceIntentV2Schema.safeParse(input.intent);
  if (
    !planParse.success ||
    !intentParse.success ||
    !input.ownerToken ||
    typeof input.loadReservationAuthority !== "function" ||
    typeof input.settleCompletedAttempt !== "function" ||
    !Number.isSafeInteger(input.attemptOwnershipEpoch) ||
    input.attemptOwnershipEpoch < 1
  )
    return { status: "plan_invalid" };
  const plan = planParse.data;
  const intent = intentParse.data;
  if (hashInferenceIntent(intent) !== plan.intentHash)
    return { status: "plan_invalid" };
  const store = input.store ?? databaseStore;
  const now = input.now ?? Date.now;
  const makeAttemptId = input.makeAttemptId ?? randomUUID;
  const chain = [
    plan.selectedDeploymentProfile,
    ...plan.fallbackCandidates,
  ].slice(0, plan.attemptBudget);
  let maximumEstimateUsed = 0;

  for (let index = 0; index < chain.length; index += 1) {
    const deploymentId = chain[index];
    if (
      now() >= Date.parse(plan.deadlineAt) ||
      now() >= Date.parse(plan.overallDeadlineAt)
    ) {
      return { status: "deadline_exhausted" };
    }
    let resolved: Awaited<
      ReturnType<ExecuteInferencePlanInput["resolveCandidate"]>
    >;
    try {
      resolved = await input.resolveCandidate(deploymentId);
    } catch {
      return {
        status: "route_not_eligible",
        deploymentId,
        reasonCodes: ["ROUTE_AUTHORITY_UNAVAILABLE"],
      };
    }
    if (
      !resolved ||
      resolved.candidate.deploymentId !== deploymentId ||
      (index === 0 &&
        (resolved.candidate.modelProfileId !== plan.selectedModelProfile ||
          resolved.candidate.endpointSurface !== plan.endpointSurface ||
          resolved.candidate.estimatedCostMicros !==
            plan.estimatedCostMicros)) ||
      resolved.authority.registryRevision !== plan.registryRevision ||
      resolved.authority.routerPolicyRevision !== plan.routePolicyRevision
    ) {
      return {
        status: "route_not_eligible",
        deploymentId,
        reasonCodes: ["PINNED_ROUTE_UNAVAILABLE"],
      };
    }
    const eligibility = evaluateInferenceEligibility(
      intent,
      resolved.candidate,
      resolved.authority
    );
    if (!eligibility.eligible) {
      return {
        status: "route_not_eligible",
        deploymentId,
        reasonCodes: eligibility.reasonCodes,
      };
    }
    const nextEstimate =
      maximumEstimateUsed + resolved.candidate.estimatedCostMicros;
    if (
      !Number.isSafeInteger(nextEstimate) ||
      nextEstimate > plan.parentCostCeilingMicros
    ) {
      return { status: "budget_exhausted" };
    }
    maximumEstimateUsed = nextEstimate;

    const remainingPlanBudgetMicros = Math.max(
      0,
      plan.parentCostCeilingMicros - (nextEstimate - resolved.candidate.estimatedCostMicros)
    );
    const checkReservation = async ():
      Promise<"ready" | "expired" | "insufficient" | "unavailable"> => {
      let currentReservation: InferenceReservationAuthority | null;
      try {
        currentReservation = await input.loadReservationAuthority({
          reservationId: plan.creditReservationId,
          tenantId: intent.tenantId,
          principalRef: intent.principalId,
        });
      } catch {
        return "unavailable";
      }
      if (!currentReservation) return "unavailable";
      if (
        currentReservation.reservationId !== plan.creditReservationId ||
        currentReservation.tenantId !== intent.tenantId ||
        currentReservation.principalRef !== intent.principalId ||
        currentReservation.status !== "reserved"
      ) {
        return "unavailable";
      }
      const expiry = Date.parse(currentReservation.expiresAt);
      if (!Number.isFinite(expiry) || expiry <= now()) return "expired";
      if (
        !Number.isSafeInteger(currentReservation.availableBudgetMicros) ||
        currentReservation.availableBudgetMicros < remainingPlanBudgetMicros
      ) {
        return "insufficient";
      }
      return "ready";
    };

    const preflightReservation = await checkReservation();
    if (preflightReservation === "expired")
      return { status: "reservation_expired" };
    if (preflightReservation === "insufficient")
      return { status: "budget_exhausted" };
    if (preflightReservation !== "ready")
      return { status: "reservation_unavailable" };

    const attemptId = makeAttemptId();
    const attemptOrdinal = index + 1;
    const ownership = {
      attemptOwnershipEpoch: input.attemptOwnershipEpoch,
      ownerToken: input.ownerToken,
    };
    const created = await store.createAttempt({
      planId: plan.planId,
      attemptId,
      attemptOrdinal,
      ...ownership,
      candidate: resolved.candidate,
      workerJobAttemptId: input.workerJobAttemptId,
    });
    if (!created.created) {
      return {
        status: "duplicate_attempt",
        attemptId: created.attemptId ?? attemptId,
        existingStatus: created.status,
      };
    }
    if (!(await store.markSubmitting({ attemptId, ...ownership }))) {
      return { status: "stale_owner", attemptId };
    }

    // Re-read immediately before provider I/O so an expired or concurrently
    // consumed reservation cannot authorize dispatch from the plan snapshot.
    const dispatchReservation = await checkReservation();
    if (dispatchReservation !== "ready") {
      const receipt = inferenceAttemptReceiptSchema.parse({
        ...makeUnknownReceipt({
          plan,
          candidate: resolved.candidate,
          attemptId,
          attemptOrdinal,
        }),
        outcome: "failed",
        submissionState: "not_submitted",
        normalizedFailure:
          dispatchReservation === "unavailable"
            ? "reservation_unavailable"
            : "budget_exceeded",
      });
      if (!(await store.complete({ receipt, ...ownership })))
        return { status: "stale_owner", attemptId };
      if (dispatchReservation === "expired")
        return { status: "reservation_expired" };
      if (dispatchReservation === "insufficient")
        return { status: "budget_exhausted" };
      return { status: "reservation_unavailable" };
    }

    const controller = new AbortController();
    const remainingMs = Math.max(1, Date.parse(plan.deadlineAt) - now());
    const timeout = setTimeout(() => controller.abort(), remainingMs);
    const deadlineReached = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error("INFERENCE_DEADLINE_REACHED")),
        { once: true }
      );
    });
    let execution: {
      observation: ProviderAttemptObservation;
      response?: unknown;
    };
    try {
      execution = await Promise.race([
        input.executeAttempt({
          plan,
          intent,
          candidate: resolved.candidate,
          attemptId,
          attemptOrdinal,
          deadlineAt: plan.deadlineAt,
          signal: controller.signal,
        }),
        deadlineReached,
      ]);
    } catch {
      clearTimeout(timeout);
      const receipt = makeUnknownReceipt({
        plan,
        candidate: resolved.candidate,
        attemptId,
        attemptOrdinal,
      });
      if (!(await store.complete({ receipt, ...ownership })))
        return { status: "stale_owner", attemptId };
      return {
        status: "failed",
        receipt,
        retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" },
      };
    }
    clearTimeout(timeout);

    const receiptParse = inferenceAttemptReceiptSchema.safeParse({
      ...execution.observation,
      planId: plan.planId,
      attemptId,
      attemptOrdinal,
      actualModel:
        execution.observation.observedExecution?.model ??
        resolved.candidate.modelProfileId,
      providerId: resolved.candidate.providerId,
      credentialOwnerRef: resolved.candidate.credentialOwnerRef,
      deploymentId: resolved.candidate.deploymentId,
    });
    if (!receiptParse.success) {
      const receipt = makeUnknownReceipt({
        plan,
        candidate: resolved.candidate,
        attemptId,
        attemptOrdinal,
      });
      if (!(await store.complete({ receipt, ...ownership })))
        return { status: "stale_owner", attemptId };
      return {
        status: "failed",
        receipt,
        retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" },
      };
    }
    const receipt = receiptParse.data;
    if (
      receipt.observedExecution &&
      !observedIdentityMatches(receipt, resolved.candidate)
    ) {
      if (!(await store.complete({ receipt, ...ownership })))
        return { status: "stale_owner", attemptId };
      return { status: "route_identity_mismatch", receipt };
    }
    if (receipt.outcome === "completed" && execution.response !== undefined && input.persistResponseDelivery) {
      try {
        await input.persistResponseDelivery({
          planId: plan.planId,
          attemptId,
          receipt,
          response: execution.response,
        });
      } catch {
        const unknownReceipt = makeUnknownReceipt({
          plan,
          candidate: resolved.candidate,
          attemptId,
          attemptOrdinal,
        });
        if (!(await store.complete({ receipt: unknownReceipt, ...ownership })))
          return { status: "stale_owner", attemptId };
        return {
          status: "failed",
          receipt: unknownReceipt,
          retryDecision: { action: "terminal", reason: "UNKNOWN_OUTCOME" },
        };
      }
    }
    if (!(await store.complete({ receipt, ...ownership })))
      return { status: "stale_owner", attemptId };

    if (receipt.outcome === "completed") {
      if (receipt.chargedCostMicros === undefined) {
        try {
          await store.recordSettlement({
            planId: plan.planId,
            attemptId,
            status: "pending",
            reason: "COST_UNAVAILABLE",
          });
          return { status: "settlement_pending", receipt, reason: "COST_UNAVAILABLE" };
        } catch {
          return { status: "settlement_pending", receipt, reason: "AUDIT_WRITE_FAILED" };
        }
      }
      let settled = false;
      try {
        settled = await input.settleCompletedAttempt({
          reservationId: plan.creditReservationId,
          settlementKey: attemptId,
          chargedCostMicros: receipt.chargedCostMicros,
          receipt,
        });
      } catch {
        settled = false;
      }
      if (!settled) {
        try {
          await store.recordSettlement({
            planId: plan.planId,
            attemptId,
            status: "pending",
            reason: "OWNER_REJECTED",
          });
          return { status: "settlement_pending", receipt, reason: "OWNER_REJECTED" };
        } catch {
          return { status: "settlement_pending", receipt, reason: "AUDIT_WRITE_FAILED" };
        }
      }
      try {
        await store.recordSettlement({
          planId: plan.planId,
          attemptId,
          status: "settled",
          chargedCostMicros: receipt.chargedCostMicros,
        });
      } catch {
        return { status: "settlement_pending", receipt, reason: "AUDIT_WRITE_FAILED" };
      }
      return { status: "completed", receipt, response: execution.response };
    }
    let idempotencyCertified = false;
    try {
      idempotencyCertified = input.providerIdempotencyCertified(
        resolved.candidate
      );
    } catch {
      // A broken certification lookup must fail closed and stop paid replay.
    }
    const retryDecision = decideInferenceAttemptRetry(
      plan,
      receipt,
      now(),
      idempotencyCertified
    );
    if (retryDecision.action === "consent_required") {
      return { status: "consent_required", reasonCode: retryDecision.reason };
    }
    if (retryDecision.action === "terminal") {
      return { status: "failed", receipt, retryDecision };
    }
    if (
      retryDecision.deploymentId !== chain[index + 1] ||
      retryDecision.attemptOrdinal !== index + 2
    ) {
      return {
        status: "failed",
        receipt,
        retryDecision: { action: "terminal", reason: "PLAN_RECEIPT_MISMATCH" },
      };
    }
  }
  return { status: "deadline_exhausted" };
}

export type ReconcileInferenceSettlementResult =
  | { status: "settled"; attemptId: string }
  | {
      status: "pending";
      attemptId: string;
      reason: "COST_UNAVAILABLE" | "OWNER_REJECTED" | "AUDIT_WRITE_FAILED";
    }
  | {
      status: "not_settleable";
      attemptId: string;
      reason: "ATTEMPT_NOT_FOUND_OR_NOT_COMPLETED";
    };

/**
 * Retries only settlement from the immutable PostgreSQL attempt receipt. It
 * never repeats provider I/O; owner settlement remains idempotent by attempt ID.
 */
export async function reconcileInferenceAttemptSettlement(input: {
  attemptId: string;
  tenantId?: string;
  settleCompletedAttempt: ExecuteInferencePlanInput["settleCompletedAttempt"];
  load?: typeof loadInferenceSettlementRecord;
  record?: typeof recordInferenceSettlementOutcome;
}): Promise<ReconcileInferenceSettlementResult> {
  const attemptId = input.attemptId.trim();
  if (!attemptId) {
    return {
      status: "not_settleable",
      attemptId,
      reason: "ATTEMPT_NOT_FOUND_OR_NOT_COMPLETED",
    };
  }
  let record: Awaited<ReturnType<typeof loadInferenceSettlementRecord>>;
  try {
    const load = input.load ?? loadInferenceSettlementRecord;
    record = input.tenantId
      ? await load(attemptId, input.tenantId)
      : await load(attemptId);
  } catch {
    record = null;
  }
  if (!record || record.receipt.chargedCostMicros === undefined) {
    return {
      status: "not_settleable",
      attemptId,
      reason: "ATTEMPT_NOT_FOUND_OR_NOT_COMPLETED",
    };
  }

  let settled = false;
  try {
    settled = await input.settleCompletedAttempt({
      reservationId: record.reservationId,
      settlementKey: attemptId,
      chargedCostMicros: record.receipt.chargedCostMicros,
      receipt: record.receipt,
    });
  } catch {
    settled = false;
  }
  try {
    if (settled) {
      await (input.record ?? recordInferenceSettlementOutcome)({
        planId: record.receipt.planId,
        attemptId,
        status: "settled",
        chargedCostMicros: record.receipt.chargedCostMicros,
      });
    } else {
      await (input.record ?? recordInferenceSettlementOutcome)({
        planId: record.receipt.planId,
        attemptId,
        status: "pending",
        reason: "OWNER_REJECTED",
      });
    }
  } catch {
    return { status: "pending", attemptId, reason: "AUDIT_WRITE_FAILED" };
  }
  return settled
    ? { status: "settled", attemptId }
    : { status: "pending", attemptId, reason: "OWNER_REJECTED" };
}
