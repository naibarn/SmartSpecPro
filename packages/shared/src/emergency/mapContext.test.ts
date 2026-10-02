import { describe, expect, it } from "vitest";
import { parseMapContextEnvelope } from "./mapContext";

const validContext = {
  surface: "emergency_map",
  viewport: {
    bounds: [100.4, 13.6, 100.6, 13.9],
    center: [100.5, 13.75],
    zoom: 11,
    bearing: 0,
    pitch: 35,
  },
  zoomClass: "CITY",
  selectedFeatures: [
    { type: "incident", id: "incident_public_01", revision: 4 },
  ],
  activeLayers: ["incidents", "safe_routes"],
  filters: [{ key: "hazard", values: ["flood"] }],
  temporalContext: { mode: "HISTORY", window: { start: "2026-10-01T00:00:00.000Z", end: "2026-10-01T06:00:00.000Z" } },
  selectedAreaRef: { type: "public-area", id: "area_public_01", revision: 2 },
  activeRouteRef: { type: "route", id: "route_public_01", revision: 3 },
  activeJourneyRef: { type: "journey", id: "journey_public_01", revision: 1 },
  requestedMapMode: "PUBLIC",
  visibleSummary: { incidents: 2, hazards: 1, resources: 3, tasks: 0, services: 4 },
};

describe("MapContextEnvelope", () => {
  it("accepts only bounded authority-neutral references and normalizes the viewport", () => {
    expect(parseMapContextEnvelope(validContext)).toEqual(validContext);
  });

  it("rejects unknown fields and raw selected feature payloads", () => {
    expect(parseMapContextEnvelope({ ...validContext, elevatedAudience: "COMMAND" })).toBeUndefined();
    expect(parseMapContextEnvelope({
      ...validContext,
      selectedFeatures: [{ ...validContext.selectedFeatures[0], properties: { privateOperation: true } }],
    })).toBeUndefined();
  });

  it("rejects invalid geometry, temporal context, and oversized client-controlled collections", () => {
    expect(parseMapContextEnvelope({
      ...validContext,
      viewport: { ...validContext.viewport, bounds: [100.6, 13.6, 100.4, 13.9] },
    })).toBeUndefined();
    expect(parseMapContextEnvelope({
      ...validContext,
      temporalContext: { mode: "HISTORY", window: { start: "2026-10-01T06:00:00.000Z", end: "2026-10-01T00:00:00.000Z" } },
    })).toBeUndefined();
    expect(parseMapContextEnvelope({ ...validContext, activeLayers: Array.from({ length: 17 }, (_, index) => `layer_${index}`) })).toBeUndefined();
  });

  it("does not treat requestedMapMode as authority or accept secrets", () => {
    const parsed = parseMapContextEnvelope({ ...validContext, requestedMapMode: "COMMAND" });
    expect(parsed?.requestedMapMode).toBe("COMMAND");
    expect(parsed).not.toHaveProperty("effectiveAudience");
    expect(parseMapContextEnvelope({ ...validContext, accessToken: "secret" })).toBeUndefined();
  });
});
