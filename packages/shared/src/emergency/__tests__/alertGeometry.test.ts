import { describe, expect, it } from "vitest";
import { emergencyAlertGeometryIntersectsBounds, normalizeEmergencyAlertGeometry } from "../alertGeometry";

describe("normalizeEmergencyAlertGeometry", () => {
  it("snaps valid polygon coordinates to the public privacy grid", () => {
    expect(normalizeEmergencyAlertGeometry({ type: "Polygon", coordinates: [[[100.012, 13.012], [100.112, 13.012], [100.112, 13.112], [100.012, 13.012]]] }))
      .toEqual({ type: "Polygon", coordinates: [[[100, 13], [100.1, 13], [100.1, 13.1], [100, 13]]] });
  });

  it("rejects unclosed, out-of-range, unsupported, and grid-collapsed geometries", () => {
    expect(normalizeEmergencyAlertGeometry({ type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1]]] })).toBeNull();
    expect(normalizeEmergencyAlertGeometry({ type: "Polygon", coordinates: [[[181, 0], [1, 0], [1, 1], [181, 0]]] })).toBeNull();
    expect(normalizeEmergencyAlertGeometry({ type: "Point", coordinates: [0, 0] })).toBeNull();
    expect(normalizeEmergencyAlertGeometry({ type: "Polygon", coordinates: [[[0, 0], [0.001, 0], [0.001, 0.001], [0, 0]]] })).toBeNull();
  });

  it("bounds MultiPolygon size and retains only normalized coordinates", () => {
    const polygon = [[[10, 10], [10.2, 10], [10.2, 10.2], [10, 10.2], [10, 10]]];
    expect(normalizeEmergencyAlertGeometry({ type: "MultiPolygon", coordinates: [polygon] })).toEqual({ type: "MultiPolygon", coordinates: [polygon] });
    expect(normalizeEmergencyAlertGeometry({ type: "MultiPolygon", coordinates: Array(9).fill(polygon) })).toBeNull();
  });

  it("matches polygons against bounded map viewports", () => {
    const area = { type: "Polygon", coordinates: [[[100, 13], [100.1, 13], [100.1, 13.1], [100, 13.1], [100, 13]]] };
    expect(emergencyAlertGeometryIntersectsBounds(area, [100.05, 13.05, 100.2, 13.2])).toBe(true);
    expect(emergencyAlertGeometryIntersectsBounds(area, [101, 14, 102, 15])).toBe(false);
  });
});
