import { describe, expect, it } from "vitest";
import { classifyExposureIntersection, summarizeExposure, type ExposureAsset } from "./exposure";

const asset: ExposureAsset = {
  id: "hospital:1",
  kind: "hospital",
  source: { id: "registry:hospitals", revision: "7" },
  validity: { startsAt: "2026-01-01T00:00:00.000Z" },
  geometry: { crs: "EPSG:4326", id: "asset-geom:1", revision: "2" },
  disclosure: "restricted",
};

describe("exposure contracts", () => {
  it("requires an actual revisioned intersection before describing exposure", () => {
    expect(classifyExposureIntersection({
      asset,
      impact: { id: "flood:1", revision: "5", geometry: { crs: "EPSG:4326", id: "impact:1", revision: "5" } },
      intersection: { geometry: { crs: "EPSG:4326", id: "intersection:1", revision: "1" }, method: "geodesic", sourceRevision: "flood:1@5" },
      evidenceClass: "potential",
    }).status).toBe("potential");

    expect(classifyExposureIntersection({
      asset,
      impact: { id: "flood:1", revision: "5", geometry: { crs: "EPSG:4326", id: "impact:1", revision: "5" } },
      evidenceClass: "observed",
    }).status).toBe("unknown");
  });

  it("generalizes public summaries and never returns restricted endpoints", () => {
    const summary = summarizeExposure({ audience: "public", minimumCohort: 3, records: [
      { asset, status: "potential" },
      { asset: { ...asset, id: "hospital:2" }, status: "potential" },
    ] });
    expect(summary.disclosure).toBe("withheld");
    expect(summary.endpointIds).toEqual([]);
  });
});
