import type { InferenceIntentV2 } from "./contracts";

export type RouteCandidate = {
  modelProfileId: string;
  /** Exact upstream model identifier pinned by the deployment profile. */
  providerModelId?: string;
  deploymentId: string;
  providerId: string;
  credentialOwnerRef: string;
  endpointSurface:
    | "native_responses"
    | "responses_compatible"
    | "chat_compatible"
    | "native_provider"
    | "local";
  executionSurface: "cloud" | "local";
  qualification: "qualified" | "unqualified";
  health: "healthy" | "degraded" | "unavailable";
  credentialStatus: "active" | "invalid" | "expired";
  region: string;
  supportsZeroDataRetention: boolean;
  allowedPrivacyClasses: string[];
  inputModalities: string[];
  outputModalities: string[];
  features: string[];
  toolContractRefs: string[];
  maxContextTokens: number;
  maxOutputTokens: number;
  priceValidUntilMs: number;
  estimatedCostMicros: number;
  latencyP95Ms: number;
  /** Calibrated, versioned quality and reliability inputs in parts per million. */
  qualityScorePpm?: number;
  reliabilityScorePpm?: number;
  compatibilityScorePpm?: number;
  scoreCalibrationRevision?: string;
};

export type InferenceAuthoritySnapshot = {
  tenantId: string;
  principalId: string;
  policyRevision: string;
  platformPolicyReady: boolean;
  tenantPolicyReady: boolean;
  emergencyRevocationFresh: boolean;
  budgetAuthorityReady: boolean;
  platformAllowedProviderIds: string[];
  tenantAllowedProviderIds: string[];
  principalAllowedProviderIds: string[];
  allowedCredentialOwnerRefs: string[];
  allowedRegions: string[];
  requireZeroDataRetention: boolean;
  availableBudgetMicros: number;
  revokedModelProfileIds: string[];
  revokedDeploymentIds: string[];
  observedAtMs: number;
  registryRevision: string;
  routerPolicyRevision: string;
  scoreCalibrationRevision: string;
  routingWeights: {
    qualityPpm: number;
    costPpm: number;
    latencyPpm: number;
    reliabilityPpm: number;
    compatibilityPpm: number;
  };
};

export type EligibilityReasonCode =
  | "POLICY_NOT_READY"
  | "BUDGET_NOT_RESERVED"
  | "INFERENCE_SCOPE_MISMATCH"
  | "PROVIDER_NOT_ALLOWED"
  | "ROUTE_REVOKED"
  | "MODEL_REVISION_UNCERTIFIED"
  | "CREDENTIAL_SCOPE_INVALID"
  | "PROVIDER_UNAVAILABLE"
  | "RESIDENCY_NOT_ALLOWED"
  | "PRIVACY_CLASS_NOT_ALLOWED"
  | "ZERO_DATA_RETENTION_UNAVAILABLE"
  | "INPUT_MODALITY_UNSUPPORTED"
  | "OUTPUT_MODALITY_UNSUPPORTED"
  | "REQUIRED_FEATURE_UNSUPPORTED"
  | "TOOL_CONTRACT_UNSUPPORTED"
  | "CONTEXT_WINDOW_TOO_SMALL"
  | "OUTPUT_BUDGET_UNSUPPORTED"
  | "MODEL_LOCK_MISMATCH"
  | "MODEL_PROVIDER_LOCK_MISMATCH"
  | "PROVIDER_LOCK_MISMATCH"
  | "LOCAL_ONLY_REQUIRED"
  | "PLATFORM_ONLY_REQUIRED"
  | "PRICE_SNAPSHOT_STALE"
  | "REQUEST_COST_CEILING_EXCEEDED"
  | "DEADLINE_UNACHIEVABLE"
  | "ROUTING_SCORE_MISSING"
  | "ROUTING_SCORE_STALE"
  | "ROUTING_SCORE_INVALID";

export type EligibilityResult =
  | { eligible: true; reasonCodes: [] }
  | { eligible: false; reasonCodes: EligibilityReasonCode[] };

export type RouteSelectionResult =
  | { status: "selected"; candidate: RouteCandidate; eligibleCount: number }
  | { status: "consent_required"; reasonCode: "LOCKED_ROUTE_UNAVAILABLE" }
  | {
      status: "no_eligible_route";
      reasonCode: "NO_ELIGIBLE_ROUTE" | "ROUTING_POLICY_INVALID";
    };

export type CandidateFilterReceipt = {
  policyRevision: string;
  registryRevision: string;
  routerPolicyRevision: string;
  scoreCalibrationRevision: string;
  observedAtMs: number;
  candidates: Array<{
    modelProfileId: string;
    deploymentId: string;
    eligible: boolean;
    reasonCodes: EligibilityReasonCode[];
  }>;
};

function hasValidRoutingWeights(
  authority: InferenceAuthoritySnapshot
): boolean {
  const values = [
    authority.routingWeights.qualityPpm,
    authority.routingWeights.costPpm,
    authority.routingWeights.latencyPpm,
    authority.routingWeights.reliabilityPpm,
    authority.routingWeights.compatibilityPpm,
  ];
  return (
    values.every(
      value => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000
    ) &&
    values.reduce((sum, value) => sum + value, 0) === 1_000_000 &&
    authority.routerPolicyRevision.trim().length > 0
  );
}

/**
 * Applies deterministic hard filters only. Ranking and advisory signals must run
 * after this function and can never restore a rejected candidate.
 */
export function evaluateInferenceEligibility(
  intent: InferenceIntentV2,
  candidate: RouteCandidate,
  authority: InferenceAuthoritySnapshot
): EligibilityResult {
  // Fail closed before inspecting candidate attributes when required authorities
  // are unavailable; do not leak policy details through candidate-specific codes.
  if (
    !authority.platformPolicyReady ||
    !authority.tenantPolicyReady ||
    !authority.emergencyRevocationFresh ||
    authority.policyRevision !== intent.policyRevision ||
    !hasValidRoutingWeights(authority)
  ) {
    return { eligible: false, reasonCodes: ["POLICY_NOT_READY"] };
  }

  const reasons = new Set<EligibilityReasonCode>();
  const add = (condition: boolean, code: EligibilityReasonCode) => {
    if (condition) reasons.add(code);
  };

  add(
    intent.tenantId !== authority.tenantId ||
      intent.principalId !== authority.principalId,
    "INFERENCE_SCOPE_MISMATCH"
  );
  add(
    !authority.budgetAuthorityReady ||
      candidate.estimatedCostMicros > authority.availableBudgetMicros,
    "BUDGET_NOT_RESERVED"
  );
  add(
    !authority.platformAllowedProviderIds.includes(candidate.providerId) ||
      !authority.tenantAllowedProviderIds.includes(candidate.providerId) ||
      !authority.principalAllowedProviderIds.includes(candidate.providerId),
    "PROVIDER_NOT_ALLOWED"
  );
  add(
    authority.revokedModelProfileIds.includes(candidate.modelProfileId) ||
      authority.revokedDeploymentIds.includes(candidate.deploymentId),
    "ROUTE_REVOKED"
  );
  add(candidate.qualification !== "qualified", "MODEL_REVISION_UNCERTIFIED");
  add(
    candidate.credentialStatus !== "active" ||
      !authority.allowedCredentialOwnerRefs.includes(
        candidate.credentialOwnerRef
      ),
    "CREDENTIAL_SCOPE_INVALID"
  );
  add(candidate.health !== "healthy", "PROVIDER_UNAVAILABLE");
  const residency = intent.residencyAllowlist;
  add(
    !authority.allowedRegions.includes(candidate.region) ||
      (residency !== undefined && !residency.includes(candidate.region)),
    "RESIDENCY_NOT_ALLOWED"
  );
  add(
    !candidate.allowedPrivacyClasses.includes(intent.privacyClass),
    "PRIVACY_CLASS_NOT_ALLOWED"
  );
  add(
    (authority.requireZeroDataRetention || intent.zdrRequired) &&
      !candidate.supportsZeroDataRetention,
    "ZERO_DATA_RETENTION_UNAVAILABLE"
  );
  add(
    !intent.inputModalities.every(modality =>
      candidate.inputModalities.includes(modality)
    ),
    "INPUT_MODALITY_UNSUPPORTED"
  );
  add(
    !intent.outputModalities.every(modality =>
      candidate.outputModalities.includes(modality)
    ),
    "OUTPUT_MODALITY_UNSUPPORTED"
  );
  add(
    !intent.requiredFeatures.every(feature =>
      candidate.features.includes(feature)
    ),
    "REQUIRED_FEATURE_UNSUPPORTED"
  );
  add(
    !(intent.toolContractRefs ?? []).every(contract =>
      candidate.toolContractRefs.includes(contract)
    ),
    "TOOL_CONTRACT_UNSUPPORTED"
  );
  add(
    candidate.maxContextTokens <
      intent.inputTokenEstimate + intent.outputTokenReserve,
    "CONTEXT_WINDOW_TOO_SMALL"
  );
  add(
    candidate.maxOutputTokens < intent.outputTokenReserve,
    "OUTPUT_BUDGET_UNSUPPORTED"
  );
  const weights = authority.routingWeights;
  const requiresCalibratedScore =
    weights.qualityPpm > 0 ||
    weights.reliabilityPpm > 0 ||
    weights.compatibilityPpm > 0;
  const suppliedScores = [
    candidate.qualityScorePpm,
    candidate.reliabilityScorePpm,
    candidate.compatibilityScorePpm,
  ];
  add(
    requiresCalibratedScore &&
      (candidate.qualityScorePpm === undefined ||
        candidate.reliabilityScorePpm === undefined ||
        candidate.compatibilityScorePpm === undefined),
    "ROUTING_SCORE_MISSING"
  );
  add(
    suppliedScores.some(
      value =>
        value !== undefined &&
        (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000)
    ),
    "ROUTING_SCORE_INVALID"
  );
  add(
    requiresCalibratedScore &&
      candidate.scoreCalibrationRevision !== authority.scoreCalibrationRevision,
    "ROUTING_SCORE_STALE"
  );

  switch (intent.selection.mode) {
    case "MODEL_LOCK":
      add(
        candidate.modelProfileId !== intent.selection.modelProfileId,
        "MODEL_LOCK_MISMATCH"
      );
      if (intent.selection.providerId) {
        add(
          candidate.providerId !== intent.selection.providerId,
          "MODEL_PROVIDER_LOCK_MISMATCH"
        );
      }
      break;
    case "PROVIDER_LOCK":
      add(
        candidate.providerId !== intent.selection.providerId,
        "PROVIDER_LOCK_MISMATCH"
      );
      break;
    case "LOCAL_ONLY":
      add(candidate.executionSurface !== "local", "LOCAL_ONLY_REQUIRED");
      break;
    case "PLATFORM_ONLY":
      add(candidate.executionSurface !== "cloud", "PLATFORM_ONLY_REQUIRED");
      break;
  }

  add(
    candidate.priceValidUntilMs <= authority.observedAtMs,
    "PRICE_SNAPSHOT_STALE"
  );
  add(
    candidate.estimatedCostMicros > intent.maxEstimatedCostMicros,
    "REQUEST_COST_CEILING_EXCEEDED"
  );
  add(
    candidate.latencyP95Ms > intent.latencyDeadlineMs,
    "DEADLINE_UNACHIEVABLE"
  );

  const reasonCodes = [...reasons].sort();
  return reasonCodes.length === 0
    ? { eligible: true, reasonCodes: [] }
    : { eligible: false, reasonCodes };
}

/**
 * Selects only from hard-filtered candidates. Ranking is stable across processes:
 * preference score, cost, latency, then immutable deployment/model identifiers.
 * The default is AUTO; explicit locks are never silently relaxed.
 */
export function selectInferenceRoute(
  intent: InferenceIntentV2,
  candidates: readonly RouteCandidate[],
  authority: InferenceAuthoritySnapshot
): RouteSelectionResult {
  const weights = authority.routingWeights;
  if (!hasValidRoutingWeights(authority)) {
    return {
      status: "no_eligible_route",
      reasonCode: "ROUTING_POLICY_INVALID",
    };
  }
  const eligible = candidates.filter(
    candidate =>
      evaluateInferenceEligibility(intent, candidate, authority).eligible
  );
  const selection = intent.selection;
  const matching = eligible.filter(candidate => {
    switch (selection.mode) {
      case "MODEL_LOCK":
        return candidate.modelProfileId === selection.modelProfileId;
      case "PROVIDER_LOCK":
        return candidate.providerId === selection.providerId;
      case "LOCAL_ONLY":
        return candidate.executionSurface === "local";
      case "PLATFORM_ONLY":
        return candidate.executionSurface === "cloud";
      case "AUTO":
        return true;
    }
  });

  if (matching.length === 0) {
    if (
      (selection.mode === "MODEL_LOCK" && selection.fallback === "ask") ||
      (selection.mode === "PROVIDER_LOCK" && selection.fallback === "ask")
    ) {
      return {
        status: "consent_required",
        reasonCode: "LOCKED_ROUTE_UNAVAILABLE",
      };
    }
    return { status: "no_eligible_route", reasonCode: "NO_ELIGIBLE_ROUTE" };
  }

  const boundedScore = (value: number | undefined) =>
    value !== undefined &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= 1_000_000
      ? value
      : 0;
  const efficiencyScore = (ceiling: number, used: number) => {
    if (ceiling <= 0) return used === 0 ? 1_000_000 : 0;
    if (
      !Number.isSafeInteger(ceiling) ||
      !Number.isSafeInteger(used) ||
      used < 0
    )
      return 0;
    const remaining = Math.max(0, ceiling - used);
    return Number((BigInt(remaining) * 1_000_000n) / BigInt(ceiling));
  };
  const compareId = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0;
  const ranked = [...matching].sort((a, b) => {
    const score = (candidate: RouteCandidate) =>
      BigInt(boundedScore(candidate.qualityScorePpm)) *
        BigInt(weights.qualityPpm) +
      BigInt(
        efficiencyScore(
          intent.maxEstimatedCostMicros,
          candidate.estimatedCostMicros
        )
      ) *
        BigInt(weights.costPpm) +
      BigInt(
        efficiencyScore(intent.latencyDeadlineMs, candidate.latencyP95Ms)
      ) *
        BigInt(weights.latencyPpm) +
      BigInt(boundedScore(candidate.reliabilityScorePpm)) *
        BigInt(weights.reliabilityPpm) +
      BigInt(boundedScore(candidate.compatibilityScorePpm)) *
        BigInt(weights.compatibilityPpm);
    const scoreDiff = score(b) - score(a);
    return (
      (scoreDiff > 0n ? 1 : scoreDiff < 0n ? -1 : 0) ||
      a.estimatedCostMicros - b.estimatedCostMicros ||
      a.latencyP95Ms - b.latencyP95Ms ||
      compareId(a.deploymentId, b.deploymentId) ||
      compareId(a.modelProfileId, b.modelProfileId)
    );
  });
  return {
    status: "selected",
    candidate: ranked[0],
    eligibleCount: eligible.length,
  };
}

/** Safe audit receipt: records route identifiers and stable reasons, never request content. */
export function createCandidateFilterReceipt(
  intent: InferenceIntentV2,
  candidates: readonly RouteCandidate[],
  authority: InferenceAuthoritySnapshot
): CandidateFilterReceipt {
  return {
    policyRevision: intent.policyRevision,
    registryRevision: authority.registryRevision,
    routerPolicyRevision: authority.routerPolicyRevision,
    scoreCalibrationRevision: authority.scoreCalibrationRevision,
    observedAtMs: authority.observedAtMs,
    candidates: candidates
      .map(candidate => ({
        modelProfileId: candidate.modelProfileId,
        deploymentId: candidate.deploymentId,
        ...evaluateInferenceEligibility(intent, candidate, authority),
      }))
      .sort(
        (a, b) =>
          (a.deploymentId < b.deploymentId
            ? -1
            : a.deploymentId > b.deploymentId
              ? 1
              : 0) ||
          (a.modelProfileId < b.modelProfileId
            ? -1
            : a.modelProfileId > b.modelProfileId
              ? 1
              : 0)
      ),
  };
}
