import { describe, expect, it } from "vitest";
import { composeCompoundHazardSnapshot, type HydroDriverContext } from "../../../packages/shared/src/geospatial/compoundHazards";
import { classifyExposureIntersection, summarizeExposure, type ExposureAsset } from "../../../packages/shared/src/geospatial/exposure";
import { projectRouteExposure } from "../../../packages/shared/src/geospatial/routeExposure";
import { assessWaterQualityMeasurement } from "../../../packages/shared/src/geospatial/waterQuality";

const rainfall: HydroDriverContext = {
  driver: "FLUVIAL_RAINFALL_RUNOFF", factClass: "observed", freshness: "current",
  source: { id: "gauge:chao-phraya", revision: "obs-12", independenceGroup: "thai-hydro" },
  effectiveWindow: { startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-01T01:00:00.000Z" },
};

const asset: ExposureAsset = {
  id: "hospital:1", kind: "hospital", source: { id: "registry:hospitals", revision: "7" },
  validity: { startsAt: "2026-01-01T00:00:00.000Z" },
  geometry: { crs: "EPSG:4326", id: "asset-geom:1", revision: "2" }, disclosure: "restricted",
};

describe("Spec 262 compound hazard shared contracts", () => {
  it("does not infer drivers outside supplied rainfall evidence and isolates stale scenarios", () => {
    const rainfallOnly = composeCompoundHazardSnapshot({ occurredAt: "2026-10-01T00:30:00.000Z", drivers: [rainfall], requiredCapabilities: ["river-observation", "coastal-tide"] });
    expect(rainfallOnly).toMatchObject({ status: "partial", inferredDrivers: [] });
    expect(rainfallOnly.unsupportedDrivers).toContain("coastal-tide");

    const scenario = composeCompoundHazardSnapshot({ occurredAt: "2026-10-01T00:30:00.000Z", drivers: [{ ...rainfall, driver: "DAM_OR_LEVEE_FAILURE", factClass: "scenario", freshness: "stale" }], requiredCapabilities: [] });
    expect(scenario).toMatchObject({ status: "blocked", scenarioOnly: true, publishable: false });
  });

  it("keeps actual intersections and public aggregation distinct from endpoint disclosure", () => {
    expect(classifyExposureIntersection({
      asset, impact: { id: "flood:1", revision: "5", geometry: { crs: "EPSG:4326", id: "impact:1", revision: "5" } },
      intersection: { geometry: { crs: "EPSG:4326", id: "intersection:1", revision: "1" }, method: "geodesic", sourceRevision: "flood:1@5" }, evidenceClass: "potential",
    }).status).toBe("potential");
    expect(classifyExposureIntersection({ asset, impact: { id: "flood:1", revision: "5", geometry: { crs: "EPSG:4326", id: "impact:1", revision: "5" } }, evidenceClass: "observed" }).status).toBe("unknown");
    expect(summarizeExposure({ audience: "public", minimumCohort: 3, records: [{ asset, status: "potential" }, { asset: { ...asset, id: "hospital:2" }, status: "potential" }] }))
      .toMatchObject({ disclosure: "withheld", endpointIds: [] });
  });

  it("never calls partial water data safe and preserves authority over route observations", () => {
    expect(assessWaterQualityMeasurement({ parameter: "turbidity", value: 2.4, unit: "NTU", observedAt: "2026-10-01T00:00:00.000Z", source: { id: "lab:1", revision: "2" } }).conclusion).toBe("incomplete");
    expect(assessWaterQualityMeasurement({ parameter: "turbidity", value: 7, unit: "NTU", method: "ISO 7027", observedAt: "2026-10-01T00:00:00.000Z", sample: { id: "sample:1", collectedAt: "2026-09-30T23:00:00.000Z" }, source: { id: "lab:1", revision: "2" }, thresholdBasis: { id: "standard:1", revision: "3", comparator: "max", value: 5, unit: "NTU" } })).toMatchObject({ conclusion: "threshold_exceeded", safeForDrinking: false });
    expect(projectRouteExposure({ route: { canonicalRouteId: "route:1", revision: "4" }, officialStatus: { status: "closed", source: { id: "authority:roads", revision: "9" }, observedAt: "2026-10-01T00:00:00.000Z" }, observations: [{ status: "open", source: { id: "report:1", revision: "1" }, observedAt: "2026-10-01T00:01:00.000Z" }], enrichment: { snappedGeometryId: "road-segment:22", originalGeometryId: "report-geometry:44" } }))
      .toMatchObject({ availability: "closed", clearance: "unknown", evacuationCapacity: "unknown" });
  });
});
