import { describe, expect, it } from "vitest";
import { inferenceIntentV2Schema } from "../contracts";
import { buildInferencePlan, type InferencePlanContext } from "../planFactory";
import type {
  InferenceAuthoritySnapshot,
  RouteCandidate,
} from "../policyResolver";

const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "req-plan",
  traceId: "trace-plan",
  tenantId: "tenant-a",
  principalId: "user-7",
  consumer: "chat",
  taskClass: "general-chat",
  purpose: "answer",
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
  idempotencyKey: "request:plan",
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
  platformAllowedProviderIds: [candidate.providerId],
  tenantAllowedProviderIds: [candidate.providerId],
  principalAllowedProviderIds: [candidate.providerId],
  allowedCredentialOwnerRefs: [candidate.credentialOwnerRef],
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

const context: InferencePlanContext = {
  planId: "plan:one",
  attemptBudget: 2,
  startedAtMs: 1_000,
  overallDeadlineAt: "2026-09-27T10:01:00.000Z",
  fallbackPermission: "preapproved",
  preapprovedFallbackDeploymentIds: ["deployment:account-b:v1"],
  cachePolicyId: "cache:no-store-private",
  creditReservationId: "reservation:42",
  parentCostCeilingMicros: 80_000,
  routePolicyRevision: "router-policy-5",
  specRevision: "R4",
  rolloutBundleHash: `sha256:${"a".repeat(64)}`,
  logicalCallId: "call:one",
  attemptOwnershipEpoch: 1,
  residencyPolicySnapshotRef: "residency:9",
  routerFeatureProvenanceRef: "router:static-v1",
};

describe("Spec 231 immutable plan factory", () => {
  it("creates a validated immutable plan with a content-free intent hash and bounded fallbacks", () => {
    const result = buildInferencePlan(
      intent,
      candidate,
      [candidate, { ...candidate, deploymentId: "deployment:account-b:v1" }],
      authority,
      context
    );
    expect(result).toMatchObject({
      ok: true,
      plan: {
        planId: "plan:one",
        policyRevision: "policy-7",
        registryRevision: "registry-12",
        selectedModelProfile: candidate.modelProfileId,
        selectedDeploymentProfile: candidate.deploymentId,
        endpointSurface: "responses_compatible",
        fallbackCandidates: ["deployment:account-b:v1"],
        fallbackPermission: "preapproved",
        creditReservationId: "reservation:42",
        estimatedCostMicros: 10_000,
        attemptBudget: 2,
      },
    });
    if (result.ok) {
      expect(result.plan.intentHash).toMatch(/^sha256:[a-f0-9]{64}$/);
      expect(Object.isFrozen(result.plan)).toBe(true);
      expect(JSON.stringify(result.plan)).not.toContain("answer");
    }
  });

  it("rejects a fallback chain whose worst-case cumulative cost exceeds the parent ceiling", () => {
    const result = buildInferencePlan(
      intent,
      candidate,
      [
        candidate,
        {
          ...candidate,
          deploymentId: "deployment:account-b:v1",
          estimatedCostMicros: 80_000,
        },
      ],
      authority,
      context
    );
    expect(result).toEqual({ ok: false, code: "PLAN_COST_CEILING_EXCEEDED" });
  });

  it("rechecks selected route eligibility instead of minting plans from stale or prohibited candidates", () => {
    expect(
      buildInferencePlan(
        intent,
        candidate,
        [candidate],
        { ...authority, emergencyRevocationFresh: false },
        context
      )
    ).toEqual({
      ok: false,
      code: "ROUTE_NOT_ELIGIBLE",
      reasonCodes: ["POLICY_NOT_READY"],
    });
  });

  it("rejects unapproved fallback candidates and over-budget plan ceilings", () => {
    expect(
      buildInferencePlan(
        intent,
        candidate,
        [candidate, { ...candidate, deploymentId: "deployment:unknown" }],
        authority,
        context
      )
    ).toMatchObject({
      ok: false,
      code: "FALLBACK_NOT_PREAPPROVED",
    });
    expect(
      buildInferencePlan(
        intent,
        { ...candidate, estimatedCostMicros: 80_001 },
        [candidate],
        authority,
        context
      )
    ).toMatchObject({
      ok: false,
      code: "PLAN_COST_CEILING_EXCEEDED",
    });
    expect(
      buildInferencePlan(
        intent,
        candidate,
        [candidate, { ...candidate, providerId: "provider:other" }],
        authority,
        context
      )
    ).toMatchObject({
      ok: false,
      code: "CANDIDATE_ID_CONFLICT",
    });
  });

  it("does not turn ask or a locked no-fallback selection into automatic retries", () => {
    const askContext = { ...context, fallbackPermission: "ask" as const };
    expect(
      buildInferencePlan(
        intent,
        candidate,
        [candidate, { ...candidate, deploymentId: "deployment:account-b:v1" }],
        authority,
        askContext
      )
    ).toMatchObject({
      ok: true,
      plan: {
        fallbackCandidates: [],
        fallbackPermission: "ask",
        attemptBudget: 1,
      },
    });
    const lockedIntent = inferenceIntentV2Schema.parse({
      ...intent,
      selection: {
        mode: "MODEL_LOCK",
        modelProfileId: candidate.modelProfileId,
        fallback: "none",
      },
    });
    expect(
      buildInferencePlan(lockedIntent, candidate, [candidate], authority, {
        ...context,
        fallbackPermission: "preapproved",
      })
    ).toMatchObject({
      ok: false,
      code: "LOCK_FALLBACK_POLICY_MISMATCH",
    });
  });
});
