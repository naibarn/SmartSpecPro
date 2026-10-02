import { describe, expect, it } from "vitest";
import { GEO_SKILL_CAPABILITIES, resolveGeoCapability } from "./capabilityResolver";
import { GOOGLE_MAP_PROVIDER_POLICY, type MapProviderResolutionInput } from "./providerResolver";

const capabilities = {
  roadmap: true, satellite: false, terrain: false, streetView: false, places: false,
  geocoding: false, routes: false, elevation: false, threeDTiles: false, offline: false,
};

const maplibre: MapProviderResolutionInput = {
  primaryProvider: "google",
  fallbackProvider: "maplibre",
  providers: {
    google: {
      id: "google", enabled: true, health: "healthy", policy: GOOGLE_MAP_PROVIDER_POLICY,
      capabilities: { ...capabilities, satellite: true, terrain: true },
      renderer: { kind: "google-raster-proxy", providerId: "google", mapType: "roadmap", sessionToken: "token-12345678",
        tileUrlTemplate: "/tiles/{z}/{x}/{y}", sessionExpiresAt: "2026-10-01T00:00:00Z", tileSize: 256, attribution: "Google Maps" },
    },
    maplibre: {
      id: "maplibre", enabled: true, health: "healthy", capabilities,
      renderer: { kind: "maplibre-style", providerId: "maplibre", styleUrl: "https://maps.example/style.json", center: [0, 0], zoom: 4 },
    },
  },
};

describe("geo capability resolver", () => {
  it("selects configured providers through provider-neutral capability IDs", () => {
    expect(resolveGeoCapability("geo.map.satellite", maplibre)).toMatchObject({ status: "available", providerId: "google" });
    expect(resolveGeoCapability("geo.map.roadmap", { ...maplibre, providers: { ...maplibre.providers, google: undefined } }))
      .toMatchObject({ status: "available", providerId: "maplibre" });
  });

  it("does not resolve unsupported Google services or invent an offline provider", () => {
    expect(resolveGeoCapability("geo.places.search", maplibre)).toMatchObject({ status: "unavailable", providerId: null });
    expect(resolveGeoCapability("geo.route", maplibre)).toMatchObject({ status: "unavailable", providerId: null });
    expect(Object.keys(GEO_SKILL_CAPABILITIES).every(name => !name.startsWith("google."))).toBe(true);
  });
});
