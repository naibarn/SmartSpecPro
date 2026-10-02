export type SourceHealthState = "healthy" | "delayed" | "stale" | "degraded" | "unavailable" | "unknown";
export type SourceHealthDimension = "connectivity" | "schema" | "semantic" | "freshness" | "rights" | "placement" | "index";
export type SourceHealthDimensions = Readonly<Record<SourceHealthDimension, SourceHealthState>>;

export interface SourceHealthAssessment {
  readonly contractVersion: "spec266-source-health-v1";
  readonly sourceId: string;
  readonly datasetId: string;
  readonly offerId: string;
  readonly assessedAt: string;
  readonly validUntil: string;
  readonly dimensions: SourceHealthDimensions;
}

export type SourceHealthRejectionCode =
  | "SOURCE_HEALTH_UNVERIFIED" | "SOURCE_HEALTH_SCOPE_MISMATCH" | "SOURCE_HEALTH_EXPIRED"
  | "SOURCE_UNAVAILABLE" | "SOURCE_DEGRADED" | "SOURCE_STALE" | "SOURCE_SCHEMA_DRIFT"
  | "SOURCE_SEMANTIC_DRIFT" | "SOURCE_RIGHTS_HEALTH_FAILED" | "SOURCE_PLACEMENT_UNAVAILABLE" | "SOURCE_INDEX_UNHEALTHY";

export type SourceHealthEvaluation =
  | { readonly ok: true; readonly state: "healthy"; readonly rejectedDimensions: readonly [] }
  | { readonly ok: true; readonly state: "quarantined"; readonly rejectedDimensions: readonly SourceHealthDimension[]; readonly rejectionCode: SourceHealthRejectionCode }
  | { readonly ok: false; readonly code: SourceHealthRejectionCode };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const DIMENSIONS: readonly SourceHealthDimension[] = ["connectivity", "schema", "semantic", "freshness", "rights", "placement", "index"];
const STATES = new Set<SourceHealthState>(["healthy", "delayed", "stale", "degraded", "unavailable", "unknown"]);
const MAX_ASSESSMENT_TTL_MS = 15 * 60_000;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function isCanonicalInstant(value: unknown): value is string {
  return typeof value === "string" && INSTANT.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  let count = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    count += 1;
    if (count > expected.length || !expected.includes(key)) return false;
  }
  return count === expected.length;
}

function failureCode(dimension: SourceHealthDimension, state: SourceHealthState): SourceHealthRejectionCode {
  if (state === "unknown") return "SOURCE_HEALTH_UNVERIFIED";
  if (dimension === "schema") return "SOURCE_SCHEMA_DRIFT";
  if (dimension === "semantic") return "SOURCE_SEMANTIC_DRIFT";
  if (dimension === "rights") return "SOURCE_RIGHTS_HEALTH_FAILED";
  if (dimension === "placement") return "SOURCE_PLACEMENT_UNAVAILABLE";
  if (dimension === "index") return "SOURCE_INDEX_UNHEALTHY";
  if (dimension === "freshness" || state === "stale" || state === "delayed") return "SOURCE_STALE";
  if (state === "unavailable") return "SOURCE_UNAVAILABLE";
  return "SOURCE_DEGRADED";
}

/**
 * Evaluates a short lived, server-resolved health snapshot for exactly one
 * source/dataset offer. Any non-healthy dimension quarantines only that offer.
 */
export function evaluateSourceHealth(
  input: unknown,
  expected: {
    readonly sourceId: string;
    readonly datasetId: string;
    readonly offerId: string;
    readonly now: Date;
    /** Index health gates discovery only; deterministic reads can proceed without Vectorize. */
    readonly requiredDimensions?: readonly SourceHealthDimension[];
  },
): SourceHealthEvaluation {
  if (!isPlainRecord(input) || !ID.test(expected.sourceId) || !ID.test(expected.datasetId) || !ID.test(expected.offerId) || !Number.isFinite(expected.now.getTime())) {
    return { ok: false, code: "SOURCE_HEALTH_UNVERIFIED" };
  }
  const fields = ["contractVersion", "sourceId", "datasetId", "offerId", "assessedAt", "validUntil", "dimensions"];
  if (!hasExactKeys(input, fields) || input.contractVersion !== "spec266-source-health-v1" ||
    typeof input.sourceId !== "string" || !ID.test(input.sourceId) || typeof input.datasetId !== "string" || !ID.test(input.datasetId) ||
    typeof input.offerId !== "string" || !ID.test(input.offerId) || !isCanonicalInstant(input.assessedAt) || !isCanonicalInstant(input.validUntil) ||
    !isPlainRecord(input.dimensions) || !hasExactKeys(input.dimensions, DIMENSIONS) ||
    DIMENSIONS.some(dimension => typeof input.dimensions[dimension] !== "string" || !STATES.has(input.dimensions[dimension] as SourceHealthState))) {
    return { ok: false, code: "SOURCE_HEALTH_UNVERIFIED" };
  }
  if (input.sourceId !== expected.sourceId || input.datasetId !== expected.datasetId || input.offerId !== expected.offerId) {
    return { ok: false, code: "SOURCE_HEALTH_SCOPE_MISMATCH" };
  }
  const assessedAt = Date.parse(input.assessedAt);
  const validUntil = Date.parse(input.validUntil);
  if (assessedAt > expected.now.getTime() + 60_000 || validUntil <= expected.now.getTime() || validUntil <= assessedAt || validUntil - assessedAt > MAX_ASSESSMENT_TTL_MS) {
    return { ok: false, code: "SOURCE_HEALTH_EXPIRED" };
  }

  const dimensions = input.dimensions as unknown as SourceHealthDimensions;
  const requiredDimensions = expected.requiredDimensions ?? DIMENSIONS;
  if (!Array.isArray(requiredDimensions) || requiredDimensions.length > DIMENSIONS.length) return { ok: false, code: "SOURCE_HEALTH_UNVERIFIED" };
  const requiredDimensionSet = new Set<SourceHealthDimension>();
  for (let index = 0; index < requiredDimensions.length; index += 1) {
    const dimension = requiredDimensions[index];
    if (!Object.prototype.hasOwnProperty.call(requiredDimensions, index) || !DIMENSIONS.includes(dimension!) || requiredDimensionSet.has(dimension!)) return { ok: false, code: "SOURCE_HEALTH_UNVERIFIED" };
    requiredDimensionSet.add(dimension!);
  }
  const rejectedDimensions = requiredDimensions.filter(dimension => dimensions[dimension] !== "healthy");
  if (!rejectedDimensions.length) return { ok: true, state: "healthy", rejectedDimensions: [] };
  const highestPriority = ["rights", "schema", "semantic", "placement", "connectivity", "freshness", "index"] as const;
  const selected = highestPriority.find(dimension => rejectedDimensions.includes(dimension))!;
  return {
    ok: true,
    state: "quarantined",
    rejectedDimensions,
    rejectionCode: failureCode(selected, dimensions[selected]),
  };
}
