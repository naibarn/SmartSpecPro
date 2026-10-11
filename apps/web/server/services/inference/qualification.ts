import {
  logicalModelProfileSchema,
  providerDeploymentProfileSchema,
  type DeploymentProbeCheck,
  type LogicalModelProfile,
  type ProviderDeploymentProfile,
} from "../../../shared/inferenceProfileSchemas";
export {
  logicalModelProfileSchema,
  providerDeploymentProfileSchema,
} from "../../../shared/inferenceProfileSchemas";
export type {
  LogicalModelProfile,
  ProviderDeploymentProfile,
} from "../../../shared/inferenceProfileSchemas";
import type { InferenceIntentV2 } from "./contracts";
import type { RouteCandidate } from "./policyResolver";

export type QualificationReasonCode =
  | "MODEL_PROFILE_INVALID"
  | "DEPLOYMENT_PROFILE_INVALID"
  | "DEPLOYMENT_NOT_ACTIVE"
  | "MODEL_REVISION_MISMATCH"
  | "MODEL_ALIAS_DRIFT"
  | "CREDENTIAL_OWNER_MISSING"
  | "LIVE_PROBE_REQUIRED"
  | "PROBE_SURFACE_MISMATCH"
  | "PROBE_STALE"
  | "CAPABILITY_PROBE_FAILED"
  | "CAPABILITY_EVIDENCE_INCOMPLETE"
  | "PRICE_STALE"
  | "PRICING_EVIDENCE_MISSING"
  | "DEPLOYMENT_HEALTH_STALE"
  | "DEPLOYMENT_UNHEALTHY"
  | "DEPLOYMENT_REGION_INVALID"
  | "PRICE_ESTIMATE_OVERFLOW"
  | "DEPLOYMENT_ID_CONFLICT";

export type QualificationResult =
  | { eligible: true; reasonCodes: [] }
  | { eligible: false; reasonCodes: QualificationReasonCode[] };

function normalizeCapabilityLabel(value: string): string {
  return (value.split(/[:/#]/).pop() ?? value)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function requiredProbeChecksForModel(
  model: LogicalModelProfile
): DeploymentProbeCheck[] {
  const capabilities = new Set(
    [...model.capabilityRefs, ...model.capabilities.features].map(
      normalizeCapabilityLabel
    )
  );
  const required = new Set<DeploymentProbeCheck>([
    // These establish the baseline execution, safety and attribution contract
    // for every deployment that may enter automatic routing.
    "basicRequestResponse",
    "contextOutputLimits",
    "regionRetention",
    "credentialOwnership",
  ]);
  const requireIfDeclared = (
    check: DeploymentProbeCheck,
    declaredCapabilities: string[]
  ) => {
    if (declaredCapabilities.some(capability => capabilities.has(capability))) {
      required.add(check);
    }
  };

  requireIfDeclared("chatResponsesParity", ["chat_responses_parity"]);
  requireIfDeclared("streamingCancellation", [
    "streaming",
    "streaming_cancellation",
  ]);
  requireIfDeclared("toolsContinuation", ["tools", "tool_calling", "tool_use"]);
  requireIfDeclared("strictSchema", [
    "json_schema",
    "strict_json_schema",
    "strict_schema",
    "structured_output",
  ]);
  requireIfDeclared("reasoningUsage", [
    "reasoning",
    "reasoning_usage",
    "reasoning_tokens",
  ]);

  if (
    [...model.capabilities.inputModalities, ...model.capabilities.outputModalities]
      .some(modality => modality !== "text") ||
    capabilities.has("multimodal")
  ) {
    required.add("multimodal");
  }
  if (model.capabilities.toolContractRefs.length > 0) {
    required.add("toolsContinuation");
  }
  return [...required];
}

/**
 * Verifies source-of-record qualification evidence for a single model/deployment
 * pair. Catalog metadata alone can describe candidates but cannot certify them.
 */
export function evaluateDeploymentQualification(
  modelInput: unknown,
  deploymentInput: unknown,
  nowMs: number,
  maxProbeAgeMs = 24 * 60 * 60 * 1000
): QualificationResult {
  const reasons = new Set<QualificationReasonCode>();
  const rawDeployment =
    typeof deploymentInput === "object" && deploymentInput !== null
      ? (deploymentInput as Record<string, unknown>)
      : undefined;
  if (
    rawDeployment &&
    typeof rawDeployment.credentialOwnerRef === "string" &&
    !rawDeployment.credentialOwnerRef.trim()
  ) {
    reasons.add("CREDENTIAL_OWNER_MISSING");
  }
  if (!rawDeployment || !rawDeployment.price)
    reasons.add("PRICING_EVIDENCE_MISSING");

  const modelResult = logicalModelProfileSchema.safeParse(modelInput);
  const deploymentResult =
    providerDeploymentProfileSchema.safeParse(deploymentInput);
  if (!modelResult.success) reasons.add("MODEL_PROFILE_INVALID");
  if (!deploymentResult.success) reasons.add("DEPLOYMENT_PROFILE_INVALID");
  if (!modelResult.success || !deploymentResult.success) {
    return { eligible: false, reasonCodes: [...reasons].sort() };
  }

  const model = modelResult.data;
  const deployment = deploymentResult.data;
  const add = (condition: boolean, code: QualificationReasonCode) => {
    if (condition) reasons.add(code);
  };
  add(
    model.lifecycle !== "ACTIVE" || deployment.status !== "ACTIVE",
    "DEPLOYMENT_NOT_ACTIVE"
  );
  add(
    deployment.logicalModelId !== model.logicalModelId ||
      deployment.logicalModelRevision !== model.revision,
    "MODEL_REVISION_MISMATCH"
  );
  add(deployment.resolvedAliasRevision !== model.revision, "MODEL_ALIAS_DRIFT");
  add(deployment.probe.source !== "live_probe", "LIVE_PROBE_REQUIRED");
  add(
    deployment.probe.endpointSurface !== deployment.endpointSurface,
    "PROBE_SURFACE_MISMATCH"
  );
  add(
    deployment.probe.observedAtMs > nowMs ||
      deployment.probe.validUntilMs <= nowMs ||
      deployment.probe.validUntilMs <= deployment.probe.observedAtMs ||
      nowMs - deployment.probe.observedAtMs > maxProbeAgeMs,
    "PROBE_STALE"
  );
  add(
    requiredProbeChecksForModel(model).some(
      check => !deployment.probe.checks[check]
    ),
    "CAPABILITY_PROBE_FAILED"
  );
  add(
    model.capabilityRefs.some(
      capability => !deployment.probe.probedCapabilityRefs.includes(capability)
    ),
    "CAPABILITY_EVIDENCE_INCOMPLETE"
  );
  add(deployment.price.validUntilMs <= nowMs, "PRICE_STALE");

  const reasonCodes = [...reasons].sort();
  return reasonCodes.length === 0
    ? { eligible: true, reasonCodes: [] }
    : { eligible: false, reasonCodes };
}

export type QualifiedRouteCandidateResult =
  | { ok: true; candidate: RouteCandidate }
  | { ok: false; reasonCodes: QualificationReasonCode[] };

/**
 * Produces resolver input only from validated model/deployment profiles. Cost is
 * conservatively rounded up in integer micro-units; no floating-point billing math.
 */
export function buildQualifiedRouteCandidate(
  intent: InferenceIntentV2,
  modelInput: unknown,
  deploymentInput: unknown,
  nowMs: number,
  maxProbeAgeMs = 24 * 60 * 60 * 1000
): QualifiedRouteCandidateResult {
  const qualification = evaluateDeploymentQualification(
    modelInput,
    deploymentInput,
    nowMs,
    maxProbeAgeMs
  );
  if (!qualification.eligible)
    return { ok: false, reasonCodes: qualification.reasonCodes };

  const model = logicalModelProfileSchema.parse(modelInput);
  const deployment = providerDeploymentProfileSchema.parse(deploymentInput);
  const reasons = new Set<QualificationReasonCode>();
  if (
    deployment.healthObservedAtMs > nowMs ||
    nowMs - deployment.healthObservedAtMs > maxProbeAgeMs
  ) {
    reasons.add("DEPLOYMENT_HEALTH_STALE");
  }
  if (deployment.health !== "healthy" || deployment.status !== "ACTIVE")
    reasons.add("DEPLOYMENT_UNHEALTHY");
  if (!deployment.allowedRegions.includes(deployment.region))
    reasons.add("DEPLOYMENT_REGION_INVALID");

  const ceilPerMillion = (tokens: number, rateMicros: number): bigint =>
    (BigInt(tokens) * BigInt(rateMicros) + 999_999n) / 1_000_000n;
  const estimatedCost =
    ceilPerMillion(
      intent.inputTokenEstimate,
      deployment.price.inputMicrosPerMillion
    ) +
    ceilPerMillion(
      intent.outputTokenReserve,
      deployment.price.outputMicrosPerMillion
    );
  if (estimatedCost > BigInt(Number.MAX_SAFE_INTEGER))
    reasons.add("PRICE_ESTIMATE_OVERFLOW");
  if (reasons.size > 0) return { ok: false, reasonCodes: [...reasons].sort() };

  return {
    ok: true,
    candidate: {
      modelProfileId: model.logicalModelId,
      providerModelId: model.providerNativeModelId,
      deploymentId: deployment.deploymentId,
      providerId: deployment.providerId,
      credentialOwnerRef: deployment.credentialOwnerRef,
      endpointSurface: deployment.endpointSurface,
      executionSurface: deployment.executionSurface,
      qualification: "qualified",
      health: deployment.health,
      credentialStatus: "active",
      region: deployment.region,
      supportsZeroDataRetention: deployment.retention === "zero-data-retention",
      allowedPrivacyClasses: deployment.allowedPrivacyClasses,
      inputModalities: model.capabilities.inputModalities,
      outputModalities: model.capabilities.outputModalities,
      features: model.capabilities.features,
      toolContractRefs: model.capabilities.toolContractRefs,
      maxContextTokens: model.capabilities.maxContextTokens,
      maxOutputTokens: model.capabilities.maxOutputTokens,
      priceValidUntilMs: deployment.price.validUntilMs,
      estimatedCostMicros: Number(estimatedCost),
      latencyP95Ms: deployment.latencyP95Ms,
      qualityScorePpm: deployment.qualityScorePpm,
      reliabilityScorePpm: deployment.reliabilityScorePpm,
      compatibilityScorePpm: deployment.compatibilityScorePpm,
      scoreCalibrationRevision: deployment.scoreCalibrationRevision,
    },
  };
}
