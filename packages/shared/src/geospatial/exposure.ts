import type { RevisionedSourceReference } from "./compoundHazards";

export type ExposureAssetKind = "community" | "school" | "hospital" | "shelter" | "eldercare" | "rescue-police" | "road-rail-airport-port" | "power-telecom" | "water-wastewater" | "fuel" | "business-cluster" | "agriculture" | "critical-facility" | "other";
export type ExposureDisclosure = "public-aggregate" | "restricted" | "sensitive";

/** A reference to geometry held by the canonical geo store, not a parallel geometry model. */
export interface CanonicalGeometryReference {
  readonly crs: "EPSG:4326";
  readonly id: string;
  readonly revision: string;
}

export interface ExposureAsset {
  readonly id: string;
  readonly kind: ExposureAssetKind;
  readonly source: RevisionedSourceReference;
  readonly validity: { readonly startsAt: string; readonly endsAt?: string };
  readonly geometry: CanonicalGeometryReference;
  readonly disclosure: ExposureDisclosure;
}

export interface ExposureImpactReference {
  readonly id: string;
  readonly revision: string;
  readonly geometry: CanonicalGeometryReference;
}

export interface ExposureIntersectionEvidence {
  readonly geometry: CanonicalGeometryReference;
  readonly method: "geodesic";
  readonly sourceRevision: string;
}

export type ExposureEvidenceClass = "potential" | "observed" | "confirmed";
export interface ExposureIntersectionInput {
  readonly asset: ExposureAsset;
  readonly impact: ExposureImpactReference;
  readonly intersection?: ExposureIntersectionEvidence;
  readonly evidenceClass: ExposureEvidenceClass;
}

export interface ExposureRecord {
  readonly asset: ExposureAsset;
  readonly status: ExposureEvidenceClass | "unknown";
  readonly intersection?: ExposureIntersectionEvidence;
}

export interface ExposureSummary {
  readonly audience: "public" | "authorized";
  readonly disclosure: "aggregate" | "withheld" | "authorized-detail";
  readonly counts: Readonly<Record<ExposureEvidenceClass, number>>;
  /** Empty outside explicitly authorized detail projections. */
  readonly endpointIds: readonly string[];
}

export function classifyExposureIntersection(input: ExposureIntersectionInput): ExposureRecord {
  const intersection = input.intersection;
  const validIntersection = intersection?.method === "geodesic"
    && intersection.geometry.crs === "EPSG:4326"
    && input.asset.geometry.crs === "EPSG:4326"
    && input.impact.geometry.crs === "EPSG:4326"
    && intersection.sourceRevision === `${input.impact.id}@${input.impact.revision}`;
  return validIntersection
    ? { asset: input.asset, status: input.evidenceClass, intersection }
    : { asset: input.asset, status: "unknown" };
}

/** Public summaries are cohort-protected and never reveal sensitive endpoints. */
export function summarizeExposure(input: { readonly audience: "public" | "authorized"; readonly minimumCohort: number; readonly records: readonly ExposureRecord[] }): ExposureSummary {
  const counts = input.records.reduce<Record<ExposureEvidenceClass, number>>((result, record) => {
    if (record.status !== "unknown") result[record.status] += 1;
    return result;
  }, { potential: 0, observed: 0, confirmed: 0 });
  const total = counts.potential + counts.observed + counts.confirmed;
  const publicVisible = input.audience === "public" && Number.isInteger(input.minimumCohort) && input.minimumCohort > 0 && total >= input.minimumCohort;
  if (input.audience === "public") {
    return { audience: "public", disclosure: publicVisible ? "aggregate" : "withheld", counts, endpointIds: [] };
  }
  return {
    audience: "authorized",
    disclosure: "authorized-detail",
    counts,
    endpointIds: input.records.filter(record => record.asset.disclosure === "public-aggregate").map(record => record.asset.id),
  };
}
