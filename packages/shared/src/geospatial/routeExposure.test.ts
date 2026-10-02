import { describe, expect, it } from "vitest";
import { projectRouteExposure } from "./routeExposure";

describe("route exposure contract", () => {
  it("preserves an official closure over route observations and basemap enrichment", () => {
    const result = projectRouteExposure({
      route: { canonicalRouteId: "route:1", revision: "4" },
      officialStatus: { status: "closed", source: { id: "authority:roads", revision: "9" }, observedAt: "2026-10-01T00:00:00.000Z" },
      observations: [{ status: "open", source: { id: "report:1", revision: "1" }, observedAt: "2026-10-01T00:01:00.000Z" }],
      enrichment: { snappedGeometryId: "road-segment:22", originalGeometryId: "report-geometry:44" },
    });
    expect(result.availability).toBe("closed");
    expect(result.clearance).toBe("unknown");
    expect(result.enrichment.originalGeometryId).toBe("report-geometry:44");
  });

  it("does not promote an open route into evacuation capacity", () => {
    expect(projectRouteExposure({
      route: { canonicalRouteId: "route:1", revision: "4" },
      officialStatus: { status: "open", source: { id: "authority:roads", revision: "9" }, observedAt: "2026-10-01T00:00:00.000Z" },
      observations: [],
    })).toMatchObject({ availability: "open", evacuationCapacity: "unknown", clearance: "unknown" });
  });
});
