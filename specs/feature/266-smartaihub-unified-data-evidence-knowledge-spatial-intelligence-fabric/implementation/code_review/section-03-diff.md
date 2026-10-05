diff --git a/apps/web/server/services/intelligenceFabric/semantic.test.ts b/apps/web/server/services/intelligenceFabric/semantic.test.ts
index c6e8e8fa7..05274a95a 100644
--- a/apps/web/server/services/intelligenceFabric/semantic.test.ts
+++ b/apps/web/server/services/intelligenceFabric/semantic.test.ts
@@ -3,20 +3,30 @@ import { assessSemanticCompatibility, detectTemporalGaps, projectGeoEvidenceFeat

 describe("Spec 266 semantic and spatial contracts", () => {
   it("requires matching metric revisions or an explicit safe conversion", () => {
-    expect(assessSemanticCompatibility({ semanticType: "rainfall.total", revision: "1", unit: "mm", aggregation: "sum" }, { semanticType: "rainfall.total", revision: "1", unit: "m", aggregation: "sum" })).toMatchObject({ kind: "compatible_with_transform", scale: 0.001 });
-    expect(assessSemanticCompatibility({ semanticType: "rainfall.total", revision: "1", unit: "mm", aggregation: "sum" }, { semanticType: "rainfall.total", revision: "2", unit: "mm", aggregation: "mean" }).kind).toBe("not_comparable");
-    expect(assessSemanticCompatibility({ semanticType: "custom", revision: "1", unit: "widgets", aggregation: "sum" }, { semanticType: "custom", revision: "1", unit: "widgets", aggregation: "sum" }).kind).toBe("equivalent");
+    const rainfall = { semanticType: "rainfall.total", revision: "1", methodologyRevision: "gauge-v1", unit: "mm", aggregation: "sum" };
+    expect(assessSemanticCompatibility(rainfall, { ...rainfall, unit: "m" })).toMatchObject({ kind: "compatible_with_transform", scale: 0.001 });
+    expect(assessSemanticCompatibility(rainfall, { ...rainfall, revision: "2", aggregation: "mean" }).kind).toBe("not_comparable");
+    expect(assessSemanticCompatibility(rainfall, { ...rainfall, methodologyRevision: "radar-v2" }).kind).toBe("not_comparable");
+    expect(assessSemanticCompatibility({ semanticType: "custom", revision: "1", methodologyRevision: "source-v1", unit: "widgets", aggregation: "sum" }, { semanticType: "custom", revision: "1", methodologyRevision: "source-v1", unit: "widgets", aggregation: "sum" }).kind).toBe("equivalent");
   });

   it("keeps close entity candidates ambiguous unless an approved deterministic method uniquely resolves", () => {
     const candidates = [{ id: "a", score: 0.93, method: "normalized" as const }, { id: "b", score: 0.92, method: "spatial" as const }];
     expect(resolveEntityCandidates(candidates, "resolver-v1")).toMatchObject({ ambiguityState: "ambiguous" });
     expect(resolveEntityCandidates([{ id: "a", score: 1, method: "official_id" }], "resolver-v1")).toMatchObject({ ambiguityState: "resolved", canonicalEntityId: "a" });
+    expect(resolveEntityCandidates([{ id: "authority-a", score: 1, method: "official_id" }, { id: "authority-b", score: 0.8, method: "user_confirmed" }], "resolver-v1")).toMatchObject({ ambiguityState: "conflicting" });
+    expect(() => resolveEntityCandidates([{ id: "a", score: 1, method: "invented" as never }], "resolver-v1")).toThrow("ENTITY_RESOLUTION_INVALID");
   });

   it("reports temporal gaps without interpolating observations", () => {
     const result = detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T02:00:00.000Z"], 60 * 60);
     expect(result).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T02:00:00.000Z", missingIntervals: 1 }]);
+    const sparseInstants = new Array(2);
+    sparseInstants[0] = "2026-10-01T00:00:00.000Z";
+    expect(() => detectTemporalGaps(sparseInstants, 60 * 60)).toThrow("TEMPORAL_SERIES_INVALID");
+    expect(() => detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"], 60 * 60)).toThrow("TEMPORAL_SERIES_INVALID");
+    expect(detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T01:30:00.000Z"], 60 * 60)).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T01:30:00.000Z", missingIntervals: 1 }]);
+    expect(detectTemporalGaps(["2026-10-01T00:00:00.000Z", "2026-10-01T02:30:00.000Z"], 60 * 60)).toEqual([{ from: "2026-10-01T01:00:00.000Z", to: "2026-10-01T02:30:00.000Z", missingIntervals: 2 }]);
   });

   it("projects typed evidence without upgrading inferred evidence to official warning", () => {
@@ -30,5 +40,16 @@ describe("Spec 266 semantic and spatial contracts", () => {
     const sparseEvidenceRefs = new Array(2);
     sparseEvidenceRefs[0] = "e1";
     expect(() => projectGeoEvidenceFeature({ ...base, evidenceRefs: sparseEvidenceRefs })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
+    expect(() => projectGeoEvidenceFeature({ ...base, projectionType: "UNSUPPORTED" as never })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
+    expect(() => projectGeoEvidenceFeature({ ...base, evidenceClass: "made_up" as never })).toThrow("GEO_EVIDENCE_PROJECTION_INVALID");
+  });
+
+  it("preserves source, temporal, and confidence metadata without returning mutable input references", () => {
+    const temporal = { observedAt: "2026-10-01T00:00:00.000Z", fetchedAt: "2026-10-01T00:10:00.000Z" };
+    const sourceRefs = ["source-1"];
+    const feature = projectGeoEvidenceFeature({ featureId: "f4", geometryRef: "geom4", semanticType: "flood.depth", evidenceRefs: ["e1"], sourceRefs, temporal, evidenceClass: "observation", verificationState: "organization_verified", projectionType: "TIME_SERIES_POINT", confidence: 0.72, freshnessState: "fresh", styleHint: "depth" });
+    sourceRefs[0] = "mutated";
+    temporal.observedAt = "2026-10-02T00:00:00.000Z";
+    expect(feature).toMatchObject({ sourceRefs: ["source-1"], temporal: { observedAt: "2026-10-01T00:00:00.000Z" }, confidence: 0.72, authorityClass: "observation" });
   });
 });
diff --git a/apps/web/server/services/intelligenceFabric/semantic.ts b/apps/web/server/services/intelligenceFabric/semantic.ts
index 3db2325ef..717633997 100644
--- a/apps/web/server/services/intelligenceFabric/semantic.ts
+++ b/apps/web/server/services/intelligenceFabric/semantic.ts
@@ -3,6 +3,8 @@ import type { EvidenceClass, TemporalEnvelope, VerificationState } from "./contr
 export interface MetricSemantics {
   readonly semanticType: string;
   readonly revision: string;
+  /** Pins the source/calculation method separately from the semantic definition. */
+  readonly methodologyRevision: string;
   readonly unit: string;
   readonly aggregation: string;
 }
@@ -22,6 +24,11 @@ const UNIT_TO_BASE: Readonly<Record<string, { dimension: string; scale: number }
 };
 const PROJECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
 const PROJECTION_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
+const PROJECTION_TYPES = new Set(["POINT", "LINE", "ROUTE", "POLYGON", "RASTER", "HEATMAP", "TIME_SERIES_POINT", "AREA_AGGREGATION"]);
+const EVIDENCE_CLASSES = new Set<EvidenceClass>(["reference", "official_record", "observation", "derived", "forecast", "model_estimate", "user_asserted", "crowdsourced", "official_warning"]);
+const VERIFICATION_STATES = new Set<VerificationState>(["unverified", "correlated", "community_supported", "disputed", "organization_verified", "authority_verified", "superseded", "expired", "unknown"]);
+const FRESHNESS_STATES = new Set(["fresh", "stale", "expired", "unknown"]);
+const ENTITY_MATCH_METHODS = new Set<EntityMatchMethod>(["official_id", "exact", "normalized", "spatial", "probabilistic", "user_confirmed"]);
 const TEMPORAL_FIELDS = new Set([
   "observedAt", "effectiveFrom", "effectiveUntil", "publishedAt", "fetchedAt", "ingestedAt", "staleAt", "expiresAt", "sourceSnapshotVersion", "timezone",
 ]);
@@ -59,8 +66,8 @@ function isProjectionTemporal(value: unknown): value is TemporalEnvelope {

 /** Compatibility is explicit and conservative; no implicit semantic migration occurs. */
 export function assessSemanticCompatibility(left: MetricSemantics, right: MetricSemantics): SemanticCompatibility {
-  if (![left.semanticType, left.revision, left.unit, left.aggregation, right.semanticType, right.revision, right.unit, right.aggregation].every(value => typeof value === "string" && value.length > 0)) return { kind: "unknown" };
-  if (left.semanticType !== right.semanticType || left.revision !== right.revision || left.aggregation !== right.aggregation) return { kind: "not_comparable" };
+  if (![left.semanticType, left.revision, left.methodologyRevision, left.unit, left.aggregation, right.semanticType, right.revision, right.methodologyRevision, right.unit, right.aggregation].every(value => typeof value === "string" && value.length > 0)) return { kind: "unknown" };
+  if (left.semanticType !== right.semanticType || left.revision !== right.revision || left.methodologyRevision !== right.methodologyRevision || left.aggregation !== right.aggregation) return { kind: "not_comparable" };
   if (left.unit === right.unit) return { kind: "equivalent", scale: 1 };
   const from = UNIT_TO_BASE[left.unit];
   const to = UNIT_TO_BASE[right.unit];
@@ -85,13 +92,16 @@ export function resolveEntityCandidates(candidates: readonly EntityCandidate[],
   if (!resolverVersion || candidates.length > 500 || !Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1 || !Number.isFinite(ambiguityMargin) || ambiguityMargin < 0) throw new Error("ENTITY_RESOLUTION_INVALID");
   const ids = new Set<string>();
   for (const candidate of candidates) {
-    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(candidate.id) || ids.has(candidate.id) || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) throw new Error("ENTITY_RESOLUTION_INVALID");
+    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(candidate.id) || ids.has(candidate.id) || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1 || !ENTITY_MATCH_METHODS.has(candidate.method)) throw new Error("ENTITY_RESOLUTION_INVALID");
     ids.add(candidate.id);
   }
   const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
   const best = ranked[0];
   const next = ranked[1];
   if (!best) return { sourceEntityRefs: [], resolverVersion, ambiguityState: "unresolved" };
+  if (ranked.filter(candidate => candidate.method === "official_id" || candidate.method === "user_confirmed").length > 1) {
+    return { sourceEntityRefs: ranked.map(item => item.id), resolverVersion, ambiguityState: "conflicting" };
+  }
   if (next && best.score - next.score < ambiguityMargin) return { sourceEntityRefs: ranked.map(item => item.id), resolverVersion, ambiguityState: "ambiguous" };
   if (best.method === "probabilistic" || (best.method !== "official_id" && best.method !== "user_confirmed" && best.score < minimumConfidence)) {
     return { sourceEntityRefs: [best.id], resolverVersion, ambiguityState: "unresolved" };
@@ -104,6 +114,9 @@ export interface TemporalGap { readonly from: string; readonly to: string; reado
 /** Finds absent sample intervals; it never fabricates interpolated observations. */
 export function detectTemporalGaps(instants: readonly string[], intervalSeconds: number): TemporalGap[] {
   if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0 || instants.length > 100_000) throw new Error("TEMPORAL_SERIES_INVALID");
+  for (let index = 0; index < instants.length; index += 1) {
+    if (!Object.prototype.hasOwnProperty.call(instants, index)) throw new Error("TEMPORAL_SERIES_INVALID");
+  }
   const values = instants.map(value => {
     const time = Date.parse(value);
     if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error("TEMPORAL_SERIES_INVALID");
@@ -114,8 +127,8 @@ export function detectTemporalGaps(instants: readonly string[], intervalSeconds:
     const previous = values[index - 1]!;
     const current = values[index]!;
     const delta = current.time - previous.time;
-    if (delta <= 0 || delta % (intervalSeconds * 1_000) !== 0) continue;
-    const missingIntervals = delta / (intervalSeconds * 1_000) - 1;
+    if (delta <= 0) throw new Error("TEMPORAL_SERIES_INVALID");
+    const missingIntervals = Math.ceil(delta / (intervalSeconds * 1_000)) - 1;
     if (missingIntervals > 0) gaps.push({ from: new Date(previous.time + intervalSeconds * 1_000).toISOString(), to: current.value, missingIntervals });
   }
   return gaps;
@@ -133,6 +146,9 @@ export interface GeoEvidenceProjectionInput {
   readonly projectionType?: "POINT" | "LINE" | "ROUTE" | "POLYGON" | "RASTER" | "HEATMAP" | "TIME_SERIES_POINT" | "AREA_AGGREGATION";
   readonly qualityProfileRef?: string;
   readonly analysisRefs?: readonly string[];
+  readonly freshnessState?: "fresh" | "stale" | "expired" | "unknown";
+  readonly styleHint?: string;
+  readonly confidence?: number;
 }

 export interface GeoEvidenceFeature extends GeoEvidenceProjectionInput {
@@ -146,6 +162,21 @@ export function projectGeoEvidenceFeature(input: GeoEvidenceProjectionInput): Ge
   if (![input.featureId, input.geometryRef, input.semanticType].every(value => typeof value === "string" && PROJECTION_ID.test(value)) ||
     !isProjectionIdList(input.evidenceRefs, true) || !isProjectionIdList(input.sourceRefs, true) ||
     (input.analysisRefs !== undefined && !isProjectionIdList(input.analysisRefs, false)) || !isProjectionTemporal(input.temporal) ||
+    !EVIDENCE_CLASSES.has(input.evidenceClass) || !VERIFICATION_STATES.has(input.verificationState) ||
+    (input.projectionType !== undefined && !PROJECTION_TYPES.has(input.projectionType)) ||
+    (input.qualityProfileRef !== undefined && (typeof input.qualityProfileRef !== "string" || !PROJECTION_ID.test(input.qualityProfileRef))) ||
+    (input.freshnessState !== undefined && !FRESHNESS_STATES.has(input.freshnessState)) ||
+    (input.styleHint !== undefined && (typeof input.styleHint !== "string" || input.styleHint.length < 1 || input.styleHint.length > 160)) ||
+    (input.confidence !== undefined && (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1)) ||
     (input.evidenceClass === "official_warning" && input.verificationState !== "authority_verified")) throw new Error("GEO_EVIDENCE_PROJECTION_INVALID");
-  return { ...input, contractVersion: "spec266-geo-evidence-v1", projectionType: input.projectionType ?? "POINT", authorityClass: input.evidenceClass };
+  return Object.freeze({
+    ...input,
+    evidenceRefs: Object.freeze([...input.evidenceRefs]),
+    sourceRefs: Object.freeze([...input.sourceRefs]),
+    temporal: Object.freeze({ ...input.temporal }),
+    ...(input.analysisRefs === undefined ? {} : { analysisRefs: Object.freeze([...input.analysisRefs]) }),
+    contractVersion: "spec266-geo-evidence-v1",
+    projectionType: input.projectionType ?? "POINT",
+    authorityClass: input.evidenceClass,
+  });
 }
diff --git a/apps/web/server/services/intelligenceFabric/spatialOps.test.ts b/apps/web/server/services/intelligenceFabric/spatialOps.test.ts
index d39755f30..5990e8d80 100644
--- a/apps/web/server/services/intelligenceFabric/spatialOps.test.ts
+++ b/apps/web/server/services/intelligenceFabric/spatialOps.test.ts
@@ -89,5 +89,7 @@ describe("Spec 266 bounded spatial operations", () => {
     const area = polygon("area", [[[0, 0], [1, 0], [1, 1], [0, 0]]]);
     expect(() => joinPointsToAreas([null as unknown as GeometryContract], [area])).toThrow("SPATIAL_INPUT_INVALID");
     expect(() => joinPointsToAreas([point("duplicate", [0, 0]), point("duplicate", [0.5, 0.5])], [area])).toThrow("SPATIAL_INPUT_INVALID");
+    const unpinnedVersion = { ...point("unpinned", [0, 0]), geometryVersion: "" } as unknown as GeometryContract;
+    expect(() => findNearestPoints(point("target", [0, 0]), [unpinnedVersion], 1)).toThrow("SPATIAL_INPUT_INVALID");
   });
 });
diff --git a/apps/web/server/services/intelligenceFabric/spatialOps.ts b/apps/web/server/services/intelligenceFabric/spatialOps.ts
index 866c30e47..324e541e7 100644
--- a/apps/web/server/services/intelligenceFabric/spatialOps.ts
+++ b/apps/web/server/services/intelligenceFabric/spatialOps.ts
@@ -1,4 +1,4 @@
-import type { GeoJSONGeometry, GeoJSONPosition, GeometryContract } from "./geometry";
+import { parseGeometryContract, type GeoJSONGeometry, type GeoJSONPosition, type GeometryContract } from "./geometry";

 export type SpatialPointRelation = "inside" | "outside" | "boundary";

@@ -18,7 +18,6 @@ const MAX_INPUT_ITEMS = 10_000;
 const MAX_JOIN_PAIRS = 100_000;
 const MAX_NEAREST_RESULTS = 100;
 const MAX_AREA_POSITIONS = 100_000;
-const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
 const EPSILON = 1e-12;

 type PolygonRings = readonly (readonly GeoJSONPosition[])[];
@@ -47,16 +46,15 @@ function assertCoordinate(value: unknown): asserts value is GeoJSONPosition {
   if (value[0]! < -180 || value[0]! > 180 || value[1]! < -90 || value[1]! > 90) fail("SPATIAL_INPUT_INVALID");
 }

-function assertContract(contract: GeometryContract): void {
-  if (!contract || typeof contract !== "object" || contract.crs !== "OGC:CRS84") {
-    fail(contract && typeof contract === "object" && "crs" in contract ? "SPATIAL_CRS_UNSUPPORTED" : "SPATIAL_INPUT_INVALID");
-  }
-  if (typeof contract.geometryId !== "string" || !ID.test(contract.geometryId)) fail("SPATIAL_INPUT_INVALID");
+function assertContract(contract: GeometryContract): GeometryContract {
+  const parsed = parseGeometryContract(contract);
+  if (!parsed.ok) fail(parsed.code === "GEOMETRY_CRS_UNSUPPORTED" ? "SPATIAL_CRS_UNSUPPORTED" : "SPATIAL_INPUT_INVALID");
+  return parsed.value;
 }

 function pointFromContract(contract: GeometryContract): GeoJSONPosition {
-  assertContract(contract);
-  const geometry = contract.geometry as GeoJSONGeometry;
+  const parsed = assertContract(contract);
+  const geometry = parsed.geometry as GeoJSONGeometry;
   if (!geometry || geometry.type !== "Point") fail("SPATIAL_GEOMETRY_UNSUPPORTED");
   assertCoordinate(geometry.coordinates);
   return geometry.coordinates;
@@ -83,9 +81,9 @@ function polygonFromUnknown(value: unknown, budget: { positions: number }): Poly
 }

 function polygonsFromContract(contract: GeometryContract): readonly PolygonRings[] {
-  assertContract(contract);
+  const parsed = assertContract(contract);
   const budget = { positions: 0 };
-  const geometry = contract.geometry as GeoJSONGeometry;
+  const geometry = parsed.geometry as GeoJSONGeometry;
   if (!geometry) fail("SPATIAL_GEOMETRY_UNSUPPORTED");
   if (geometry.type === "Polygon") return [polygonFromUnknown(geometry.coordinates, budget)];
   if (geometry.type === "MultiPolygon") {
diff --git a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-03-semantic-geo-temporal.md b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-03-semantic-geo-temporal.md
index d4b6673d3..00387f122 100644
--- a/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-03-semantic-geo-temporal.md
+++ b/specs/feature/266-smartaihub-unified-data-evidence-knowledge-spatial-intelligence-fabric/sections/section-03-semantic-geo-temporal.md
@@ -10,19 +10,52 @@ Spec 266 §§16–21, 34.2–34.12, 46.4–46.5, 46.9.

 ## Implementation

-- Keep ambiguous entity matches unresolved and visible; pin semantic/geometry/method revisions.
-- Add a bounded, strict geometry reference contract with GeoJSON structural checks, dense-array enforcement at every nesting level, closed polygon rings, CRS84 longitude/latitude range validation, source/version/precision metadata, and explicit rejection of unsupported CRS rather than silent relabeling.
-- Preserve separate observed/effective/published/fetched times and gaps.
-- Distinguish proximity from accessibility and model outputs from official warnings.
-- Project features through Spec 262 contracts; do not create a map renderer or replace emergency authority.
-
-The geometry parser validates serialized geometry inputs only. It does not perform CRS transformation, topology repair, persistence, or spatial analysis; those remain separate engine and storage work.
+- Extend `semantic.ts`, `geometry.ts`, and `spatialOps.ts` as bounded contract/evaluation modules. Pin semantic, unit, method, and geometry revisions; never resolve ambiguous entity matches silently.
+- Geometry parsing validates serialized input only: dense bounded arrays, supported GeoJSON types, polygon closure, coordinate bounds, explicit CRS84, source/version/precision metadata. Reject unsupported CRS; do not silently relabel, transform, repair topology, persist, or run unbounded spatial analysis.
+- Keep observed, effective, published, and fetched instants separate; reject invalid ranges and retain explicit data gaps.
+- Keep proximity distinct from accessibility and observations distinct from official warnings.
+- Project through existing Spec 262 contracts and renderer; preserve source/authority/confidence and avoid a second map UI.

 ## Tests

-- Unit, CRS, geometry complexity/structure, time and entity ambiguity cases.
-- Projection never upgrades a model/community observation to official authority.
+- Extend `semantic.test.ts`, `geometry.test.ts`, and `spatialOps.test.ts` for unit/method drift, ambiguity, nested sparse arrays, structure/complexity/CRS/range/time cases, and projection authority preservation.

 ## Acceptance

 Spec 266 §§46.4–46.5, emergency profile items 48–57.
+## UI/UX Contract
+
+### Target User / JTBD
+- N/A: this section implements backend contracts/policies only; browser UI ownership is Section 07.
+
+### Existing Pattern Reference
+- N/A: no user-facing surface is added by this section.
+
+### Surface Inventory
+- N/A: no route/page/dialog/form/table is added.
+
+### Component Map
+- N/A: no client component is added.
+
+### State Matrix
+- N/A: no browser state is added.
+
+### Responsive Matrix
+- N/A: no browser layout is added.
+
+### Accessibility Acceptance
+- N/A: no user-facing control is added.
+
+### Copy Contract
+- N/A: no user-facing copy is added.
+
+### Browser Evidence Required
+- N/A: no browser-visible changes are planned in this section.
+
+## Implementation evidence (2026-10-05)
+
+- Semantic compatibility now pins methodology revision as well as semantic/unit/aggregation versions; entity resolution rejects unsupported methods and reports conflicting authoritative matches.
+- Temporal gap analysis rejects duplicate/non-increasing and sparse series while retaining valid irregular observations. It reports only whole absent cadence intervals and never invents interpolated values.
+- GeoEvidence projections validate enum/range/reference fields and defensively copy nested input metadata. Spatial operations re-parse the complete GeometryContract at the operation boundary.
+- Focused proof: `pnpm --filter @smartspec/web exec vitest run server/services/intelligenceFabric/semantic.test.ts server/services/intelligenceFabric/geometry.test.ts server/services/intelligenceFabric/spatialOps.test.ts` — 3 files, 20 tests passed after review correction. `git diff --check` and retired-system scan passed for section paths.
+- External gate: canonical semantic/geometry version persistence and Spec 262 live projection remain unverified; no schema/migration or renderer authority changed.
