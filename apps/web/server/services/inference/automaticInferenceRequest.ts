import type { Message } from "../../_core/llm";
import type { InferenceExecutionResult } from "./executionCoordinator";
import {
  executeInferencePlan,
  type ExecuteInferencePlanInput,
} from "./executionCoordinator";
import {
  closeDurableInferenceCreditReservation,
  loadDurableInferenceReservationAuthority,
  settleDurableInferenceCreditReservation,
} from "./durableCreditReservation";
import {
  createLlmRouterExecutionBindings,
} from "./llmRouterAttemptAdapter";
import {
  prepareAndPersistInferencePlan,
  type PrepareInferencePlanResult,
} from "./prepareInferencePlan";
import type { InferencePlanContext } from "./planFactory";
import type { InferencePlanningSourceOwners } from "./inferencePlanningService";
import type { InferenceReservationAuthority } from "./creditReservationAuthority";
import { enqueueInferenceSettlementRecovery } from "./settlementRecoveryJob";

type PersistedPlanResult = Extract<
  PrepareInferencePlanResult,
  { status: "plan_persisted" }
>;

export type PolicyRoutedInferenceResult =
  | {
      status: "not_executable";
      planning: Exclude<PrepareInferencePlanResult, PersistedPlanResult>;
    }
  | {
      status: "not_executable";
      reason:
        | "INVALID_CALL_CONTEXT"
        | "INCOMPLETE_WORKER_JOB_OWNERSHIP";
    }
  | {
      status: "executed";
      planning: PersistedPlanResult;
      execution: InferenceExecutionResult;
      settlementRecovery?: "queued" | "admission_failed" | "manual_review_required";
    };

export type PolicyRoutedInferenceDependencies = {
  /** Adapter seam used by controlled integration tests; production uses the pinned llmRouter binding. */
  createExecutionBindings?: typeof createLlmRouterExecutionBindings;
  /** Canonical job admission seam; production uses worker_jobs plus its outbox. */
  enqueueSettlementRecovery?: typeof enqueueInferenceSettlementRecovery;
};

/**
 * Composes policy planning, immutable persistence, exact runtime pinning,
 * provider execution and credit-owner settlement for one inference request.
 * The caller supplies an existing reservation and, for durable work, the
 * canonical worker job/attempt ownership; this function creates neither.
 */
export async function executePolicyRoutedInference(input: {
  request: unknown;
  owners: InferencePlanningSourceOwners;
  context: InferencePlanContext;
  reservation: InferenceReservationAuthority;
  workerJobId?: string;
  workerJobAttemptId?: string;
  userId: number;
  messages: Message[];
  stream: boolean;
  attemptOwnershipEpoch: number;
  ownerToken: string;
  loadReservationAuthority?: ExecuteInferencePlanInput["loadReservationAuthority"];
  settleCompletedAttempt?: ExecuteInferencePlanInput["settleCompletedAttempt"];
  persistResponseDelivery?: ExecuteInferencePlanInput["persistResponseDelivery"];
  maxTokens?: number;
  temperature?: number;
  extraBodyParams?: Record<string, unknown>;
  now?: Date;
}, dependencies: PolicyRoutedInferenceDependencies = {}): Promise<PolicyRoutedInferenceResult> {
  const hasWorkerJob = Boolean(input.workerJobId);
  const hasWorkerAttempt = Boolean(input.workerJobAttemptId);
  if (hasWorkerJob !== hasWorkerAttempt) {
    return {
      status: "not_executable",
      reason: "INCOMPLETE_WORKER_JOB_OWNERSHIP",
    };
  }
  if (
    !Number.isSafeInteger(input.userId) ||
    input.userId <= 0 ||
    !input.ownerToken ||
    !Number.isSafeInteger(input.attemptOwnershipEpoch) ||
    input.attemptOwnershipEpoch < 1 ||
    !Array.isArray(input.messages) ||
    input.messages.length === 0
  ) {
    return { status: "not_executable", reason: "INVALID_CALL_CONTEXT" };
  }

  const planning = await prepareAndPersistInferencePlan({
    request: input.request,
    owners: input.owners,
    context: input.context,
    reservation: input.reservation,
    workerJobId: input.workerJobId,
    now: input.now,
  });
  if (planning.status !== "plan_persisted") {
    return { status: "not_executable", planning };
  }

  const loadReservationAuthority = input.loadReservationAuthority ??
    ((request: { reservationId: string; tenantId: string; principalRef: string }) =>
      loadDurableInferenceReservationAuthority({
        ...request,
        userId: input.userId,
      }));
  const bindings = (dependencies.createExecutionBindings ?? createLlmRouterExecutionBindings)({
    intent: planning.intent,
    owners: input.owners,
    expectedRegistryRevision: planning.registryRevision,
    expectedRouterPolicyRevision: planning.plan.routePolicyRevision,
    messages: input.messages,
    userId: input.userId,
    stream: input.stream,
    loadReservationAuthority,
    settleCompletedAttempt:
      input.settleCompletedAttempt ?? settleDurableInferenceCreditReservation,
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    extraBodyParams: input.extraBodyParams,
  });
  const execution = await executeInferencePlan({
    ...bindings,
    plan: planning.plan,
    intent: planning.intent,
    attemptOwnershipEpoch: input.attemptOwnershipEpoch,
    ownerToken: input.ownerToken,
    workerJobAttemptId: input.workerJobAttemptId,
    persistResponseDelivery: input.persistResponseDelivery,
  });
  // Release unused reserved credits after a known terminal outcome. The
  // durable owner refuses closure while any attempt is active, ambiguous, or
  // awaiting settlement, so this is safe for every coordinator result.
  if (execution.status !== "settlement_pending") {
    await closeDurableInferenceCreditReservation({
      reservationId: input.reservation.reservationId,
    }).catch(() => false);
  }
  if (execution.status === "settlement_pending") {
    let settlementRecovery: "queued" | "admission_failed" | "manual_review_required";
    if (execution.receipt.chargedCostMicros === undefined) {
      settlementRecovery = "manual_review_required";
    } else {
      settlementRecovery = "admission_failed";
      try {
        await (dependencies.enqueueSettlementRecovery ?? enqueueInferenceSettlementRecovery)({
          tenantId: planning.intent.tenantId,
          attemptId: execution.receipt.attemptId,
        });
        settlementRecovery = "queued";
      } catch {
        // The attempt receipt remains durable and output stays withheld. The
        // scheduled pending-attempt sweep repairs the enqueue crash window.
      }
    }
    return { status: "executed", planning, execution, settlementRecovery };
  }
  return { status: "executed", planning, execution };
}
