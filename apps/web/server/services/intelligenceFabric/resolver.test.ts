import { describe, expect, it } from "vitest";
import { resolveDataRequirement, type DataOffer, type DataRequirement } from "./resolver";

const requirement: DataRequirement = {
  semanticType: "flood.depth",
  geography: { kind: "region", ref: "TH-10" },
  temporal: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
  required: true,
};

function offer(overrides: Partial<DataOffer> = {}): DataOffer {
  const base = {
    id: "offer-1",
    sourceRef: "source-1",
    datasetRef: "dataset-1",
    semanticTypes: ["flood.depth"],
    geographyRefs: ["TH-10"],
    temporalCoverage: { from: "2026-09-01T00:00:00.000Z", to: "2026-10-01T00:00:00.000Z" },
    freshness: { observedAt: "2026-09-30T00:00:00.000Z", staleAfterSeconds: 172800 },
    rights: { status: "granted", commercialUse: true, redistributable: true },
    acl: { allowed: true, authorizationScope: "PUBLIC" },
    estimatedCost: { kind: "known", credits: 0 },
    estimatedLatencyMs: 200,
    qualityScore: 0.9,
    placement: "cloudflare",
    mode: "query",
    ...overrides,
  };
  return {
    ...base,
    sourceHealth: overrides.sourceHealth ?? {
      contractVersion: "spec266-source-health-v1",
      sourceId: base.sourceRef,
      datasetId: base.datasetRef,
      offerId: base.id,
      assessedAt: "2026-10-01T00:00:00.000Z",
      validUntil: "2026-10-01T00:15:00.000Z",
      dimensions: { connectivity: "healthy", schema: "healthy", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "healthy" },
    },
  };
}

describe("resolveDataRequirement", () => {
  it("selects eligible offers by quality then known cost while keeping unknown cost distinct", () => {
    const result = resolveDataRequirement(requirement, [
      offer({ id: "unknown-cost", estimatedCost: { kind: "unknown" }, qualityScore: 0.8 }),
      offer({ id: "cheap", estimatedCost: { kind: "known", credits: 1 }, qualityScore: 0.8 }),
      offer({ id: "free", estimatedCost: { kind: "known", credits: 0 }, qualityScore: 0.8 }),
    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });

    expect(result.selected?.id).toBe("free");
    expect(result.eligible.map(item => item.id)).toEqual(["free", "cheap", "unknown-cost"]);
    expect(result.satisfied).toBe(true);
  });

  it("fails closed for ACL, rights, geography, semantics, stale and unhealthy offers", () => {
    const offers = [
      offer({ id: "acl", acl: { allowed: false, authorizationScope: "PUBLIC" } }),
      offer({ id: "rights", rights: { status: "unknown", commercialUse: true, redistributable: true } }),
      offer({ id: "geo", geographyRefs: ["TH-11"] }),
      offer({ id: "semantic", semanticTypes: ["rainfall.total"] }),
      offer({ id: "stale", freshness: { observedAt: "2026-01-01T00:00:00.000Z", staleAfterSeconds: 60 } }),
      offer({ id: "future-clock", freshness: { observedAt: "2026-10-02T00:00:00.000Z", staleAfterSeconds: 60 } }),
      offer({ id: "degraded", sourceHealth: {
        contractVersion: "spec266-source-health-v1", sourceId: "source-1", datasetId: "dataset-1", offerId: "degraded",
        assessedAt: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-01T00:15:00.000Z",
        dimensions: { connectivity: "healthy", schema: "degraded", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "healthy" },
      } }),
    ];

    const result = resolveDataRequirement(requirement, offers, {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    });
    expect(result.satisfied).toBe(false);
    expect(result.selected).toBeUndefined();
    expect(result.unsatisfiedReason).toBe("NO_ELIGIBLE_OFFER");
    expect(result.rejections.map(item => item.code)).toEqual(expect.arrayContaining([
      "ACL_DENIED", "RIGHTS_UNVERIFIED", "GEOGRAPHY_MISMATCH", "SEMANTIC_MISMATCH", "OFFER_STALE", "SOURCE_SCHEMA_DRIFT",
    ]));
  });

  it("does not treat an omitted tenant as public authorization", () => {
    const result = resolveDataRequirement(requirement, [offer()], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: undefined,
    });
    expect(result.satisfied).toBe(false);
    expect(result.rejections[0]?.code).toBe("AUTHORIZATION_SCOPE_REQUIRED");
  });

  it("accepts only the matching tenant-owned offer and rejects another tenant's offer", () => {
    const tenantOffer = offer({ acl: { allowed: true, authorizationScope: "TENANT", tenantId: "tenant-a" } });
    const own = resolveDataRequirement(requirement, [tenantOffer], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "TENANT", tenantId: "tenant-a",
    });
    const other = resolveDataRequirement(requirement, [tenantOffer], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "TENANT", tenantId: "tenant-b",
    });

    expect(own).toMatchObject({ satisfied: true, selected: { id: "offer-1" } });
    expect(other).toMatchObject({ satisfied: false, rejections: [{ code: "AUTHORIZATION_SCOPE_MISMATCH" }] });
  });

  it("applies rights changes from the current offer snapshot and fails closed after revocation", () => {
    const revoked = resolveDataRequirement(requirement, [offer({ rights: { status: "forbidden", commercialUse: true, redistributable: true } })], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    });
    const unverified = resolveDataRequirement(requirement, [offer({ rights: { status: "unknown", commercialUse: true, redistributable: true } })], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    });

    expect(revoked).toMatchObject({ satisfied: false, rejections: [{ code: "RIGHTS_FORBIDDEN" }] });
    expect(unverified).toMatchObject({ satisfied: false, rejections: [{ code: "RIGHTS_UNVERIFIED" }] });
  });

  it("honors explicit commercial, redistribution and budget requirements", () => {
    const result = resolveDataRequirement({ ...requirement, commercialUseRequired: true, redistributableRequired: true, maximumCostCredits: 2 }, [
      offer({ id: "noncommercial", rights: { status: "granted", commercialUse: false, redistributable: true } }),
      offer({ id: "over-budget", estimatedCost: { kind: "known", credits: 3 } }),
    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });
    expect(result.satisfied).toBe(false);
    expect(result.rejections.map(item => item.code)).toEqual(expect.arrayContaining(["COMMERCIAL_USE_FORBIDDEN", "COST_LIMIT_EXCEEDED"]));
  });

  it("rejects malformed offer economics and keeps placement failures distinct from privacy", () => {
    const result = resolveDataRequirement(requirement, [
      offer({ id: "negative-cost", estimatedCost: { kind: "known", credits: -1 } }),
      offer({ id: "bad-quality", qualityScore: Number.POSITIVE_INFINITY }),
      offer({ id: "disallowed-placement", placement: "origin-only" }),
    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC", allowedPlacements: ["cloudflare"] });
    expect(result.eligible).toEqual([]);
    expect(result.rejections.map(item => item.code)).toEqual(expect.arrayContaining(["OFFER_INVALID", "PLACEMENT_UNAVAILABLE"]));
  });

  it("rejects contradictory or noncanonical offer temporal coverage even without a time requirement", () => {
    const result = resolveDataRequirement({ semanticType: "flood.depth" }, [
      offer({ temporalCoverage: { from: "2026-10-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }),
      offer({ id: "noncanonical", temporalCoverage: { from: "2026-09-01", to: "2026-10-01T00:00:00.000Z" } }),
    ], { now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC" });
    expect(result.eligible).toEqual([]);
    expect(result.rejections).toEqual([{ offerId: "offer-1", code: "OFFER_INVALID" }, { offerId: "noncanonical", code: "OFFER_INVALID" }]);
  });

  it("does not let index degradation block deterministic query, but blocks discovery", () => {
    const query = offer({ sourceHealth: {
      contractVersion: "spec266-source-health-v1", sourceId: "source-1", datasetId: "dataset-1", offerId: "offer-1",
      assessedAt: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-01T00:15:00.000Z",
      dimensions: { connectivity: "healthy", schema: "healthy", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "degraded" },
    } });
    const discovery = offer({ mode: "discovery", sourceHealth: { ...query.sourceHealth, offerId: "discovery-offer" }, id: "discovery-offer" });
    const queryResult = resolveDataRequirement(requirement, [query], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
    const discoveryResult = resolveDataRequirement(requirement, [discovery], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
    expect(queryResult.eligible.map(item => item.id)).toEqual(["offer-1"]);
    expect(discoveryResult.rejections).toEqual([{ offerId: "discovery-offer", code: "SOURCE_INDEX_UNHEALTHY" }]);
  });

  it("reports malformed health separately from generic offer shape errors", () => {
    const missingHealth = { ...offer(), sourceHealth: undefined } as never;
    const result = resolveDataRequirement(requirement, [missingHealth], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    });
    expect(result.rejections).toEqual([{ offerId: "offer-1", code: "SOURCE_HEALTH_UNVERIFIED" }]);
  });

  it("rejects malformed or sparse DataRequirement values at the resolver boundary", () => {
    expect(() => resolveDataRequirement({ ...requirement, minimumCoverage: 1.1 }, [offer()], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    })).toThrow("DATA_REQUIREMENT_INVALID");
    expect(() => resolveDataRequirement({ ...requirement, temporal: { from: "2026-10-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" } }, [offer()], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    })).toThrow("DATA_REQUIREMENT_INVALID");
    const sparseFields = new Array(2);
    sparseFields[0] = "depth";
    expect(() => resolveDataRequirement({ ...requirement, requiredFields: sparseFields }, [], {
      now: new Date("2026-10-01T00:00:00.000Z"), authorizationScope: "PUBLIC",
    })).toThrow("DATA_REQUIREMENT_INVALID");
  });

  it("quarantines only the offer whose source health assessment reports schema drift", () => {
    const drifted = offer({ id: "dataset-drifted", datasetRef: "dataset-drifted", sourceHealth: {
      contractVersion: "spec266-source-health-v1", sourceId: "source-1", datasetId: "dataset-drifted", offerId: "dataset-drifted",
      assessedAt: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-01T00:15:00.000Z",
      dimensions: { connectivity: "healthy", schema: "degraded", semantic: "healthy", freshness: "healthy", rights: "healthy", placement: "healthy", index: "healthy" },
    } });
    const healthy = offer({ id: "unrelated-dataset", datasetRef: "unrelated-dataset" });
    const result = resolveDataRequirement(requirement, [drifted, healthy], { now: new Date("2026-10-01T00:01:00.000Z"), authorizationScope: "PUBLIC" });
    expect(result.eligible.map(item => item.id)).toEqual(["unrelated-dataset"]);
    expect(result.rejections).toEqual([{ offerId: "dataset-drifted", code: "SOURCE_SCHEMA_DRIFT" }]);
  });
});
