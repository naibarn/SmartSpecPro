import type { RevisionedSourceReference } from "./compoundHazards";

export interface CanonicalRouteReference { readonly canonicalRouteId: string; readonly revision: string; }
export type RouteAuthorityStatus = "open" | "restricted" | "closed" | "unknown";
export interface RouteStatusFact { readonly status: RouteAuthorityStatus; readonly source: RevisionedSourceReference; readonly observedAt: string; }
export interface RouteExposureProjectionInput {
  readonly route: CanonicalRouteReference;
  readonly officialStatus?: RouteStatusFact;
  readonly observations: readonly RouteStatusFact[];
  readonly enrichment?: { readonly originalGeometryId: string; readonly snappedGeometryId: string };
}
export interface RouteExposureProjection {
  readonly route: CanonicalRouteReference;
  readonly availability: RouteAuthorityStatus;
  readonly clearance: "unknown" | "estimated";
  readonly evacuationCapacity: "unknown" | "estimated";
  readonly officialStatus?: RouteStatusFact;
  readonly observations: readonly RouteStatusFact[];
  readonly enrichment?: { readonly originalGeometryId: string; readonly snappedGeometryId: string };
}

/** Official canonical closure/restriction wins; opening a road does not establish clearance or capacity. */
export function projectRouteExposure(input: RouteExposureProjectionInput): RouteExposureProjection {
  return {
    route: input.route,
    availability: input.officialStatus?.status ?? "unknown",
    clearance: "unknown",
    evacuationCapacity: "unknown",
    ...(input.officialStatus ? { officialStatus: input.officialStatus } : {}),
    observations: [...input.observations],
    ...(input.enrichment ? { enrichment: input.enrichment } : {}),
  };
}
