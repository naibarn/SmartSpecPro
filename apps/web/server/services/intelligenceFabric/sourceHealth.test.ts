import { describe, expect, it } from "vitest";
import { evaluateSourceHealth, type SourceHealthAssessment, type SourceHealthDimension } from "./sourceHealth";

const dimensions = {
  connectivity: "healthy", schema: "healthy", semantic: "healthy", freshness: "healthy",
  rights: "healthy", placement: "healthy", index: "healthy",
} as const;

function assessment(overrides: Partial<SourceHealthAssessment> = {}): SourceHealthAssessment {
  return {
    contractVersion: "spec266-source-health-v1", sourceId: "source-1", datasetId: "dataset-1", offerId: "offer-1",
    assessedAt: "2026-10-01T00:00:00.000Z", validUntil: "2026-10-01T00:15:00.000Z", dimensions,
    ...overrides,
  };
}

const expected = { sourceId: "source-1", datasetId: "dataset-1", offerId: "offer-1", now: new Date("2026-10-01T00:05:00.000Z") };

describe("Spec 266 independent source health", () => {
  it("accepts a current, fully healthy assessment bound to one offer", () => {
    expect(evaluateSourceHealth(assessment(), expected)).toEqual({ ok: true, state: "healthy", rejectedDimensions: [] });
  });

  it("keeps health dimensions independent and quarantines schema drift with an explicit reason", () => {
    const degradedDimensions = { ...dimensions, schema: "degraded" } satisfies Record<SourceHealthDimension, string>;
    expect(evaluateSourceHealth(assessment({ dimensions: degradedDimensions as SourceHealthAssessment["dimensions"] }), expected)).toEqual({
      ok: true, state: "quarantined", rejectedDimensions: ["schema"], rejectionCode: "SOURCE_SCHEMA_DRIFT",
    });
  });

  it("fails closed for unknown rights state, a different offer scope, and expired assessments", () => {
    expect(evaluateSourceHealth(assessment({ dimensions: { ...dimensions, rights: "unknown" } }), expected)).toMatchObject({
      ok: true, state: "quarantined", rejectionCode: "SOURCE_HEALTH_UNVERIFIED",
    });
    expect(evaluateSourceHealth(assessment(), { ...expected, datasetId: "other-dataset" })).toEqual({ ok: false, code: "SOURCE_HEALTH_SCOPE_MISMATCH" });
    expect(evaluateSourceHealth(assessment(), { ...expected, now: new Date("2026-10-01T00:16:00.000Z") })).toEqual({ ok: false, code: "SOURCE_HEALTH_EXPIRED" });
  });

  it("rejects omitted health dimensions and excessive assessment lifetimes", () => {
    expect(evaluateSourceHealth(assessment({ dimensions: { ...dimensions, index: undefined } as never }), expected)).toEqual({ ok: false, code: "SOURCE_HEALTH_UNVERIFIED" });
    expect(evaluateSourceHealth(assessment({ validUntil: "2026-10-01T00:30:00.000Z" }), expected)).toEqual({ ok: false, code: "SOURCE_HEALTH_EXPIRED" });
  });

  it("rejects oversized and duplicate required-dimension policies", () => {
    expect(evaluateSourceHealth(assessment(), { ...expected, requiredDimensions: Array(64).fill("schema") as SourceHealthDimension[] })).toEqual({
      ok: false, code: "SOURCE_HEALTH_UNVERIFIED",
    });
    expect(evaluateSourceHealth(assessment(), { ...expected, requiredDimensions: ["schema", "schema"] })).toEqual({
      ok: false, code: "SOURCE_HEALTH_UNVERIFIED",
    });
  });
});
