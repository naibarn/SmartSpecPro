import { describe, expect, it } from "vitest";
import { mapResearchNeedToRequest } from "./researchAdapter";

const need = { researchNeedId: "need-1", decisionProjectRef: "project-1", factorRef: "flood-risk", reason: "LOW_COVERAGE" as const, materiality: "high" as const, preferredMode: "EVIDENCE_ACQUISITION" as const, dataRequirement: { semanticType: "flood.depth", geography: { kind: "region", ref: "TH-10" }, temporal: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, maximumCostCredits: 12, required: true }, maxCostCredits: 80, maxExternalCost: 50, maxWallTimeSeconds: 500, maxSources: 40, policyRef: "policy-1" };
const authority = { authorizationScope: "TENANT" as const, tenantId: "tenant-1", requestedBy: "user-1", resolvedProjectId: "project-1", activePolicy: { ref: "policy-1", privacyClass: "tenant_private", maxCostCredits: 20, maxExternalCost: 10, maxWallTimeSeconds: 120, maxSources: 8 }, platformCeilings: { maxCostCredits: 15, maxExternalCost: 8, maxWallTimeSeconds: 90, maxSources: 5 } };

describe("mapResearchNeedToRequest", () => {
  it("builds a bounded versioned 266 request using server identity and minimum budget ceilings", () => {
    const result = mapResearchNeedToRequest(need, authority);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.request).toMatchObject({ contractVersion: "spec266-research-v1", consumerKind: "DECISION_ANALYSIS", consumerRef: "need-1", projectId: "project-1", tenantId: "tenant-1", requestedBy: "user-1", outputPolicyRef: "policy-1", maxCostCredits: 12, maxExternalCost: 8, maxWallTimeSeconds: 90, maxSources: 5, geographyRefs: ["TH-10"], temporalRequirement: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" } });
    expect(result.value.request.researchRequestId).toHaveLength(36);
    expect(mapResearchNeedToRequest(need, authority)).toMatchObject({ ok: true, value: { request: { researchRequestId: result.value.request.researchRequestId, idempotencyKey: result.value.request.idempotencyKey } } });
  });

  it("rejects missing policy, mismatched tenant, changed project authority, and unknown mode", () => {
    expect(mapResearchNeedToRequest(need, { ...authority, activePolicy: undefined })).toMatchObject({ ok: false, code: "RESEARCH_POLICY_UNAVAILABLE" });
    expect(mapResearchNeedToRequest(need, { ...authority, tenantId: undefined })).toMatchObject({ ok: false, code: "RESEARCH_AUTHORITY_INVALID" });
    expect(mapResearchNeedToRequest({ ...need, decisionProjectRef: "other-project" }, authority)).toMatchObject({ ok: false, code: "RESEARCH_PROJECT_SCOPE_MISMATCH" });
    expect(mapResearchNeedToRequest({ ...need, preferredMode: "FREEFORM" as never }, authority)).toMatchObject({ ok: false, code: "RESEARCH_MODE_UNSUPPORTED" });
  });

  it("allows public scope only with explicit server-side public research policy", () => {
    const { tenantId: _tenantId, ...publicAuthorityBase } = authority;
    const publicAuthority = { ...publicAuthorityBase, authorizationScope: "PUBLIC" as const, activePolicy: { ...authority.activePolicy!, publicResearchAllowed: true } };
    const result = mapResearchNeedToRequest(need, publicAuthority);
    expect(result).toMatchObject({ ok: true, value: { request: { authorizationScope: "PUBLIC", projectId: "project-1" } } });
    if (result.ok) expect(result.value.request).not.toHaveProperty("tenantId");
    expect(mapResearchNeedToRequest(need, { ...publicAuthority, activePolicy: { ...publicAuthority.activePolicy, publicResearchAllowed: false } })).toMatchObject({ ok: false, code: "RESEARCH_POLICY_UNAVAILABLE" });
  });

  it("fails closed on cyclic or sparse caller-owned request data before deriving idempotency", () => {
    const cyclicRequirement: Record<string, unknown> = { semanticType: "flood.depth" };
    cyclicRequirement.self = cyclicRequirement;
    expect(mapResearchNeedToRequest({ ...need, dataRequirement: cyclicRequirement as never }, authority)).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });

    const sparseRights = new Array(2);
    sparseRights[0] = "public-domain";
    const policy = { ...authority.activePolicy!, rightsRequirements: sparseRights };
    expect(mapResearchNeedToRequest(need, { ...authority, activePolicy: policy })).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
  });

  it("bounds canonicalization of strings and property names before hashing", () => {
    expect(mapResearchNeedToRequest({ ...need, dataRequirement: { semanticType: "x".repeat(100_000) } }, authority)).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
    const largeKeyRequirement = { semanticType: "flood.depth", ["x".repeat(10_000)]: "value" };
    expect(mapResearchNeedToRequest({ ...need, dataRequirement: largeKeyRequirement }, authority)).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
  });

  it("keeps mapped request content and idempotency stable when the caller mutates the original need or policy", () => {
    const mutableRequirement = {
      semanticType: "flood.depth",
      geography: { kind: "region", ref: "TH-10" },
      requiredFields: ["depth"],
    };
    const mutableNeed = { ...need, dataRequirement: mutableRequirement };
    const mutablePolicy = { ...authority.activePolicy!, rightsRequirements: ["analysis"] };
    const mapped = mapResearchNeedToRequest(mutableNeed, { ...authority, activePolicy: mutablePolicy });
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) return;
    const originalIdempotency = mapped.value.request.idempotencyKey;

    mutableRequirement.geography.ref = "TH-99";
    mutableRequirement.requiredFields[0] = "other-field";
    mutablePolicy.rightsRequirements[0] = "changed-policy";
    expect(mapped.value.request.idempotencyKey).toBe(originalIdempotency);
    expect(mapped.value.request.dataRequirements).toMatchObject([{ geography: { ref: "TH-10" }, requiredFields: ["depth"] }]);
    expect(mapped.value.request.rightsRequirements).toEqual(["analysis"]);
  });
});
