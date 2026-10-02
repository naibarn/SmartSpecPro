import type { EvidenceClass, TemporalEnvelope, VerificationState } from "./contracts";

export interface MetricSemantics {
  readonly semanticType: string;
  readonly revision: string;
  readonly unit: string;
  readonly aggregation: string;
}

export type SemanticCompatibility =
  | { readonly kind: "equivalent"; readonly scale: 1 }
  | { readonly kind: "compatible_with_transform"; readonly scale: number }
  | { readonly kind: "not_comparable" | "unknown" };

const UNIT_TO_BASE: Readonly<Record<string, { dimension: string; scale: number }>> = {
  m: { dimension: "length", scale: 1 }, km: { dimension: "length", scale: 1_000 }, cm: { dimension: "length", scale: 0.01 },
  mm: { dimension: "length", scale: 0.001 }, m2: { dimension: "area", scale: 1 }, km2: { dimension: "area", scale: 1_000_000 },
  m3: { dimension: "volume", scale: 1 }, l: { dimension: "volume", scale: 0.001 }, ml: { dimension: "volume", scale: 0.000001 },
  s: { dimension: "time", scale: 1 }, min: { dimension: "time", scale: 60 }, h: { dimension: "time", scale: 3_600 },
  day: { dimension: "time", scale: 86_400 }, g: { dimension: "mass", scale: 0.001 }, kg: { dimension: "mass", scale: 1 },
  t: { dimension: "mass", scale: 1_000 },
};
const PROJECTION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const PROJECTION_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const TEMPORAL_FIELDS = new Set([
  "observedAt", "effectiveFrom", "effectiveUntil", "publishedAt", "fetchedAt", "ingestedAt", "staleAt", "expiresAt", "sourceSnapshotVersion", "timezone",
]);

function hasOnlyFields(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  for (const field in value) {
    if (Object.prototype.hasOwnProperty.call(value, field) && !allowed.has(field)) return false;
  }
  return true;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isProjectionIdList(value: unknown, required: boolean): value is string[] {
  if (!Array.isArray(value) || value.length > 128 || (required && value.length === 0)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index) || typeof value[index] !== "string" || !PROJECTION_ID.test(value[index])) return false;
  }
  return new Set(value).size === value.length;
}

function isProjectionTemporal(value: unknown): value is TemporalEnvelope {
  if (!isPlainRecord(value) || !hasOnlyFields(value, TEMPORAL_FIELDS)) return false;
  for (const [field, temporalValue] of Object.entries(value)) {
    if (field === "timezone" || field === "sourceSnapshotVersion") {
      if (typeof temporalValue !== "string" || temporalValue.length < 1 || temporalValue.length > 128) return false;
      continue;
    }
    if (typeof temporalValue !== "string" || !PROJECTION_INSTANT.test(temporalValue) || !Number.isFinite(Date.parse(temporalValue)) || new Date(temporalValue).toISOString() !== temporalValue) return false;
  }
  return value.effectiveFrom === undefined || value.effectiveUntil === undefined || Date.parse(value.effectiveFrom as string) <= Date.parse(value.effectiveUntil as string);
}

/** Compatibility is explicit and conservative; no implicit semantic migration occurs. */
export function assessSemanticCompatibility(left: MetricSemantics, right: MetricSemantics): SemanticCompatibility {
  if (![left.semanticType, left.revision, left.unit, left.aggregation, right.semanticType, right.revision, right.unit, right.aggregation].every(value => typeof value === "string" && value.length > 0)) return { kind: "unknown" };
  if (left.semanticType !== right.semanticType || left.revision !== right.revision || left.aggregation !== right.aggregation) return { kind: "not_comparable" };
  if (left.unit === right.unit) return { kind: "equivalent", scale: 1 };
  const from = UNIT_TO_BASE[left.unit];
  const to = UNIT_TO_BASE[right.unit];
  if (!from || !to) return { kind: "unknown" };
  if (from.dimension !== to.dimension) return { kind: "not_comparable" };
  return { kind: "compatible_with_transform", scale: from.scale / to.scale };
}

export type EntityMatchMethod = "official_id" | "exact" | "normalized" | "spatial" | "probabilistic" | "user_confirmed";
export interface EntityCandidate { readonly id: string; readonly score: number; readonly method: EntityMatchMethod }
export interface ResolvedEntityRef {
  readonly canonicalEntityId?: string;
  readonly sourceEntityRefs: readonly string[];
  readonly matchMethod?: EntityMatchMethod;
  readonly matchConfidence?: number;
  readonly resolverVersion: string;
  readonly ambiguityState: "resolved" | "ambiguous" | "conflicting" | "unresolved";
}

/** A probabilistic or near-tied match stays unresolved for explicit confirmation. */
export function resolveEntityCandidates(candidates: readonly EntityCandidate[], resolverVersion: string, minimumConfidence = 0.98, ambiguityMargin = 0.05): ResolvedEntityRef {
  if (!resolverVersion || candidates.length > 500 || !Number.isFinite(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 1 || !Number.isFinite(ambiguityMargin) || ambiguityMargin < 0) throw new Error("ENTITY_RESOLUTION_INVALID");
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(candidate.id) || ids.has(candidate.id) || !Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) throw new Error("ENTITY_RESOLUTION_INVALID");
    ids.add(candidate.id);
  }
  const ranked = [...candidates].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = ranked[0];
  const next = ranked[1];
  if (!best) return { sourceEntityRefs: [], resolverVersion, ambiguityState: "unresolved" };
  if (next && best.score - next.score < ambiguityMargin) return { sourceEntityRefs: ranked.map(item => item.id), resolverVersion, ambiguityState: "ambiguous" };
  if (best.method === "probabilistic" || (best.method !== "official_id" && best.method !== "user_confirmed" && best.score < minimumConfidence)) {
    return { sourceEntityRefs: [best.id], resolverVersion, ambiguityState: "unresolved" };
  }
  return { canonicalEntityId: best.id, sourceEntityRefs: [best.id], matchMethod: best.method, matchConfidence: best.score, resolverVersion, ambiguityState: "resolved" };
}

export interface TemporalGap { readonly from: string; readonly to: string; readonly missingIntervals: number }

/** Finds absent sample intervals; it never fabricates interpolated observations. */
export function detectTemporalGaps(instants: readonly string[], intervalSeconds: number): TemporalGap[] {
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds <= 0 || instants.length > 100_000) throw new Error("TEMPORAL_SERIES_INVALID");
  const values = instants.map(value => {
    const time = Date.parse(value);
    if (!Number.isFinite(time) || new Date(time).toISOString() !== value) throw new Error("TEMPORAL_SERIES_INVALID");
    return { value, time };
  }).sort((a, b) => a.time - b.time);
  const gaps: TemporalGap[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1]!;
    const current = values[index]!;
    const delta = current.time - previous.time;
    if (delta <= 0 || delta % (intervalSeconds * 1_000) !== 0) continue;
    const missingIntervals = delta / (intervalSeconds * 1_000) - 1;
    if (missingIntervals > 0) gaps.push({ from: new Date(previous.time + intervalSeconds * 1_000).toISOString(), to: current.value, missingIntervals });
  }
  return gaps;
}

export interface GeoEvidenceProjectionInput {
  readonly featureId: string;
  readonly geometryRef: string;
  readonly semanticType: string;
  readonly evidenceRefs: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly temporal: TemporalEnvelope;
  readonly evidenceClass: EvidenceClass;
  readonly verificationState: VerificationState;
  readonly projectionType?: "POINT" | "LINE" | "ROUTE" | "POLYGON" | "RASTER" | "HEATMAP" | "TIME_SERIES_POINT" | "AREA_AGGREGATION";
  readonly qualityProfileRef?: string;
  readonly analysisRefs?: readonly string[];
}

export interface GeoEvidenceFeature extends GeoEvidenceProjectionInput {
  readonly contractVersion: "spec266-geo-evidence-v1";
  readonly projectionType: NonNullable<GeoEvidenceProjectionInput["projectionType"]>;
  readonly authorityClass: EvidenceClass;
}

/** Meaning and authority stay in 266; 262 consumes this projection to render it. */
export function projectGeoEvidenceFeature(input: GeoEvidenceProjectionInput): GeoEvidenceFeature {
  if (![input.featureId, input.geometryRef, input.semanticType].every(value => typeof value === "string" && PROJECTION_ID.test(value)) ||
    !isProjectionIdList(input.evidenceRefs, true) || !isProjectionIdList(input.sourceRefs, true) ||
    (input.analysisRefs !== undefined && !isProjectionIdList(input.analysisRefs, false)) || !isProjectionTemporal(input.temporal) ||
    (input.evidenceClass === "official_warning" && input.verificationState !== "authority_verified")) throw new Error("GEO_EVIDENCE_PROJECTION_INVALID");
  return { ...input, contractVersion: "spec266-geo-evidence-v1", projectionType: input.projectionType ?? "POINT", authorityClass: input.evidenceClass };
}
