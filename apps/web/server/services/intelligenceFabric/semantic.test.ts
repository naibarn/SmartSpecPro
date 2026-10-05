import { describe, expect, it } from "vitest";
import { assessSemanticCompatibility, detectTemporalGaps, projectGeoEvidenceFeature, resolveEntityCandidates } from "./semantic";

describe("Spec 266 semantic and spatial contracts", () => {
  it("requires matching metric revisions or an explicit safe conversion", () => {
    const rainfall = { semanticType: "rainfall.total", revision: "1", methodologyRevision: "gauge-v1", unit: "mm", aggregation: "sum" };
    expect(assessSemanticCompatibility(rainfall, { ...rainfall, unit: "m" })).toMatchObject({ kind: "compatible_with_transform", scale: 0.001 });
    expect(assessSemanticCompatibility(rainfall, { ...rainfall, revision: "2", aggregation: "mean" }).kind).toBe("not_comparable");
    expect(assessSemanticCompatibility(rainfall, { ...rainfall, methodologyRevision: "radar-v2" }).kind).toBe("not_comparable");
    expect(assessSemanticCompatibility({ semanticType: "custom", revision: "1", methodologyRevision: "source-v1", unit: "widgets", aggregation: "sum" }, { semanticType: "custom", revision: "1", methodologyRevision: "source-v1", unit: "widgets", aggregation: "sum" }).kind).toBe("equivalent");
  });

  it("keeps close entity candidates ambiguous unless an approved deterministic method uniquely resolves", () => {
    const candidates = [{ id: "a", score: 0.93, method: "normalized" as const }, { id: "b", score: 0.92, method: "spatial" as const }];
    expect(resolveEntityCandidates(candidates, "resolver-v1")).toMatchObject({ ambiguityState: "ambiguous" });
    expect(resolveEntityCandidates([{ id: "a", score: 1, method: "official_id" }], "resolver-v1")).toMatchObject({ ambiguityState: "resolved", canonicalEntityId: "a" });
    expect(resolveEntityCandidates([{ id: "authority-a", score: 1, method: "official_id" }, { id: "authority-b", score: 0.8, method: "user_confirmed" }], "resolver-v1")).toMatchObject({ ambiguityState: "conflicting" });
    expect(() => resolveEntityCandidates([{ id: "a", score: 1, method: "invented" as never }], "resolver-v1")).toThrow("ENTITY_RESOLUTION_INVALID");
  });

  it("reports temporal gaps without interpolating observations", () => {
    const result = detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T02:00:00.000Z"], 60 * 60);
    expect(result).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T02:00:00.000Z", missingIntervals: 1 }]);
    const sparseInstants = new Array(2);
    sparseInstants[0] = "2026-10-01T00:00:00.000Z";
    expect(() => detectTemporalGaps(sparseInstants, 60 * 60)).toThrow("TEMPORAL_SERIES_INVALID");
    expect(() => detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"], 60 * 60)).toThrow("TEMPORAL_SERIES_INVALID");
    expect(detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T01:30:00.000Z"], 60 * 60)).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T01:30:00.000Z", missingIntervals: 1 }]);
    expect(detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T02:30:00.000Z"], 60 * 60)).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T02:30:00.000Z", missingIntervals: 2 }]);
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
    expect(() => projectGeoEvidenceFeature({ ...base, projectionType: "UNSUPPORTED" as never })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
    expect(() => projectGeoEvidenceFeature({ ...base, evidenceClass: "made_up" as never })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
  });

  it("preserves source, temporal, and confidence metadata without returning mutable input references", () => {
    const temporal = { observedAt: "2026-10-01T00:00:00.000Z", fetchedAt: "2026-10-01T00:10:00.000Z" };
    const sourceRefs = ["source-1"];
    const feature = projectGeoEvidenceFeature({ featureId: "f4", geometryRef: "geom4", semanticType: "flood.depth", evidenceRefs: ["e1"], sourceRefs, temporal, evidenceClass: "observation", verificationState: "organization_verified", projectionType: "TIME_SERIES_POINT", confidence: 0.72, freshnessState: "fresh", styleHint: "depth" });
    sourceRefs[0] = "mutated";
    temporal.observedAt = "2026-10-02T00:00:00.000Z";
    expect(feature).toMatchObject({ sourceRefs: ["source-1"], temporal: { observedAt: "2026-10-01T00:00:00.000Z" }, confidence: 0.72, authorityClass: "observation" });
  });
});
