import { describe, expect, it } from "vitest";
import { generalizeEmergencyPublicCoordinate, PUBLIC_LOCATION_GRID_DEGREES } from "./publicLocation";

describe("emergency public location generalization", () => {
  it("snaps every public point to the shared coarse grid", () => {
    expect(generalizeEmergencyPublicCoordinate(100.523)).toBe(100.5);
    expect(generalizeEmergencyPublicCoordinate(13.774)).toBe(13.75);
    expect(generalizeEmergencyPublicCoordinate(-13.774)).toBe(-13.75);
    expect(PUBLIC_LOCATION_GRID_DEGREES).toBe(0.05);
  });
});
