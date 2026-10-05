import { describe, expect, it } from "vitest";
import { buildEvidencePlan, type PlannedRequirement } from "./evidencePlan";

const offer = {
  id: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1", semanticTypes: ["flood.depth"],
  geographyRefs: ["TH-10"], temporalCoverage: {}, freshness: { observedAt: "2026-10-01T00:00:00.000Z", staleAfterSeconds: 86400 },
  sourceHealth: {
    contractVersion: "spec266-source-health-v1" as const, sourceId: "source-1", datasetId: "dataset-1", offerId: "offer-1",
    assessedAt: "2026-10-01T00:50:00.000Z", validUntil: "2026-10-01T01:05:00.000Z",
    dimensions: { connectivity: "healthy" as const, schema: "healthy" as const, semantic: "healthy" as const, freshness: "healthy" as const, rights: "healthy" as const, placement: "healthy" as const, index: "healthy" as const },
  }, rights: { status: "granted" as const, commercialUse: true, redistributable: true, contentHydrationAllowed: false, policyVersion: "rights-r1" }, healthPolicyVersion: "rights-r1",
  acl: { allowed: true, authorizationScope: "PUBLIC" as const }, estimatedCost: { kind: "known" as const, credits: 3 },
  estimatedLatencyMs: 100, qualityScore: 0.8, placement: "cloudflare", mode: "query" as const,
};

const requirement: PlannedRequirement = {
  id: "river-depth", required: true, priority: 10,
  requirement: { semanticType: "flood.depth", geography: { kind: "region", ref: "TH-10" } },
};

describe("buildEvidencePlan", () => {
  it("binds eligible offers by reference and reports explicit missing requirements", () => {
    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1", maxCostCredits: 5 });
    expect(plan.bindings).toEqual([{ requirementId: "river-depth", offerId: "offer-1", sourceRef: "source-1", datasetRef: "dataset-1" }]);
    expect(plan.missing).toEqual([]);
    expect(plan.estimatedCostCredits).toBe(3);
    expect(plan.readiness).toBe("ready");
  });

  it("keeps unknown-cost candidates visible but does not admit them into an automatic plan", () => {
    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "unknown" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
    expect(plan.bindings).toEqual([]);
    expect(plan.missing[0]).toMatchObject({ requirementId: "river-depth", code: "COST_REVIEW_REQUIRED", candidateOfferIds: ["offer-1"] });
    expect(plan.estimatedCostCredits).toBe(0);
    expect(plan.readiness).toBe("blocked");
  });

  it("treats a cost above the caller's authorized budget as a missing gap", () => {
    const plan = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "known", credits: 6 } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1", maxCostCredits: 5 });
    expect(plan.bindings).toEqual([]);
    expect(plan.missing[0]?.code).toBe("COST_LIMIT_EXCEEDED");
    expect(plan.estimatedCostCredits).toBe(0);
  });

  it("requires an explicit budget before admitting a paid offer", () => {
    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
    expect(plan.bindings).toEqual([]);
    expect(plan.missing[0]).toMatchObject({ code: "COST_REVIEW_REQUIRED", candidateOfferIds: ["offer-1"] });
    expect(plan.readiness).toBe("blocked");
    const free = buildEvidencePlan({ requirements: [requirement], offers: [{ ...offer, estimatedCost: { kind: "zero" } }], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" });
    expect(free.readiness).toBe("ready");
  });

  it("rejects duplicate requirement ids and does not imply public scope", () => {
    expect(() => buildEvidencePlan({ requirements: [requirement, requirement], offers: [offer], now: new Date(), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1" })).toThrow("EVIDENCE_PLAN_INVALID");
    const plan = buildEvidencePlan({ requirements: [requirement], offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), currentPolicyVersion: "rights-r1" });
    expect(plan.missing[0]?.code).toBe("AUTHORIZATION_SCOPE_REQUIRED");
  });

  it("rejects malformed DataRequirement content even when called outside ResearchRequest parsing", () => {
    expect(() => buildEvidencePlan({
      requirements: [{ ...requirement, requirement: { semanticType: "flood.depth", minimumCoverage: -0.2 } }],
      offers: [offer], now: new Date("2026-10-01T01:00:00.000Z"), authorizationScope: "PUBLIC", currentPolicyVersion: "rights-r1",
    })).toThrow("DATA_REQUIREMENT_INVALID");
  });
});
