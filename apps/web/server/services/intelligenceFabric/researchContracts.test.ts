import { describe, expect, it } from "vitest";
import { parseDataRequirement, parseResearchRequest, parseResearchRun } from "./researchContracts";

const request = {
  contractVersion: "spec266-research-v1",
  researchRequestId: "req-01",
  idempotencyKey: "decision:project-01:need-01",
  authorizationScope: "TENANT",
  consumerKind: "DECISION_ANALYSIS",
  consumerRef: "need-01",
  tenantId: "tenant-01",
  requestedBy: "user-01",
  goal: "Find recent flood depth measurements",
  mode: "EVIDENCE_ACQUISITION",
  geographyRefs: ["TH-10"],
  maxCostCredits: 12,
  maxWallTimeSeconds: 300,
  maxSources: 5,
  privacyClass: "public-data-only",
  rightsRequirements: ["analysis"],
  outputPolicyRef: "policy-01",
};

describe("Spec 266 research contracts", () => {
  it("accepts explicit tenant-scoped, bounded requests", () => {
    expect(parseResearchRequest(request)).toMatchObject({ ok: true, value: request });
  });

  it("rejects implicit public scope and tenant scope without principal/tenant", () => {
    expect(parseResearchRequest({ ...request, authorizationScope: undefined })).toMatchObject({ ok: false, code: "RESEARCH_SCOPE_INVALID" });
    expect(parseResearchRequest({ ...request, authorizationScope: "TENANT", tenantId: undefined })).toMatchObject({ ok: false, code: "RESEARCH_SCOPE_INVALID" });
    expect(parseResearchRequest({ ...request, authorizationScope: "PUBLIC", tenantId: undefined, requestedBy: undefined })).toMatchObject({ ok: false, code: "RESEARCH_SCOPE_INVALID" });
  });

  it("rejects unknown contract versions, unbounded requests, and secret-shaped fields", () => {
    expect(parseResearchRequest({ ...request, contractVersion: "spec266-research-v99" })).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
    expect(parseResearchRequest({ ...request, apiKey: "secret" })).toMatchObject({ ok: false, code: "RESEARCH_UNKNOWN_FIELD" });
    expect(parseResearchRequest({ ...request, maxSources: 10_000 })).toMatchObject({ ok: false, code: "RESEARCH_BUDGET_INVALID" });
    expect(parseResearchRequest({ ...request, maxExternalCost: "unknown" })).toMatchObject({ ok: false, code: "RESEARCH_BUDGET_INVALID" });
    expect(parseResearchRequest({ ...request, researchRequestId: "r".repeat(37) })).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
    expect(parseResearchRequest({ ...request, requestedBy: "u".repeat(161) })).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
  });

  it("strictly validates requirement semantics, scope, time and numeric budgets", () => {
    const valid = { semanticType: "flood.depth", geography: { kind: "region", ref: "TH-10" }, temporal: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" }, maximumCostCredits: 5 };
    expect(parseDataRequirement(valid)).toMatchObject({ ok: true });
    expect(parseDataRequirement({ ...valid, maximumCostCredits: -1 })).toMatchObject({ ok: false });
    expect(parseDataRequirement({ ...valid, geography: { kind: "region" } })).toMatchObject({ ok: false });
    expect(parseDataRequirement({ ...valid, temporal: { from: "2026-10-02T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" } })).toMatchObject({ ok: false });
    expect(parseResearchRequest({ ...request, dataRequirements: [{ ...valid, maximumCostCredits: -1 }] })).toMatchObject({ ok: false, code: "RESEARCH_CONTRACT_INVALID" });
  });

  it("rejects sparse reference lists and nested data arrays instead of skipping holes", () => {
    const sparseRefs = new Array(2);
    sparseRefs[0] = "TH-10";
    const sparseRequirements = new Array(2);
    sparseRequirements[0] = { semanticType: "flood.depth" };
    const sparseFields = new Array(2);
    sparseFields[0] = "depth";

    expect(parseResearchRequest({ ...request, geographyRefs: sparseRefs })).toMatchObject({ ok: false });
    expect(parseResearchRequest({ ...request, dataRequirements: sparseRequirements })).toMatchObject({ ok: false });
    expect(parseDataRequirement({ semanticType: "flood.depth", requiredFields: sparseFields })).toMatchObject({ ok: false });
  });

  it("rejects the same provider being both preferred and prohibited", () => {
    expect(parseResearchRequest({ ...request, preferredProviderIds: ["provider-1"], prohibitedProviderIds: ["provider-1"] })).toMatchObject({
      ok: false, code: "RESEARCH_CONTRACT_INVALID",
    });
  });

  it("normalizes and freezes nested caller-owned data before returning a request", () => {
    const input = {
      ...request,
      geographyRefs: ["TH-10"],
      dataRequirements: [{ semanticType: "flood.depth", geography: { kind: "region", ref: "TH-10" }, requiredFields: ["depth"] }],
      temporalRequirement: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    };
    const parsed = parseResearchRequest(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    input.geographyRefs[0] = "TH-99";
    input.dataRequirements[0]!.geography.ref = "TH-99";
    input.dataRequirements[0]!.requiredFields[0] = "changed";
    input.temporalRequirement.from = "2026-10-01T00:00:00.000Z";
    expect(parsed.value).toMatchObject({
      geographyRefs: ["TH-10"],
      dataRequirements: [{ geography: { ref: "TH-10" }, requiredFields: ["depth"] }],
      temporalRequirement: { from: "2026-09-01T00:00:00.000Z" },
    });
    expect(Object.isFrozen(parsed.value)).toBe(true);
    expect(Object.isFrozen(parsed.value.dataRequirements?.[0]?.geography)).toBe(true);
  });

  it("accepts an immutable run receipt and rejects secret-bearing provider output", () => {
    const run = {
      contractVersion: "spec266-research-v1",
      researchRunId: "run-01",
      researchRequestId: "req-01",
      canonicalJobRef: "job-01",
      tenantId: "tenant-01",
      providerId: "provider-01",
      startedAt: "2026-10-01T00:00:00.000Z",
      status: "queued",
      toolReceiptRefs: [],
      artifactRefs: [],
      candidateRefs: [],
      sourceUrlsOrIds: [],
    };
    expect(parseResearchRun(run)).toMatchObject({ ok: true, value: run });
    expect(parseResearchRun({ ...run, credential: "secret" })).toMatchObject({ ok: false, code: "RESEARCH_UNKNOWN_FIELD" });
  });
});
