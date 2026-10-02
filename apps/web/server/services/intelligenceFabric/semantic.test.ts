import { describe, expect, it } from "vitest";
import { assessSemanticCompatibility, detectTemporalGaps, projectGeoEvidenceFeature, resolveEntityCandidates } from "./semantic";

describe("Spec 266 semantic and spatial contracts", () => {
  it("requires matching metric revisions or an explicit safe conversion", () => {
    expect(assessSemanticCompatibility({ semanticType: "rainfall.total", revision: "1", unit: "mm", aggregation: "sum" }, { semanticType: "rainfall.total", revision: "1", unit: "m", aggregation: "sum" })).toMatchObject({ kind: "compatible_with_transform", scale: 0.001 });
    expect(assessSemanticCompatibility({ semanticType: "rainfall.total", revision: "1", unit: "mm", aggregation: "sum" }, { semanticType: "rainfall.total", revision: "2", unit: "mm", aggregation: "mean" }).kind).toBe("not_comparable");
    expect(assessSemanticCompatibility({ semanticType: "custom", revision: "1", unit: "widgets", aggregation: "sum" }, { semanticType: "custom", revision: "1", unit: "widgets", aggregation: "sum" }).kind).toBe("equivalent");
  });

  it("keeps close entity candidates ambiguous unless an approved deterministic method uniquely resolves", () => {
    const candidates = [{ id: "a", score: 0.93, method: "normalized" as const }, { id: "b", score: 0.92, method: "spatial" as const }];
    expect(resolveEntityCandidates(candidates, "resolver-v1")).toMatchObject({ ambiguityState: "ambiguous" });
    expect(resolveEntityCandidates([{ id: "a", score: 1, method: "official_id" }], "resolver-v1")).toMatchObject({ ambiguityState: "resolved", canonicalEntityId: "a" });
  });

  it("reports temporal gaps without interpolating observations", () => {
    const result = detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T02:00:00.000Z"], 60 * 60);
    expect(result).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T02:00:00.000Z", missingIntervals: 1 }]);
  });

  it("projects typed evidence without upgrading inferred evidence to official warning", () => {
    expect(projectGeoEvidenceFeature({ featureId: "f1", geometryRef: "geom1", semanticType: "flood.depth", evidenceRefs: ["e1"], sourceRefs: ["s1"], temporal: {}, evidenceClass: "model_estimate", verificationState: "unverified" })).toMatchObject({ projectionType: "POINT", authorityClass: "model_estimate", verificationState: "unverified" });
    expect(() => projectGeoEvidenceFeature({ featureId: "f2", geometryRef: "geom2", semanticType: "flood.depth", evidenceRefs: [], sourceRefs: [], temporal: {}, evidenceClass: "official_warning", verificationState: "unverified" })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
  });

  it("rejects malformed temporal windows and sparse map evidence references", () => {
    const base = { featureId: "f3", geometryRef: "geom3", semanticType: "flood.depth", evidenceRefs: ["e1"], sourceRefs: ["s1"], temporal: {}, evidenceClass: "observation" as const, verificationState: "unverified" as const };
    expect(() => projectGeoEvidenceFeature({ ...base, temporal: { effectiveFrom: "2026-10-02T00:00:00.000Z", effectiveUntil: "2026-10-01T00:00:00.000Z" } })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
    const sparseEvidenceRefs = new Array(2);
    sparseEvidenceRefs[0] = "e1";
    expect(() => projectGeoEvidenceFeature({ ...base, evidenceRefs: sparseEvidenceRefs })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
  });
});
