import { describe, expect, it } from "vitest";
import { inferenceIntentV2Schema } from "../contracts";
import {
  createCandidateFilterReceipt,
  evaluateInferenceEligibility,
  selectInferenceRoute,
  type InferenceAuthoritySnapshot,
  type RouteCandidate,
} from "../policyResolver";

const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "req-1",
  traceId: "trace-1",
  tenantId: "tenant-a",
  principalId: "user-7",
  consumer: "chat",
  taskClass: "general-chat",
  purpose: "answer-user",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 100,
  outputTokenReserve: 500,
  requiredFeatures: ["streaming"],
  languageHints: ["th"],
  privacyClass: "tenant-confidential",
  residencyAllowlist: ["TH"],
  zdrRequired: true,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 20_000,
  maxEstimatedCostMicros: 100_000,
  selection: { mode: "AUTO" },
  policyRevision: "policy-7",
  budgetScopeRef: "tenant:tenant-a",
  idempotencyKey: "request:abc123",
});

const candidate: RouteCandidate = {
  modelProfileId: "model:stable-v3",
  deploymentId: "deployment:account-a:v2",
  providerId: "provider:account-a",
  credentialOwnerRef: "credential-owner:platform",
  endpointSurface: "responses_compatible",
  executionSurface: "cloud",
  qualification: "qualified",
  health: "healthy",
  credentialStatus: "active",
  region: "TH",
  supportsZeroDataRetention: true,
  allowedPrivacyClasses: ["tenant-confidential"],
  inputModalities: ["text"],
  outputModalities: ["text"],
  features: ["streaming"],
  toolContractRefs: [],
  maxContextTokens: 32_000,
  maxOutputTokens: 8_000,
  priceValidUntilMs: 2_000,
  estimatedCostMicros: 10_000,
  latencyP95Ms: 2_000,
  qualityScorePpm: 700_000,
  reliabilityScorePpm: 800_000,
  compatibilityScorePpm: 900_000,
  scoreCalibrationRevision: "scores:2",
};

const authority: InferenceAuthoritySnapshot = {
  tenantId: "tenant-a",
  principalId: "user-7",
  policyRevision: "policy-7",
  platformPolicyReady: true,
  tenantPolicyReady: true,
  emergencyRevocationFresh: true,
  budgetAuthorityReady: true,
  platformAllowedProviderIds: ["provider:account-a"],
  tenantAllowedProviderIds: ["provider:account-a"],
  principalAllowedProviderIds: ["provider:account-a"],
  allowedCredentialOwnerRefs: ["credential-owner:platform"],
  allowedRegions: ["TH"],
  requireZeroDataRetention: false,
  availableBudgetMicros: 100_000,
  revokedModelProfileIds: [],
  revokedDeploymentIds: [],
  observedAtMs: 1_000,
  registryRevision: "registry-12",
  routerPolicyRevision: "router-policy-5",
  scoreCalibrationRevision: "scores:2",
  routingWeights: {
    qualityPpm: 800_000,
    costPpm: 50_000,
    latencyPpm: 50_000,
    reliabilityPpm: 50_000,
    compatibilityPpm: 50_000,
  },
};

describe("Spec 231 deterministic eligibility hard filters", () => {
  it("admits a fully qualified route from trusted policy snapshots", () => {
    expect(evaluateInferenceEligibility(intent, candidate, authority)).toEqual({
      eligible: true,
      reasonCodes: [],
    });
  });

  it("fails closed when any mandatory policy, revocation or budget authority is stale", () => {
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        platformPolicyReady: false,
      })
    ).toMatchObject({ eligible: false, reasonCodes: ["POLICY_NOT_READY"] });
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        emergencyRevocationFresh: false,
      })
    ).toMatchObject({ eligible: false, reasonCodes: ["POLICY_NOT_READY"] });
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        policyRevision: "policy-old",
      })
    ).toMatchObject({ eligible: false, reasonCodes: ["POLICY_NOT_READY"] });
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        budgetAuthorityReady: false,
      })
    ).toMatchObject({ eligible: false, reasonCodes: ["BUDGET_NOT_RESERVED"] });
  });

  it("cannot re-add a tenant-prohibited provider because it has a better score or price", () => {
    const result = evaluateInferenceEligibility(intent, candidate, {
      ...authority,
      tenantAllowedProviderIds: ["other-provider"],
    });

    expect(result).toEqual({
      eligible: false,
      reasonCodes: ["PROVIDER_NOT_ALLOWED"],
    });
  });

  it("filters revocation, qualification, credential ownership and deployment health", () => {
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        revokedDeploymentIds: [candidate.deploymentId],
      }).reasonCodes
    ).toContain("ROUTE_REVOKED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, qualification: "unqualified" },
        authority
      ).reasonCodes
    ).toContain("MODEL_REVISION_UNCERTIFIED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, credentialOwnerRef: "credential-owner:other" },
        authority
      ).reasonCodes
    ).toContain("CREDENTIAL_SCOPE_INVALID");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, health: "unavailable" },
        authority
      ).reasonCodes
    ).toContain("PROVIDER_UNAVAILABLE");
  });

  it("filters residency, privacy and zero-retention mismatches", () => {
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, region: "US" },
        authority
      ).reasonCodes
    ).toContain("RESIDENCY_NOT_ALLOWED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, allowedPrivacyClasses: ["public"] },
        authority
      ).reasonCodes
    ).toContain("PRIVACY_CLASS_NOT_ALLOWED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, supportsZeroDataRetention: false },
        authority
      ).reasonCodes
    ).toContain("ZERO_DATA_RETENTION_UNAVAILABLE");
    expect(
      evaluateInferenceEligibility(
        { ...intent, residencyAllowlist: [] },
        candidate,
        authority
      ).reasonCodes
    ).toContain("RESIDENCY_NOT_ALLOWED");
  });

  it("filters missing modality/features, context and output capability", () => {
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, inputModalities: ["image"] },
        authority
      ).reasonCodes
    ).toContain("INPUT_MODALITY_UNSUPPORTED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, features: [] },
        authority
      ).reasonCodes
    ).toContain("REQUIRED_FEATURE_UNSUPPORTED");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, maxContextTokens: 599 },
        authority
      ).reasonCodes
    ).toContain("CONTEXT_WINDOW_TOO_SMALL");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, maxOutputTokens: 100 },
        authority
      ).reasonCodes
    ).toContain("OUTPUT_BUDGET_UNSUPPORTED");
  });

  it("preserves model/provider/local/platform locks and never relaxes an explicit choice", () => {
    expect(
      evaluateInferenceEligibility(
        {
          ...intent,
          selection: {
            mode: "MODEL_LOCK",
            modelProfileId: "model:other",
            fallback: "preapproved_equivalent",
          },
        },
        candidate,
        authority
      ).reasonCodes
    ).toContain("MODEL_LOCK_MISMATCH");
    expect(
      evaluateInferenceEligibility(
        {
          ...intent,
          selection: {
            mode: "MODEL_LOCK",
            modelProfileId: candidate.modelProfileId,
            providerId: "provider:other",
            fallback: "none",
          },
        },
        candidate,
        authority
      ).reasonCodes
    ).toContain("MODEL_PROVIDER_LOCK_MISMATCH");
    expect(
      evaluateInferenceEligibility(
        {
          ...intent,
          selection: {
            mode: "PROVIDER_LOCK",
            providerId: "provider:other",
            fallback: "ask",
          },
        },
        candidate,
        authority
      ).reasonCodes
    ).toContain("PROVIDER_LOCK_MISMATCH");
    expect(
      evaluateInferenceEligibility(
        { ...intent, selection: { mode: "LOCAL_ONLY" } },
        candidate,
        authority
      ).reasonCodes
    ).toContain("LOCAL_ONLY_REQUIRED");
    expect(
      evaluateInferenceEligibility(
        { ...intent, selection: { mode: "PLATFORM_ONLY" } },
        { ...candidate, executionSurface: "local" },
        authority
      ).reasonCodes
    ).toContain("PLATFORM_ONLY_REQUIRED");
  });

  it("rejects stale prices, prices above the request cap and insufficient available budget", () => {
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, priceValidUntilMs: 999 },
        authority
      ).reasonCodes
    ).toContain("PRICE_SNAPSHOT_STALE");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, estimatedCostMicros: 100_001 },
        authority
      ).reasonCodes
    ).toContain("REQUEST_COST_CEILING_EXCEEDED");
    expect(
      evaluateInferenceEligibility(intent, candidate, {
        ...authority,
        availableBudgetMicros: 9_999,
      }).reasonCodes
    ).toContain("BUDGET_NOT_RESERVED");
  });

  it("rejects candidates whose measured p95 cannot meet the caller deadline", () => {
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, latencyP95Ms: 20_001 },
        authority
      ).reasonCodes
    ).toContain("DEADLINE_UNACHIEVABLE");
  });

  it("fails closed when weighted quality evidence is missing or from a stale calibration", () => {
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, qualityScorePpm: undefined },
        authority
      ).reasonCodes
    ).toContain("ROUTING_SCORE_MISSING");
    expect(
      evaluateInferenceEligibility(
        intent,
        { ...candidate, scoreCalibrationRevision: "scores:old" },
        authority
      ).reasonCodes
    ).toContain("ROUTING_SCORE_STALE");
    const costLatencyOnly = {
      ...authority,
      routingWeights: {
        qualityPpm: 0,
        costPpm: 800_000,
        latencyPpm: 200_000,
        reliabilityPpm: 0,
        compatibilityPpm: 0,
      },
    };
    expect(
      evaluateInferenceEligibility(
        intent,
        {
          ...candidate,
          qualityScorePpm: undefined,
          reliabilityScorePpm: undefined,
          compatibilityScorePpm: undefined,
          scoreCalibrationRevision: undefined,
        },
        costLatencyOnly
      )
    ).toEqual({ eligible: true, reasonCodes: [] });
  });

  it("automatically selects deterministically from eligible candidates only", () => {
    const cheap = {
      ...candidate,
      deploymentId: "deployment:cheap",
      estimatedCostMicros: 5_000,
      qualityScorePpm: 600_000,
    };
    const higherQuality = {
      ...candidate,
      deploymentId: "deployment:quality",
      estimatedCostMicros: 20_000,
      qualityScorePpm: 900_000,
    };
    const prohibited = {
      ...candidate,
      deploymentId: "deployment:blocked",
      providerId: "provider:blocked",
      qualityScorePpm: 1_000_000,
    };
    const result = selectInferenceRoute(
      intent,
      [cheap, prohibited, higherQuality],
      authority
    );

    expect(result).toMatchObject({ status: "selected", eligibleCount: 2 });
    if (result.status === "selected")
      expect(result.candidate.deploymentId).toBe("deployment:quality");
    expect(
      selectInferenceRoute(intent, [higherQuality, cheap], authority)
    ).toMatchObject({ status: "selected", candidate: higherQuality });
    const costWeighted = {
      ...authority,
      routingWeights: {
        qualityPpm: 50_000,
        costPpm: 800_000,
        latencyPpm: 50_000,
        reliabilityPpm: 50_000,
        compatibilityPpm: 50_000,
      },
    };
    expect(
      selectInferenceRoute(intent, [higherQuality, cheap], costWeighted)
    ).toMatchObject({ status: "selected", candidate: cheap });
    expect(
      selectInferenceRoute(
        intent,
        [{ ...cheap, qualityScorePpm: Number.MAX_VALUE }, higherQuality],
        authority
      )
    ).toMatchObject({ status: "selected", candidate: higherQuality });
    expect(
      selectInferenceRoute(intent, [higherQuality, cheap], {
        ...authority,
        routingWeights: { ...authority.routingWeights, qualityPpm: 900_000 },
      })
    ).toEqual({
      status: "no_eligible_route",
      reasonCode: "ROUTING_POLICY_INVALID",
    });
  });

  it("does not relax locked choices and returns consent-required when requested", () => {
    const locked = {
      ...intent,
      selection: {
        mode: "PROVIDER_LOCK" as const,
        providerId: "provider:missing",
        fallback: "ask" as const,
      },
    };
    expect(selectInferenceRoute(locked, [candidate], authority)).toEqual({
      status: "consent_required",
      reasonCode: "LOCKED_ROUTE_UNAVAILABLE",
    });
    expect(
      selectInferenceRoute(
        intent,
        [{ ...candidate, providerId: "provider:blocked" }],
        authority
      )
    ).toEqual({ status: "no_eligible_route", reasonCode: "NO_ELIGIBLE_ROUTE" });
  });

  it("creates deterministic, content-free filter receipts with pinned policy revisions", () => {
    const receipt = createCandidateFilterReceipt(
      intent,
      [candidate, { ...candidate, deploymentId: "deployment:revoked" }],
      {
        ...authority,
        revokedDeploymentIds: ["deployment:revoked"],
      }
    );
    expect(receipt).toEqual({
      policyRevision: "policy-7",
      registryRevision: "registry-12",
      routerPolicyRevision: "router-policy-5",
      scoreCalibrationRevision: "scores:2",
      observedAtMs: 1_000,
      candidates: [
        {
          modelProfileId: "model:stable-v3",
          deploymentId: "deployment:account-a:v2",
          eligible: true,
          reasonCodes: [],
        },
        {
          modelProfileId: "model:stable-v3",
          deploymentId: "deployment:revoked",
          eligible: false,
          reasonCodes: ["ROUTE_REVOKED"],
        },
      ],
    });
    expect(JSON.stringify(receipt)).not.toContain("answer-user");
  });
});
