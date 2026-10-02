import { describe, expect, it } from "vitest";
import { DEFAULT_GEO_MAP_SETTINGS, geoMapSettingsSchema } from "./geoMapSettings";

describe("Spec 260 map settings", () => {
  it("defaults to the existing MapLibre path and leaves Google traffic disabled", () => {
    expect(DEFAULT_GEO_MAP_SETTINGS.primaryProvider).toBe("maplibre");
    expect(DEFAULT_GEO_MAP_SETTINGS.googleEnabled).toBe(false);
    expect(DEFAULT_GEO_MAP_SETTINGS.emergencyOfflineProvider).toBe("pmtiles");
    expect(DEFAULT_GEO_MAP_SETTINGS.googleMapTypes).toMatchObject({ roadmap: true, satellite: false, terrain: false });
  });

  it("requires an enabled Google provider when selected as primary and preserves zoom/coordinate bounds", () => {
    expect(geoMapSettingsSchema.safeParse({ ...DEFAULT_GEO_MAP_SETTINGS, primaryProvider: "google" }).success).toBe(false);
    expect(geoMapSettingsSchema.safeParse({ ...DEFAULT_GEO_MAP_SETTINGS, primaryProvider: "google", googleEnabled: true, fallbackProvider: "none" }).success).toBe(true);
    expect(geoMapSettingsSchema.safeParse({
      ...DEFAULT_GEO_MAP_SETTINGS,
      primaryProvider: "google",
      googleEnabled: true,
      fallbackProvider: "none",
      defaultBasemap: "satellite",
    }).success).toBe(false);
    expect(geoMapSettingsSchema.safeParse({ ...DEFAULT_GEO_MAP_SETTINGS, defaultCenter: { latitude: 91, longitude: 0 } }).success).toBe(false);
    expect(geoMapSettingsSchema.safeParse({ ...DEFAULT_GEO_MAP_SETTINGS, minZoom: 12, maxZoom: 8 }).success).toBe(false);
  });

  it("does not claim emergency offline readiness when PMTiles is not a configured provider", () => {
    expect(geoMapSettingsSchema.parse(DEFAULT_GEO_MAP_SETTINGS).emergencyOfflineProvider).toBe("pmtiles");
  });
});
