import { describe, expect, it } from "vitest";
import { parseEmergencyMapBounds, serializeEmergencyMapViewport } from "./mapBounds";

describe("Spec 260 bounded map viewports", () => {
  it("requires a valid geographic viewport no wider than 20 degrees", () => {
    expect(parseEmergencyMapBounds(undefined)).toBeUndefined();
    expect(parseEmergencyMapBounds("-10,-10,10,10")).toEqual([-10, -10, 10, 10]);
    expect(parseEmergencyMapBounds("-11,-10,10,10")).toBeUndefined();
    expect(parseEmergencyMapBounds("181,-5,190,5")).toBeUndefined();
    expect(parseEmergencyMapBounds("170,80,-170,84")).toBeUndefined();
  });

  it("serializes at most 20 degrees around the visible center", () => {
    const encoded = serializeEmergencyMapViewport({ west: -90, south: -45, east: 90, north: 45, centerLongitude: 179, centerLatitude: 84 });
    expect(encoded).toBe("169.000000,74.000000,180.000000,85.000000");
    const parsed = parseEmergencyMapBounds(encoded);
    expect(parsed?.[2]! - parsed?.[0]!).toBeLessThanOrEqual(20);
    expect(parsed?.[3]! - parsed?.[1]!).toBeLessThanOrEqual(20);
  });
});
