import { createHash } from "node:crypto";
import {
  INFERENCE_SPEC_UID,
  inferencePlanR4Schema,
  inferenceIntentV2Schema,
  type InferenceIntentV2,
  type InferencePlanR4,
} from "./contracts";
import {
  evaluateInferenceEligibility,
  type InferenceAuthoritySnapshot,
  type RouteCandidate,
} from "./policyResolver";

export type InferencePlanContext = {
  planId: string;
  attemptBudget: number;
  startedAtMs: number;
  overallDeadlineAt: string;
  fallbackPermission: "none" | "preapproved" | "ask";
  preapprovedFallbackDeploymentIds: string[];
  cachePolicyId: string;
  creditReservationId: string;
  parentCostCeilingMicros: number;
  routePolicyRevision: string;
  specRevision: string;
  rolloutBundleHash: string;
  logicalCallId: string;
  attemptOwnershipEpoch: number;
  residencyPolicySnapshotRef: string;
  routerFeatureProvenanceRef: string;
  reasoningProfileId?: string;
  evaluatorPolicyId?: string;
  evalConsentRef?: string;
  selectedSourceRevisionSetHash?: string;
  classifierVersion?: string;
  routerVersion?: string;
  expectedQualityBand?: string;
};

export type InferencePlanBuildResult =
  | { ok: true; plan: InferencePlanR4 }
  | { ok: false; code: "ROUTE_NOT_ELIGIBLE"; reasonCodes: string[] }
  | { ok: false; code: "LOCK_FALLBACK_POLICY_MISMATCH" }
  | { ok: false; code: "FALLBACK_NOT_PREAPPROVED" }
  | { ok: false; code: "CANDIDATE_ID_CONFLICT" }
  | { ok: false; code: "PLAN_COST_CEILING_EXCEEDED" }
  | { ok: false; code: "ROUTE_POLICY_REVISION_MISMATCH" }
  | { ok: false; code: "INVALID_PLAN_CONTEXT"; fields: string[] };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(canonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (
      "{" +
      Object.keys(record)
        .sort()
        .map(key => JSON.stringify(key) + ":" + canonicalJson(record[key]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value) ?? "null";
}

export function hashInferenceIntent(intent: InferenceIntentV2): string {
  return `sha256:${createHash("sha256").update(canonicalJson(intent)).digest("hex")}`;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}

function expectedFallbackPermission(
  intent: InferenceIntentV2
): InferencePlanContext["fallbackPermission"] | undefined {
  switch (intent.selection.mode) {
    case "MODEL_LOCK":
      return intent.selection.fallback === "none"
        ? "none"
        : intent.selection.fallback === "ask"
          ? "ask"
          : "preapproved";
    case "PROVIDER_LOCK":
      return intent.selection.fallback;
    default:
      return undefined;
  }
}

/**
 * Creates a deterministic-content, immutable plan after rechecking eligibility.
 * IDs, budget reservation, policy snapshots and rollout evidence are supplied by
 * their existing server authorities; this function creates none of those owners.
 */
export function buildInferencePlan(
  intentInput: InferenceIntentV2,
  selectedCandidate: RouteCandidate,
  candidatePool: readonly RouteCandidate[],
  authority: InferenceAuthoritySnapshot,
  context: InferencePlanContext
): InferencePlanBuildResult {
  const parsedIntent = inferenceIntentV2Schema.safeParse(intentInput);
  if (!parsedIntent.success) {
    return {
      ok: false,
      code: "INVALID_PLAN_CONTEXT",
      fields: [
        ...new Set(
          parsedIntent.error.issues.map(
            issue => issue.path.join(".") || "intent"
          )
        ),
      ].sort(),
    };
  }
  const intent = parsedIntent.data;
  const eligibility = evaluateInferenceEligibility(
    intent,
    selectedCandidate,
    authority
  );
  if (!eligibility.eligible) {
    return {
      ok: false,
      code: "ROUTE_NOT_ELIGIBLE",
      reasonCodes: eligibility.reasonCodes,
    };
  }
  if (selectedCandidate.estimatedCostMicros > context.parentCostCeilingMicros) {
    return { ok: false, code: "PLAN_COST_CEILING_EXCEEDED" };
  }
  if (context.routePolicyRevision !== authority.routerPolicyRevision) {
    return { ok: false, code: "ROUTE_POLICY_REVISION_MISMATCH" };
  }

  const lockedPermission = expectedFallbackPermission(intent);
  if (
    lockedPermission !== undefined &&
    lockedPermission !== context.fallbackPermission
  ) {
    return { ok: false, code: "LOCK_FALLBACK_POLICY_MISMATCH" };
  }

  const eligibleById = new Map<string, RouteCandidate>();
  const candidateFingerprints = new Map<string, string>();
  const selectedFingerprint = canonicalJson(selectedCandidate);
  for (const candidate of candidatePool) {
    const fingerprint = canonicalJson(candidate);
    const priorFingerprint = candidateFingerprints.get(candidate.deploymentId);
    if (priorFingerprint !== undefined && priorFingerprint !== fingerprint) {
      return { ok: false, code: "CANDIDATE_ID_CONFLICT" };
    }
    candidateFingerprints.set(candidate.deploymentId, fingerprint);
    if (candidate.deploymentId === selectedCandidate.deploymentId) {
      if (fingerprint !== selectedFingerprint)
        return { ok: false, code: "CANDIDATE_ID_CONFLICT" };
      continue;
    }
    if (evaluateInferenceEligibility(intent, candidate, authority).eligible)
      eligibleById.set(candidate.deploymentId, candidate);
  }
  const approvedOrder = [...new Set(context.preapprovedFallbackDeploymentIds)];
  let fallbackCandidates: string[] = [];
  if (context.fallbackPermission === "preapproved") {
    fallbackCandidates = approvedOrder
      .filter(id => eligibleById.has(id))
      .slice(0, 8);
    const suppliedEligibleIds = [...eligibleById.keys()];
    if (suppliedEligibleIds.some(id => !approvedOrder.includes(id))) {
      return { ok: false, code: "FALLBACK_NOT_PREAPPROVED" };
    }
  }
  const attemptBudget =
    context.fallbackPermission === "preapproved" ? context.attemptBudget : 1;
  if (
    attemptBudget > fallbackCandidates.length + 1 ||
    (context.fallbackPermission !== "preapproved" && context.attemptBudget < 1)
  ) {
    return {
      ok: false,
      code: "INVALID_PLAN_CONTEXT",
      fields: ["attemptBudget"],
    };
  }
  const maximumPlannedSpend =
    selectedCandidate.estimatedCostMicros +
    fallbackCandidates
      .slice(0, Math.max(0, attemptBudget - 1))
      .reduce(
        (sum, deploymentId) =>
          sum +
          (eligibleById.get(deploymentId)?.estimatedCostMicros ??
            Number.MAX_SAFE_INTEGER),
        0
      );
  if (
    !Number.isSafeInteger(maximumPlannedSpend) ||
    maximumPlannedSpend > context.parentCostCeilingMicros
  ) {
    return { ok: false, code: "PLAN_COST_CEILING_EXCEEDED" };
  }

  let deadlineAt: string;
  try {
    deadlineAt = new Date(
      context.startedAtMs + intent.latencyDeadlineMs
    ).toISOString();
  } catch {
    return { ok: false, code: "INVALID_PLAN_CONTEXT", fields: ["startedAtMs"] };
  }
  const intentHash = hashInferenceIntent(intent);
  const planInput: unknown = {
    planId: context.planId,
    intentHash,
    policyRevision: intent.policyRevision,
    registryRevision: authority.registryRevision,
    selectedModelProfile: selectedCandidate.modelProfileId,
    selectedDeploymentProfile: selectedCandidate.deploymentId,
    endpointSurface: selectedCandidate.endpointSurface,
    reasoningProfileId: context.reasoningProfileId,
    attemptBudget,
    deadlineAt,
    fallbackCandidates,
    fallbackPermission: context.fallbackPermission,
    evaluatorPolicyId: context.evaluatorPolicyId,
    cachePolicyId: context.cachePolicyId,
    creditReservationId: context.creditReservationId,
    estimatedCostMicros: selectedCandidate.estimatedCostMicros,
    routePolicyRevision: context.routePolicyRevision,
    evidence:
      context.classifierVersion ||
      context.routerVersion ||
      context.expectedQualityBand
        ? {
            classifierVersion: context.classifierVersion,
            routerVersion: context.routerVersion,
            expectedQualityBand: context.expectedQualityBand,
          }
        : undefined,
    specUid: INFERENCE_SPEC_UID,
    specRevision: context.specRevision,
    rolloutBundleHash: context.rolloutBundleHash,
    logicalCallId: context.logicalCallId,
    attemptOwnershipEpoch: context.attemptOwnershipEpoch,
    parentCostCeilingMicros: context.parentCostCeilingMicros,
    overallDeadlineAt: context.overallDeadlineAt,
    residencyPolicySnapshotRef: context.residencyPolicySnapshotRef,
    routerFeatureProvenanceRef: context.routerFeatureProvenanceRef,
    evalConsentRef: context.evalConsentRef,
    selectedSourceRevisionSetHash: context.selectedSourceRevisionSetHash,
  };
  const plan = inferencePlanR4Schema.safeParse(planInput);
  if (!plan.success) {
    return {
      ok: false,
      code: "INVALID_PLAN_CONTEXT",
      fields: [
        ...new Set(
          plan.error.issues.map(issue => issue.path.join(".") || "plan")
        ),
      ].sort(),
    };
  }
  return { ok: true, plan: deepFreeze(plan.data) };
}
