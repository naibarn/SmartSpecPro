import {
  buildInferencePlan,
  type InferencePlanContext,
} from "./planFactory";
import {
  planInferenceRouteForRequest,
  type InferencePlanningSourceOwners,
} from "./inferencePlanningService";
import type { InferenceIntentV2, InferencePlanR4 } from "./contracts";
import { persistInferencePlan } from "./persistence";
import type { InferenceReservationAuthority } from "./creditReservationAuthority";
import { loadVerifiedInferenceRolloutBundle } from "./rolloutBundle";

export type PrepareInferencePlanResult =
  | {
      status: "planning_blocked";
      reason: "SOURCE_UNAVAILABLE" | "AUTHORITY_INVALID";
    }
  | {
      status: "no_route";
      reason:
        | "consent_required"
        | "no_eligible_route"
        | "invalid_authority";
    }
  | {
      status: "plan_rejected";
      reason: string;
    }
  | {
      status: "reservation_invalid";
      reason:
        | "RESERVATION_AUTHORITY_MISMATCH"
        | "RESERVATION_EXPIRED"
        | "RESERVATION_BUDGET_INSUFFICIENT";
    }
  | {
      status: "plan_persisted";
      planId: string;
      created: boolean;
      plan: InferencePlanR4;
      intent: InferenceIntentV2;
      selectedDeploymentId: string;
      registryRevision: string;
      authorityRevision: string;
    }
  | { status: "persistence_failed"; reason: "PLAN_PERSISTENCE_FAILED" };

/**
 * Builds and persists an immutable plan from current server authorities.
 * The caller must first obtain the reservation/job context from their existing
 * owners; this function creates neither a credit reservation nor a worker job.
 */
export async function prepareAndPersistInferencePlan(input: {
  request: unknown;
  owners: InferencePlanningSourceOwners;
  context: InferencePlanContext;
  reservation: InferenceReservationAuthority;
  workerJobId?: string;
  now?: Date;
}, dependencies: {
  loadVerifiedRolloutBundle?: typeof loadVerifiedInferenceRolloutBundle;
} = {}): Promise<PrepareInferencePlanResult> {
  if (
    !input.reservation.reservationId.trim() ||
    input.reservation.tenantId !== input.owners.requestContext.tenantId ||
    input.reservation.principalRef !== input.owners.requestContext.principalId ||
    input.reservation.reservationId !== input.context.creditReservationId ||
    input.reservation.status !== "reserved" ||
    !Number.isSafeInteger(input.context.parentCostCeilingMicros) ||
    input.context.parentCostCeilingMicros < 0
  ) {
    return {
      status: "reservation_invalid",
      reason: "RESERVATION_AUTHORITY_MISMATCH",
    };
  }

  const nowMs = (input.now ?? new Date()).getTime();
  const reservationExpiresAt = Date.parse(input.reservation.expiresAt);
  if (
    !Number.isSafeInteger(nowMs) ||
    !Number.isFinite(reservationExpiresAt) ||
    reservationExpiresAt <= nowMs
  ) {
    return { status: "reservation_invalid", reason: "RESERVATION_EXPIRED" };
  }
  if (
    !Number.isSafeInteger(input.reservation.availableBudgetMicros) ||
    input.reservation.availableBudgetMicros < input.context.parentCostCeilingMicros
  ) {
    return {
      status: "reservation_invalid",
      reason: "RESERVATION_BUDGET_INSUFFICIENT",
    };
  }

  const planning = await planInferenceRouteForRequest({
    request: input.request,
    owners: input.owners,
    now: input.now,
  });
  if (planning.status === "source_unavailable") {
    return { status: "planning_blocked", reason: "SOURCE_UNAVAILABLE" };
  }
  if (planning.status === "authority_invalid") {
    return { status: "planning_blocked", reason: "AUTHORITY_INVALID" };
  }
  if (planning.route.status !== "selected") {
    return { status: "no_route", reason: planning.route.status };
  }

  const rolloutBundle = await (
    dependencies.loadVerifiedRolloutBundle ?? loadVerifiedInferenceRolloutBundle
  )(input.context.rolloutBundleHash);
  if (
    !rolloutBundle ||
    rolloutBundle.payload.routerPolicyRevision !==
      planning.authority.routerPolicyRevision ||
    rolloutBundle.payload.logicalModelRegistryRevision !== planning.registryRevision
  ) {
    return { status: "plan_rejected", reason: "ROLLOUT_BUNDLE_UNAVAILABLE_OR_STALE" };
  }

  const built = buildInferencePlan(
    planning.boundIntent,
    planning.route.candidate,
    planning.route.eligibleCandidates,
    planning.authority,
    input.context
  );
  if (!built.ok) {
    return {
      status: "plan_rejected",
      reason: built.code,
    };
  }

  try {
    const persisted = await persistInferencePlan({
      tenantId: planning.boundIntent.tenantId,
      principalRef: planning.boundIntent.principalId,
      idempotencyKey: planning.boundIntent.idempotencyKey,
      workerJobId: input.workerJobId,
      scoreCalibrationRevision: planning.authority.scoreCalibrationRevision,
      plan: built.plan,
      intent: planning.boundIntent,
    });
    return {
      status: "plan_persisted",
      planId: persisted.plan.planId,
      created: persisted.created,
      plan: built.plan,
      intent: planning.boundIntent,
      selectedDeploymentId: planning.route.candidate.deploymentId,
      registryRevision: planning.registryRevision,
      authorityRevision: planning.authorityRevision,
    };
  } catch {
    return { status: "persistence_failed", reason: "PLAN_PERSISTENCE_FAILED" };
  }
}
