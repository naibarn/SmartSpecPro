import { describe, expect, it } from "vitest";
import { inferenceIntentV2Schema } from "../contracts";
import {
  resolveInferenceRoute,
  type DeploymentCandidateInput,
} from "../routePlanner";
import type { InferenceAuthoritySnapshot } from "../policyResolver";
import { buildInferencePlan, type InferencePlanContext } from "../planFactory";

const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "req-route",
  traceId: "trace-route",
  tenantId: "tenant-a",
  principalId: "user-7",
  consumer: "chat",
  taskClass: "general-chat",
  purpose: "answer",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 1_000,
  outputTokenReserve: 500,
  requiredFeatures: ["streaming"],
  languageHints: ["th"],
  privacyClass: "tenant-confidential",
  residencyAllowlist: ["TH"],
  zdrRequired: true,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 20_000,
  maxEstimatedCostMicros: 50_000,
  selection: { mode: "AUTO" },
  policyRevision: "policy-1",
  budgetScopeRef: "tenant:tenant-a",
  idempotencyKey: "call:1",
});

const checks = {
  basicRequestResponse: true,
  chatResponsesParity: true,
  streamingCancellation: true,
  toolsContinuation: true,
  strictSchema: true,
  reasoningUsage: true,
  multimodal: true,
  contextOutputLimits: true,
  regionRetention: true,
  credentialOwnership: true,
};

function deploymentCandidate(
  deploymentId: string,
  providerId: string,
  quality: number,
  costRate: number
): DeploymentCandidateInput {
  return {
    model: {
      logicalModelId: "model:" + deploymentId,
      revision: "rev:1",
      providerNativeModelId: "native:v1",
      lifecycle: "ACTIVE",
      capabilityRefs: ["capability:chat"],
      capabilities: {
        inputModalities: ["text"],
        outputModalities: ["text"],
        features: ["streaming"],
        toolContractRefs: [],
        maxContextTokens: 32_000,
        maxOutputTokens: 8_000,
      },
    },
    deployment: {
      deploymentId,
      revision: "deploy-rev:1",
      logicalModelId: "model:" + deploymentId,
      logicalModelRevision: "rev:1",
      providerId,
      credentialOwnerRef: "credential-owner:platform",
      endpointSurface: "responses_compatible",
      executionSurface: "cloud",
      region: "TH",
      allowedRegions: ["TH"],
      allowedPrivacyClasses: ["tenant-confidential"],
      retention: "zero-data-retention",
      status: "ACTIVE",
      health: "healthy",
      healthObservedAtMs: 9_500,
      latencyP95Ms: 2_000,
      qualityScorePpm: quality,
      reliabilityScorePpm: 900_000,
      compatibilityScorePpm: 900_000,
      scoreCalibrationRevision: "scores:4",
      resolvedAliasRevision: "rev:1",
      probe: {
        source: "live_probe",
        endpointSurface: "responses_compatible",
        probeSuiteRevision: "probe:1",
        evidenceRef: "evidence:1",
        observedAtMs: 9_000,
        validUntilMs: 12_000,
        probedCapabilityRefs: ["capability:chat"],
        checks,
      },
      price: {
        currency: "USD_MICROS",
        inputMicrosPerMillion: costRate,
        outputMicrosPerMillion: costRate,
        snapshotRef: "price:1",
        validUntilMs: 12_000,
      },
    },
  };
}

const authority: InferenceAuthoritySnapshot = {
  tenantId: "tenant-a",
  principalId: "user-7",
  policyRevision: "policy-1",
  platformPolicyReady: true,
  tenantPolicyReady: true,
  emergencyRevocationFresh: true,
  budgetAuthorityReady: true,
  platformAllowedProviderIds: ["provider:a", "provider:b"],
  tenantAllowedProviderIds: ["provider:a", "provider:b"],
  principalAllowedProviderIds: ["provider:a", "provider:b"],
  allowedCredentialOwnerRefs: ["credential-owner:platform"],
  allowedRegions: ["TH"],
  requireZeroDataRetention: true,
  availableBudgetMicros: 50_000,
  revokedModelProfileIds: [],
  revokedDeploymentIds: [],
  observedAtMs: 10_000,
  registryRevision: "registry:3",
  routerPolicyRevision: "router:4",
  scoreCalibrationRevision: "scores:4",
  routingWeights: {
    qualityPpm: 800_000,
    costPpm: 50_000,
    latencyPpm: 50_000,
    reliabilityPpm: 50_000,
    compatibilityPpm: 50_000,
  },
};

describe("Spec 231 route planning pipeline", () => {
  it("fails closed when runtime authority data is malformed or from the future", () => {
    const malformed = {
      ...authority,
      routingWeights: { ...authority.routingWeights, costPpm: 1 },
    } as unknown as InferenceAuthoritySnapshot;
    expect(resolveInferenceRoute(intent, [], malformed, 10_000)).toMatchObject({
      status: "invalid_authority",
      reasonCode: "AUTHORITY_SNAPSHOT_INVALID",
    });
    expect(
      resolveInferenceRoute(
        intent,
        [],
        { ...authority, observedAtMs: 10_001 },
        10_000
      )
    ).toMatchObject({
      status: "invalid_authority",
      invalidFields: ["observedAtMs"],
    });
  });

  it("qualifies profiles, hard-filters candidates, and automatically selects an eligible route", () => {
    const result = resolveInferenceRoute(
      intent,
      [
        deploymentCandidate("deployment:a", "provider:a", 700_000, 1_000_000),
        deploymentCandidate("deployment:b", "provider:b", 950_000, 1_000_000),
      ],
      authority,
      10_000
    );
    expect(result).toMatchObject({
      status: "selected",
      candidate: { deploymentId: "deployment:b" },
    });
    expect(result.filterReceipt.routerPolicyRevision).toBe("router:4");
    if (result.status !== "selected")
      throw new Error("expected selected route");
    const context: InferencePlanContext = {
      planId: "plan:route-test",
      attemptBudget: 2,
      startedAtMs: Date.parse("2026-09-27T10:00:00.000Z"),
      overallDeadlineAt: "2026-09-27T10:01:00.000Z",
      fallbackPermission: "preapproved",
      preapprovedFallbackDeploymentIds: ["deployment:a"],
      cachePolicyId: "cache:no-store",
      creditReservationId: "reservation:test",
      parentCostCeilingMicros: 50_000,
      routePolicyRevision: "router:4",
      specRevision: "R4",
      rolloutBundleHash: "sha256:" + "a".repeat(64),
      logicalCallId: "call:route-test",
      attemptOwnershipEpoch: 1,
      residencyPolicySnapshotRef: "residency:test",
      routerFeatureProvenanceRef: "router:4",
    };
    expect(
      buildInferencePlan(
        intent,
        result.candidate,
        result.eligibleCandidates,
        authority,
        context
      )
    ).toMatchObject({
      ok: true,
      plan: {
        selectedDeploymentProfile: "deployment:b",
        fallbackCandidates: ["deployment:a"],
        attemptBudget: 2,
      },
    });
  });

  it("excludes unqualified or policy-denied profiles and reports reason codes without prompt content", () => {
    const result = resolveInferenceRoute(
      intent,
      [
        deploymentCandidate(
          "deployment:revoked",
          "provider:a",
          1_000_000,
          1_000_000
        ),
        deploymentCandidate(
          "deployment:stale",
          "provider:b",
          900_000,
          1_000_000
        ),
      ],
      { ...authority, revokedDeploymentIds: ["deployment:revoked"] },
      10_000
    );
    expect(result).toMatchObject({
      status: "selected",
      candidate: { deploymentId: "deployment:stale" },
    });
    expect(
      result.filterReceipt.candidates.find(
        item => item.deploymentId === "deployment:revoked"
      )?.reasonCodes
    ).toContain("ROUTE_REVOKED");

    const none = resolveInferenceRoute(
      intent,
      [
        deploymentCandidate(
          "deployment:old",
          "provider:a",
          1_000_000,
          1_000_000
        ),
      ],
      authority,
      30_000
    );
    expect(none).toMatchObject({
      status: "no_eligible_route",
      reasonCode: "NO_ELIGIBLE_ROUTE",
    });
    expect(JSON.stringify(none)).not.toContain("answer");
  });

  it("preserves explicit locks as consent-required or no-route outcomes", () => {
    const locked = inferenceIntentV2Schema.parse({
      ...intent,
      selection: {
        mode: "MODEL_LOCK",
        modelProfileId: "model:missing",
        fallback: "ask",
      },
    });
    expect(
      resolveInferenceRoute(
        locked,
        [deploymentCandidate("deployment:a", "provider:a", 800_000, 1_000_000)],
        authority,
        10_000
      )
    ).toMatchObject({
      status: "consent_required",
      reasonCode: "LOCKED_ROUTE_UNAVAILABLE",
    });
  });

  it("does not select when policy or routing weights are stale/invalid", () => {
    expect(
      resolveInferenceRoute(
        intent,
        [deploymentCandidate("deployment:a", "provider:a", 800_000, 1_000_000)],
        { ...authority, policyRevision: "policy:old" },
        10_000
      )
    ).toMatchObject({ status: "no_eligible_route" });
    expect(
      resolveInferenceRoute(
        intent,
        [deploymentCandidate("deployment:a", "provider:a", 800_000, 1_000_000)],
        {
          ...authority,
          routingWeights: { ...authority.routingWeights, costPpm: 0 },
        },
        10_000
      )
    ).toMatchObject({
      status: "invalid_authority",
      reasonCode: "AUTHORITY_SNAPSHOT_INVALID",
    });
  });

  it("rejects duplicate immutable deployment IDs instead of letting input order choose", () => {
    const first = deploymentCandidate(
      "deployment:duplicate",
      "provider:a",
      800_000,
      1_000_000
    );
    const collision = deploymentCandidate(
      "deployment:duplicate",
      "provider:b",
      900_000,
      1_000_000
    );
    const result = resolveInferenceRoute(
      intent,
      [first, collision],
      authority,
      10_000
    );
    expect(result).toMatchObject({
      status: "no_eligible_route",
      reasonCode: "DUPLICATE_DEPLOYMENT_PROFILE",
    });
    expect(result.qualificationExclusions[0].reasonCodes).toContain(
      "DEPLOYMENT_ID_CONFLICT"
    );
  });
});
