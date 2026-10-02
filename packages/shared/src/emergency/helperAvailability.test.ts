import { describe, expect, it } from "vitest";
import { prepareEmergencyHelperAvailability } from "./helperAvailability";

describe("privacy-safe emergency helper availability", () => {
  const now = new Date("2026-09-30T12:00:00.000Z");

  it("requires opt-in, stores only snapped coordinates, and bounds availability", () => {
    const result = prepareEmergencyHelperAvailability({ optIn: true, latitude: 13.756331, longitude: 100.501762,
      jurisdictionRef: "district-1", now, availableUntil: new Date("2026-09-30T13:00:00.000Z") });
    expect(result).toEqual({ optIn: true, latitude: 13.75, longitude: 100.5,
      jurisdictionRef: "district-1", availableUntil: new Date("2026-09-30T13:00:00.000Z") });
  });

  it("erases location immediately on opt-out", () => {
    expect(prepareEmergencyHelperAvailability({ optIn: false, latitude: 13, longitude: 100,
      jurisdictionRef: "district-1", now, availableUntil: new Date("2026-09-30T13:00:00.000Z") }))
      .toEqual({ optIn: false, latitude: null, longitude: null, jurisdictionRef: null, availableUntil: null });
  });

  it("rejects expired, overlong and unscoped helper locations", () => {
    expect(prepareEmergencyHelperAvailability({ optIn: true, latitude: 13, longitude: 100, jurisdictionRef: "d", now, availableUntil: now })).toBeNull();
    expect(prepareEmergencyHelperAvailability({ optIn: true, latitude: 13, longitude: 100, jurisdictionRef: "d", now, availableUntil: new Date(now.getTime() + 3 * 60 * 60_000) })).toBeNull();
    expect(prepareEmergencyHelperAvailability({ optIn: true, latitude: 13, longitude: 100, jurisdictionRef: "", now, availableUntil: new Date(now.getTime() + 1000) })).toBeNull();
  });
});
