import { beforeEach, describe, expect, it, vi } from "vitest";

const registryState = vi.hoisted(() => ({
  result: null as unknown,
}));

vi.mock("../profileRegistry", () => ({
  loadInferenceProfileRegistry: async () => registryState.result,
}));

import { inferenceIntentV2Schema } from "../contracts";
import { planInferenceRouteFromRegistry } from "../registryRoutePlanner";
import type { InferenceAuthoritySnapshot } from "../policyResolver";

const intent = inferenceIntentV2Schema.parse({
  contract: "SAH-INFERENCE-2",
  requestId: "req-registry-route",
  traceId: "trace-registry-route",
  tenantId: "tenant-a",
  principalId: "user-7",
  consumer: "chat",
  taskClass: "general-chat",
  purpose: "answer",
  inputModalities: ["text"],
  outputModalities: ["text"],
  inputTokenEstimate: 100,
  outputTokenReserve: 100,
  requiredFeatures: [],
  languageHints: ["th"],
  privacyClass: "tenant-confidential",
  residencyAllowlist: ["TH"],
  zdrRequired: true,
  qualityClass: "standard",
  risk: "low",
  latencyDeadlineMs: 10_000,
  maxEstimatedCostMicros: 10_000,
  selection: { mode: "AUTO" },
  policyRevision: "policy-1",
  budgetScopeRef: "tenant:tenant-a",
  idempotencyKey: "route-registry:1",
});

const authority: InferenceAuthoritySnapshot = {
  tenantId: "tenant-a",
  principalId: "user-7",
  policyRevision: "policy-1",
  platformPolicyReady: true,
  tenantPolicyReady: true,
  emergencyRevocationFresh: true,
  budgetAuthorityReady: true,
  platformAllowedProviderIds: [],
  tenantAllowedProviderIds: [],
  principalAllowedProviderIds: [],
  allowedCredentialOwnerRefs: [],
  allowedRegions: ["TH"],
  requireZeroDataRetention: true,
  availableBudgetMicros: 10_000,
  revokedModelProfileIds: [],
  revokedDeploymentIds: [],
  observedAtMs: 10_000,
  registryRevision: "registry:authority",
  routerPolicyRevision: "router:1",
  scoreCalibrationRevision: "scores:1",
  routingWeights: {
    qualityPpm: 800_000,
    costPpm: 50_000,
    latencyPpm: 50_000,
    reliabilityPpm: 50_000,
    compatibilityPpm: 50_000,
  },
};

describe("registry-backed inference route planning", () => {
  beforeEach(() => {
    registryState.result = {
      ok: true,
      profiles: [],
      invalidProfileIds: [],
      registryRevision: "registry:profiles-1",
      observedAtMs: 10_000,
    };
  });

  it("binds the current profile registry revision to an automatic route result", async () => {
    await expect(
      planInferenceRouteFromRegistry({ intent, authority, nowMs: 10_000 })
    ).resolves.toMatchObject({
      status: "planned",
      registryRevision: "registry:profiles-1",
      route: { status: "no_eligible_route", reasonCode: "NO_ELIGIBLE_ROUTE" },
    });
  });

  it("fails closed without planning when the profile registry cannot be read", async () => {
    registryState.result = {
      ok: false,
      code: "PROFILE_REGISTRY_UNAVAILABLE",
    };
    await expect(
      planInferenceRouteFromRegistry({ intent, authority, nowMs: 10_000 })
    ).resolves.toEqual({
      status: "registry_unavailable",
      reasonCode: "PROFILE_REGISTRY_UNAVAILABLE",
    });
  });
});
