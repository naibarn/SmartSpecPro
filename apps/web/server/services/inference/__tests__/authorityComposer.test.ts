import { describe, expect, it } from "vitest";
import {
  composeInferenceAuthority,
  type InferenceAuthoritySources,
} from "../authorityComposer";

const source = (): InferenceAuthoritySources => {
  const layer = {
    tenantId: "tenant-1",
    principalId: "user-1",
    observedAtMs: 10_000,
    ready: true,
    allowedProviderIds: ["provider-a", "provider-b"],
    allowedRegions: ["TH", "SG"],
    allowedCredentialOwnerRefs: ["platform:shared", "tenant:tenant-1"],
    requireZeroDataRetention: false,
  };
  return {
    platform: { ...layer, revision: "platform:1" },
    tenant: {
      ...layer,
      revision: "tenant:2",
      allowedProviderIds: ["provider-b", "provider-c"],
      allowedRegions: ["TH"],
      requireZeroDataRetention: true,
    },
    principal: {
      ...layer,
      revision: "principal:3",
      allowedProviderIds: ["provider-b"],
      allowedCredentialOwnerRefs: ["platform:shared"],
    },
    revocations: {
      tenantId: "tenant-1",
      principalId: "user-1",
      revision: "revocations:4",
      observedAtMs: 10_000,
      fresh: true,
      revokedModelProfileIds: ["model:revoked"],
      revokedDeploymentIds: ["deployment:revoked"],
    },
    budget: {
      tenantId: "tenant-1",
      principalId: "user-1",
      revision: "budget:5",
      observedAtMs: 10_000,
      ready: true,
      availableBudgetMicros: 80_000,
    },
    registry: { revision: "registry:6", observedAtMs: 10_000 },
    router: {
      revision: "router:7",
      scoreCalibrationRevision: "scores:8",
      routingWeights: {
        qualityPpm: 700_000,
        costPpm: 100_000,
        latencyPpm: 100_000,
        reliabilityPpm: 50_000,
        compatibilityPpm: 50_000,
      },
    },
  };
};

describe("composeInferenceAuthority", () => {
  it("intersects provider, region and credential scopes and unions revocations", () => {
    const result = composeInferenceAuthority(source(), 10_100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot).toMatchObject({
      platformAllowedProviderIds: ["provider-a", "provider-b"],
      tenantAllowedProviderIds: ["provider-b"],
      principalAllowedProviderIds: ["provider-b"],
      allowedRegions: ["TH"],
      allowedCredentialOwnerRefs: ["platform:shared"],
      requireZeroDataRetention: true,
      availableBudgetMicros: 80_000,
      revokedModelProfileIds: ["model:revoked"],
      revokedDeploymentIds: ["deployment:revoked"],
      emergencyRevocationFresh: true,
    });
  });

  it("does not admit provider or region values absent from one policy layer", () => {
    const sources = source();
    sources.principal.allowedProviderIds = [];
    sources.tenant.allowedRegions = [];
    const result = composeInferenceAuthority(sources, 10_100);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.principalAllowedProviderIds).toEqual([]);
    expect(result.snapshot.allowedRegions).toEqual([]);
  });

  it("returns a not-ready snapshot when any mandatory authority source is stale", () => {
    const sources = source();
    sources.revocations.observedAtMs = 1;
    const result = composeInferenceAuthority(sources, 70_001);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.snapshot.emergencyRevocationFresh).toBe(false);
    expect(result.snapshot.tenantPolicyReady).toBe(false);
    expect(result.snapshot.budgetAuthorityReady).toBe(false);
  });

  it("rejects mismatched tenant/principal scope instead of combining authorities", () => {
    const sources = source();
    sources.budget.tenantId = "tenant-elsewhere";
    expect(composeInferenceAuthority(sources, 10_100)).toEqual({
      ok: false,
      reason: "AUTHORITY_SCOPE_MISMATCH",
    });
  });

  it("rejects incomplete policy lists and invalid routing weights", () => {
    const incomplete = source();
    incomplete.tenant.allowedProviderIds = ["provider-b", ""];
    expect(composeInferenceAuthority(incomplete, 10_100)).toEqual({
      ok: false,
      reason: "AUTHORITY_SOURCE_INVALID",
    });

    const invalidWeights = source();
    invalidWeights.router.routingWeights.costPpm = 0;
    expect(composeInferenceAuthority(invalidWeights, 10_100)).toEqual({
      ok: false,
      reason: "AUTHORITY_SOURCE_INVALID",
    });
  });
});
